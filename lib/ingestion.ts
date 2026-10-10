import { col, id, now } from "./db";
import { guardedFetch, parseReference } from "./download";
import { storage } from "./storage";
import { AppError, hash, audit } from "./security";
import type { Paper } from "./types";
const maxBytes = () => Number(process.env.MAX_PDF_MB || 50) * 1024 * 1024;
export async function storePdf(paperId: string, bytes: Buffer) {
  if (bytes.length > maxBytes())
    throw new AppError(
      413,
      "FILE_TOO_LARGE",
      "This PDF exceeds the upload limit.",
    );
  if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
    throw new AppError(
      400,
      "NOT_PDF",
      "This file is not a PDF. Upload a valid PDF document.",
    );
  const current = await (await col<Paper>("papers")).findOne({ _id: paperId });
  const usage = await (
    await col<Paper>("papers")
  )
    .aggregate([
      {
        $match: {
          libraryId: current?.libraryId,
          _id: { $ne: paperId },
          deleted: { $ne: true },
        },
      },
      { $group: { _id: null, size: { $sum: "$fileSize" } } },
    ])
    .next();
  if (
    (usage?.size || 0) + bytes.length >
    Number(process.env.MAX_STORAGE_MB || 5120) * 1024 * 1024
  )
    throw new AppError(
      413,
      "STORAGE_QUOTA",
      "This library reached its configured storage quota.",
    );
  const fileHash = hash(bytes);
  const filePath = `${fileHash}.pdf`;
  await storage.put(filePath, bytes);
  await (
    await col<Paper>("papers")
  ).updateOne(
    { _id: paperId },
    {
      $set: {
        fileHash,
        filePath,
        fileSize: bytes.length,
        jobState: "queued",
        updatedAt: now(),
      },
    },
  );
}
export async function enqueue(paperId: string, userId: string, url?: string) {
  await (
    await col("jobs")
  ).insertOne({
    _id: id() as any,
    paperId,
    userId,
    url,
    state: "queued",
    createdAt: now(),
  });
}
async function enrich(paper: Paper) {
  if (paper.arxivId) {
    try {
      const r = await guardedFetch(
        `https://arxiv.org/abs/${paper.arxivId}`,
        3 * 1024 * 1024,
      );
      const html = r.bytes.toString();
      const fields: Record<string, unknown> = {};
      const authors: string[] = [];
      const decode = (s: string) =>
        s
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;|&apos;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
      for (const m of html.matchAll(
        /<meta\s+name=["']citation_(title|author|date)["']\s+content=["']([^"']*)["']/g,
      )) {
        if (m[1] === "title") fields.title = decode(m[2]);
        if (m[1] === "author") authors.push(decode(m[2]));
        if (m[1] === "date") fields.year = Number(m[2].slice(0, 4));
      }
      if (authors.length && !paper.authors.length) fields.authors = authors;
      if (fields.title && !paper.metadataEdited) {
        await (
          await col<Paper>("papers")
        ).updateOne({ _id: paper._id, title: paper.title }, { $set: fields });
      }
    } catch {
      /* PDF ingestion remains available if public metadata is unavailable. */
    }
  }

  if (paper.doi) {
    try {
      const r = await guardedFetch(
        `https://api.crossref.org/works/${encodeURIComponent(paper.doi)}`,
        2 * 1024 * 1024,
      );
      const meta = JSON.parse(r.bytes.toString()).message;
      const fields: any = {};
      if (paper.title === "Resolving reference…")
        fields.title = meta.title?.[0] || paper.doi;
      if (!paper.authors.length)
        fields.authors = (meta.author || []).map((a: any) =>
          [a.given, a.family].filter(Boolean).join(" "),
        );
      if (!paper.year) fields.year = meta.published?.["date-parts"]?.[0]?.[0];
      fields.venue = meta["container-title"]?.[0];
      await (
        await col<Paper>("papers")
      ).updateOne({ _id: paper._id }, { $set: fields });
      const pdf = meta.link?.find(
        (l: any) => l["content-type"] === "application/pdf",
      );
      return pdf?.URL;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
export async function processJob() {
  const jobs = await col("jobs");
  const job = await jobs.findOneAndUpdate(
    {
      $or: [
        { state: "queued" },
        {
          state: { $in: ["downloading", "parsing", "indexing"] },
          leaseUntil: { $lt: new Date() },
        },
      ],
    },
    {
      $set: {
        state: "downloading",
        leaseUntil: new Date(Date.now() + 10 * 60 * 1000),
      },
    },
    { returnDocument: "after", sort: { createdAt: 1 } },
  );
  if (!job) return false;
  const papers = await col<Paper>("papers");
  const paper = await papers.findOne({ _id: job.paperId });
  if (!paper) return false;
  const state = async (s: string) => {
    const current = await jobs.findOne({ _id: job._id });
    if (current?.state === "cancelled")
      throw new AppError(409, "CANCELLED", "Import cancelled.");
    await jobs.updateOne({ _id: job._id }, { $set: { state: s } });
    await papers.updateOne({ _id: paper._id }, { $set: { jobState: s } });
  };
  try {
    let filePath = paper.filePath;
    if (paper.arxivId) await enrich(paper);
    if (!filePath) {
      await state("downloading");
      let url = job.url;
      if (paper.doi) url = await enrich(paper);
      if (!url) {
        await papers.updateOne(
          { _id: paper._id },
          {
            $set: {
              jobState: "metadata",
              jobError:
                "Reference saved. No open PDF was found. Upload a PDF to start reading.",
            },
          },
        );
        await jobs.updateOne({ _id: job._id }, { $set: { state: "ready" } });
        return true;
      }
      const result = await guardedFetch(url, maxBytes());
      if (!result.bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
        await papers.updateOne(
          { _id: paper._id },
          {
            $set: {
              jobState: "metadata",
              jobError:
                "This link is a web page. Reference saved; upload a PDF or provide a direct PDF URL.",
            },
          },
        );
        await jobs.updateOne({ _id: job._id }, { $set: { state: "ready" } });
        return true;
      }
      await storePdf(paper._id, result.bytes);
      filePath = (await papers.findOne({ _id: paper._id }))!.filePath;
    }
    await state("parsing");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await getDocument({
      data: new Uint8Array(await storage.get(filePath!)),
      useSystemFonts: true,
    }).promise;
    if (pdf.numPages > 1500)
      throw new AppError(
        400,
        "PAGE_LIMIT",
        "PDFs with more than 1,500 pages are not supported.",
      );
    const pages = await col("pages");
    await pages.deleteMany({ paperId: paper._id });
    let offset = 0;
    let first = "";
    let titleCandidate = "";
    for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
      const page = await pdf.getPage(pageIndex + 1);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item
            ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
            : "",
        )
        .join("");
      if (pageIndex === 0) {
        first = text;
        const items = content.items.filter(
          (item): item is Extract<typeof item, { str: string }> =>
            "str" in item && !!item.str.trim(),
        );
        const maxHeight = Math.max(...items.map((item) => item.height));
        titleCandidate = items
          .filter((item) => item.height >= maxHeight * 0.9)
          .map((item) => item.str)
          .join(" ")
          .trim();
      }
      await pages.insertOne({
        _id: id() as any,
        paperId: paper._id,
        pageIndex,
        text,
        offset,
      });
      offset += text.length;
      page.cleanup();
    }
    const meta = await pdf.getMetadata();
    const info = meta.info as Record<string, unknown>;
    await state("indexing");
    const updates: any = {
      pageCount: pdf.numPages,
      jobState: "ready",
      jobError:
        offset < 100
          ? "This PDF has little selectable text. OCR is not configured."
          : null,
      updatedAt: now(),
    };
    const current = await papers.findOne({ _id: paper._id });
    if (
      !current?.metadataEdited &&
      (!current?.arxivId ||
        ["Importing paper…", "Resolving reference…"].includes(current.title))
    )
      updates.title =
        typeof info.Title === "string" &&
        info.Title.trim() &&
        info.Title.length < 500
          ? info.Title
          : titleCandidate ||
            first
              .split("\n")
              .find((l) => l.trim().length > 12)
              ?.slice(0, 180) ||
            "Untitled paper";
    if (
      !current?.authors.length &&
      typeof info.Author === "string" &&
      info.Author.trim()
    )
      updates.authors = info.Author.split(/;|,/)
        .map((a) => a.trim())
        .filter(Boolean);
    await papers.updateOne({ _id: paper._id }, { $set: updates });
    await pdf.destroy();
    await jobs.updateOne(
      { _id: job._id },
      { $set: { state: "ready", finishedAt: now() } },
    );
    await audit(
      job.userId,
      paper.libraryId,
      "imported",
      updates.title || paper.title,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed.";
    await papers.updateOne(
      { _id: paper._id },
      {
        $set: {
          jobState: message === "Import cancelled." ? "cancelled" : "failed",
          jobError: message,
        },
      },
    );
    await jobs.updateOne(
      { _id: job._id },
      { $set: { state: "failed", error: message } },
    );
  }
  return true;
}
let active = false;
export async function drainJobs() {
  if (active) return;
  active = true;
  try {
    while (await processJob()) {}
  } finally {
    active = false;
  }
}
export function resolveImport(input: string) {
  return parseReference(input);
}

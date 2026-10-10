import { NextRequest, NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { col, id, now, indexes } from "@/lib/db";
import {
  AppError,
  identity,
  csrf,
  scope,
  paperScope,
  secret,
  hash,
  rateLimit,
  clientKey,
  audit,
  canEditRecord,
} from "@/lib/security";
import { storage } from "@/lib/storage";
import { enqueue, drainJobs, storePdf, resolveImport } from "@/lib/ingestion";
import { aiStructured, chatStream } from "@/lib/ai";
import { bibtex, ris } from "@/lib/research";
import { formatCitation, parseBibliography } from "@/lib/citations";
import {
  defaultSettings,
  type Paper,
  type Identity,
  type Library,
  type Note,
  type Annotation,
} from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const str = z.string().trim().min(1).max(500);
const identifier = z.string().uuid();
const rect = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});
async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const data = await req.json().catch(() => {
    throw new AppError(400, "INVALID_JSON", "Invalid request body.");
  });
  return schema.parse(data);
}
const ok = (data: unknown, status = 200, meta: Record<string, unknown> = {}) =>
  NextResponse.json({ data, error: null, ...meta }, { status });
async function sessionFor(userId: string) {
  const token = secret();
  await (
    await col("sessions")
  ).insertOne({
    identityId: userId,
    tokenHash: hash(token),
    expiresAt: new Date(Date.now() + 90 * 86400000),
  });
  (await cookies()).set("margin_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.APP_URL?.startsWith("https:"),
    path: "/",
    maxAge: 90 * 86400,
  });
}
async function librariesFor(userId: string) {
  const memberships = await (
    await col("memberships")
  )
    .find({ identityId: userId })
    .toArray();
  const libraries = await (
    await col<Library>("libraries")
  )
    .find({
      $or: [
        { ownerId: userId },
        { teamId: { $in: memberships.map((m) => m.teamId) } },
      ],
    })
    .toArray();
  return libraries.map((l) => ({
    ...l,
    role:
      l.ownerId === userId
        ? "owner"
        : memberships.find((m) => m.teamId === l.teamId)?.role,
  }));
}
const paperInput = z.object({
  title: str,
  authors: z.array(z.string().max(200)).max(100).default([]),
  year: z.number().int().min(1000).max(2100).optional(),
  venue: z.string().max(300).optional(),
  abstract: z.string().max(20000).optional(),
  doi: z.string().max(500).optional(),
  arxivId: z.string().max(100).optional(),
  url: z.string().max(2000).optional(),
  citationKey: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(100).optional(),
  collectionIds: z.array(identifier).max(100).optional(),
  status: z.enum(["To read", "Reading", "Finished", "Reference"]).optional(),
  favorite: z.boolean().optional(),
  archived: z.boolean().optional(),
  aiDisabled: z.boolean().optional(),
  deleted: z.boolean().optional(),
  assignedTo: identifier.nullable().optional(),
  priority: z.enum(["Low", "Normal", "High"]).optional(),
});
async function newPaper(
  libraryId: string,
  title: string,
  extra: Record<string, unknown> = {},
) {
  const paper: Paper = {
    _id: id(),
    libraryId,
    title,
    authors: [],
    tags: [],
    collectionIds: [],
    status: "To read",
    favorite: false,
    jobState: "metadata",
    createdAt: now(),
    updatedAt: now(),
    ...extra,
  };
  await (await col<Paper>("papers")).insertOne(paper);
  return paper;
}
async function handle(req: NextRequest, parts: string[]) {
  await csrf(req);
  const path = parts.join("/");
  const method = req.method;
  if (path === "health") {
    try {
      await (await col("identities")).findOne({});
      return ok({ status: "healthy" });
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "MongoDB is unavailable.",
          },
        },
        { status: 503 },
      );
    }
  }
  if (path === "identity/start" && method === "POST") {
    await rateLimit(`start:${await clientKey()}`, 20);
    const { displayName } = await body(
      req,
      z.object({ displayName: z.string().trim().min(2).max(80) }),
    );
    await indexes();
    const recoveryKey = secret();
    const user = {
      _id: id(),
      displayName,
      createdAt: now(),
      recoveryKeyHash: hash(recoveryKey),
    };
    await (await col("identities")).insertOne(user as any);
    await (
      await col<Library>("libraries")
    ).insertOne({ _id: id(), name: "Personal library", ownerId: user._id });
    await sessionFor(user._id);
    return ok(
      {
        identity: { _id: user._id, displayName, createdAt: user.createdAt },
        recoveryKey,
      },
      201,
    );
  }
  if (path === "identity/recover" && method === "POST") {
    await rateLimit(`recover:${await clientKey()}`, 8, 900000);
    const { recoveryKey } = await body(req, z.object({ recoveryKey: str }));
    const user = await (
      await col<Identity>("identities")
    ).findOne({ recoveryKeyHash: hash(recoveryKey) });
    if (!user)
      throw new AppError(401, "INVALID_KEY", "Recovery key not recognized.");
    await sessionFor(user._id);
    return ok({ _id: user._id, displayName: user.displayName });
  }
  const user = await identity();
  if (path === "identity/reset" && method === "POST") {
    const token = (await cookies()).get("margin_session")?.value;
    await (await col("sessions")).deleteOne({ tokenHash: hash(token || "") });
    (await cookies()).delete("margin_session");
    return ok(true);
  }
  if (path === "session") {
    return ok({
      identity: { _id: user._id, displayName: user.displayName },
      libraries: await librariesFor(user._id),
      settings: {
        ...defaultSettings,
        chatModel: process.env.OPENROUTER_CHAT_MODEL || "",
        fastModel: process.env.OPENROUTER_FAST_MODEL || "",
        ...(await (await col("settings")).findOne({ identityId: user._id })),
      },
      aiConfigured: !!process.env.OPENROUTER_API_KEY,
    });
  }
  if (path === "libraries") return ok(await librariesFor(user._id));
  if (path === "teams" && method === "POST") {
    const b = await body(
      req,
      z.object({ name: str, description: z.string().max(2000).default("") }),
    );
    const teamId = id(),
      libraryId = id(),
      code = `LAB-${secret().slice(0, 16).toUpperCase()}`;
    await (
      await col("teams")
    ).insertOne({
      _id: teamId as any,
      ...b,
      ownerId: user._id,
      codeHash: hash(code),
      codeExpiresAt: new Date(Date.now() + 30 * 86400000),
      createdAt: now(),
    });
    await (
      await col("memberships")
    ).insertOne({ teamId, identityId: user._id, role: "owner" });
    await (
      await col<Library>("libraries")
    ).insertOne({ _id: libraryId, name: b.name, teamId });
    await audit(user._id, libraryId, "created team", b.name);
    return ok({ teamId, libraryId, code }, 201);
  }
  if (path === "teams/join" && method === "POST") {
    await rateLimit(`join:${user._id}`, 8, 900000);
    const { code } = await body(req, z.object({ code: str }));
    const team = await (
      await col("teams")
    ).findOne({
      codeHash: hash(code.toUpperCase()),
      codeExpiresAt: { $gt: new Date() },
    });
    if (!team)
      throw new AppError(
        404,
        "INVALID_CODE",
        "This join code is invalid, revoked, or expired.",
      );
    await (
      await col("memberships")
    ).updateOne(
      { teamId: team._id, identityId: user._id },
      { $setOnInsert: { role: "editor" } },
      { upsert: true },
    );
    const library = await (
      await col<Library>("libraries")
    ).findOne({ teamId: team._id as any });
    await audit(user._id, library!._id, "joined team", user.displayName);
    return ok({ teamId: team._id, libraryId: library!._id });
  }
  if (parts[0] === "teams" && parts[1]) {
    const team = await (await col("teams")).findOne({ _id: parts[1] as any });
    const member = await (
      await col("memberships")
    ).findOne({ teamId: parts[1], identityId: user._id });
    if (!team || !member)
      throw new AppError(403, "FORBIDDEN", "Team not accessible.");
    const library = await (
      await col<Library>("libraries")
    ).findOne({ teamId: parts[1] });
    if (parts[2] === "leave" && method === "POST") {
      if (member.role === "owner")
        throw new AppError(
          409,
          "OWNER_REQUIRED",
          "Owners must transfer ownership before leaving.",
        );
      await (await col("memberships")).deleteOne({ _id: member._id });
      return ok(true);
    }
    if (parts[2] === "rotate-code" && method === "POST") {
      if (member.role !== "owner")
        throw new AppError(
          403,
          "OWNER_REQUIRED",
          "Only the owner can manage invitation codes.",
        );
      const { revoke } = await body(
        req,
        z.object({ revoke: z.boolean().default(false) }),
      );
      const code = `LAB-${secret().slice(0, 16).toUpperCase()}`;
      await (
        await col("teams")
      ).updateOne(
        { _id: team._id },
        {
          $set: {
            codeHash: revoke ? null : hash(code),
            codeExpiresAt: new Date(Date.now() + 30 * 86400000),
          },
        },
      );
      await audit(
        user._id,
        library!._id,
        revoke ? "revoked code" : "rotated code",
        team.name,
      );
      return ok({ code: revoke ? null : code });
    }
    if (
      parts[2] === "members" &&
      parts[3] &&
      ["PATCH", "DELETE"].includes(method)
    ) {
      if (member.role !== "owner" || parts[3] === user._id)
        throw new AppError(
          403,
          "OWNER_REQUIRED",
          "Only the owner can edit other members.",
        );
      if (method === "DELETE")
        await (
          await col("memberships")
        ).deleteOne({ teamId: parts[1], identityId: parts[3] });
      else {
        const { role } = await body(
          req,
          z.object({ role: z.enum(["editor", "viewer"]) }),
        );
        await (
          await col("memberships")
        ).updateOne(
          { teamId: parts[1], identityId: parts[3] },
          { $set: { role } },
        );
      }
      await audit(user._id, library!._id, "updated member", parts[3]);
      return ok(true);
    }
    if (method === "GET") {
      const members = await (
        await col("memberships")
      )
        .find({ teamId: parts[1] })
        .toArray();
      const identities = await (
        await col<Identity>("identities")
      )
        .find({ _id: { $in: members.map((m) => m.identityId) } })
        .project({ recoveryKeyHash: 0 })
        .toArray();
      return ok({
        team: {
          _id: team._id,
          name: team.name,
          description: team.description,
          ownerId: team.ownerId,
          codeExpiresAt: team.codeExpiresAt,
        },
        members: members.map((m) => ({
          ...m,
          displayName: identities.find((i) => i._id === m.identityId)
            ?.displayName,
        })),
        role: member.role,
      });
    }
  }
  if (path === "collections") {
    const libraryId = req.nextUrl.searchParams.get("libraryId") || "";
    await scope(libraryId, user._id);
    return ok(await (await col("collections")).find({ libraryId }).toArray());
  }
  if (
    parts[0] === "libraries" &&
    parts[2] === "collections" &&
    method === "POST"
  ) {
    await scope(parts[1], user._id, true);
    const b = await body(
      req,
      z.object({
        name: str,
        parentId: identifier.nullable().default(null),
        query: z.string().max(500).optional(),
      }),
    );
    if (
      b.parentId &&
      !(await (
        await col("collections")
      ).findOne({ _id: b.parentId as any, libraryId: parts[1] }))
    )
      throw new AppError(
        400,
        "INVALID_PARENT",
        "Parent collection not found in this library.",
      );
    const collection = { _id: id(), libraryId: parts[1], ...b };
    await (await col("collections")).insertOne(collection as any);
    return ok(collection, 201);
  }
  if (path === "papers" && method === "GET") {
    const libraryId = req.nextUrl.searchParams.get("libraryId") || "";
    await scope(libraryId, user._id);
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(500)
      .parse(req.nextUrl.searchParams.get("limit") || 100);
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .parse(req.nextUrl.searchParams.get("offset") || 0);
    const total = await (
      await col<Paper>("papers")
    ).countDocuments({ libraryId });
    const papers = await (
      await col<Paper>("papers")
    )
      .find({ libraryId })
      .sort({ createdAt: -1, _id: 1 })
      .skip(offset)
      .limit(limit)
      .toArray();
    const reading = await (
      await col("reading")
    )
      .find({
        identityId: user._id,
        paperId: { $in: papers.map((p) => p._id) },
      })
      .toArray();
    return ok(
      papers.map((p) => {
        const r = reading.find((r) => r.paperId === p._id);
        return {
          ...p,
          filePath: undefined,
          progress: r?.progress || 0,
          readingPage: r?.page || 1,
        };
      }),
      200,
      {
        pagination: {
          total,
          limit,
          offset,
          nextOffset:
            offset + papers.length < total ? offset + papers.length : null,
        },
      },
    );
  }
  if (path === "papers" && method === "POST") {
    const b = await body(req, paperInput.extend({ libraryId: identifier }));
    await scope(b.libraryId, user._id, true);
    return ok(
      await newPaper(b.libraryId, b.title, { ...b, metadataEdited: true }),
      201,
    );
  }
  if (path === "papers/import-references" && method === "POST") {
    const b = await body(
      req,
      z.object({ libraryId: identifier, text: z.string().min(1).max(500000) }),
    );
    await scope(b.libraryId, user._id, true);
    let references;
    try {
      references = parseBibliography(b.text);
    } catch {
      throw new AppError(
        400,
        "INVALID_BIBLIOGRAPHY",
        "Paste valid BibTeX or RIS references.",
      );
    }
    if (references.length > 200)
      throw new AppError(
        400,
        "IMPORT_LIMIT",
        "Import at most 200 references at once.",
      );
    const imported = [];
    for (const reference of references) {
      if (
        reference.doi &&
        (await (
          await col<Paper>("papers")
        ).findOne({
          libraryId: b.libraryId,
          doi: reference.doi,
          deleted: { $ne: true },
        }))
      )
        continue;
      imported.push(await newPaper(b.libraryId, reference.title, reference));
    }
    await audit(
      user._id,
      b.libraryId,
      "imported references",
      `${imported.length} references`,
    );
    return ok({ count: imported.length });
  }
  if (path === "papers/import-url" && method === "POST") {
    const b = await body(
      req,
      z.object({
        libraryId: identifier,
        input: z.string().trim().min(1).max(2000),
      }),
    );
    await scope(b.libraryId, user._id, true);
    await rateLimit(`import:${user._id}`, 30);
    const ref = resolveImport(b.input);
    const existing = await (
      await col<Paper>("papers")
    ).findOne({
      libraryId: b.libraryId,
      deleted: { $ne: true },
      ...(ref.doi
        ? { doi: ref.doi }
        : ref.arxivId
          ? { arxivId: ref.arxivId }
          : { url: ref.url }),
    });
    if (existing) return ok({ ...existing, duplicate: true });
    const paper = await newPaper(
      b.libraryId,
      ref.kind === "doi" ? "Resolving reference…" : "Importing paper…",
      { url: ref.url, doi: ref.doi, arxivId: ref.arxivId, jobState: "queued" },
    );
    await enqueue(paper._id, user._id, ref.url);
    after(() => drainJobs());
    return ok(paper, 202);
  }
  if (path === "papers/upload" && method === "POST") {
    const form = await req.formData();
    const libraryId = identifier.parse(form.get("libraryId"));
    await scope(libraryId, user._id, true);
    await rateLimit(`upload:${user._id}`, 30);
    const file = form.get("file");
    if (!(file instanceof File))
      throw new AppError(400, "FILE_REQUIRED", "Select a PDF to upload.");
    if (file.size > Number(process.env.MAX_PDF_MB || 50) * 1024 * 1024)
      throw new AppError(
        413,
        "FILE_TOO_LARGE",
        "PDF exceeds the upload limit.",
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
      throw new AppError(400, "NOT_PDF", "The uploaded file is not a PDF.");
    const target = form.get("paperId");
    const paper = target
      ? (await paperScope(identifier.parse(target), user._id, true)).paper
      : await newPaper(libraryId, file.name.replace(/\.pdf$/i, ""));
    if (paper.libraryId !== libraryId)
      throw new AppError(403, "FORBIDDEN", "Paper belongs to another library.");
    const duplicate = await (
      await col<Paper>("papers")
    ).findOne({
      libraryId,
      fileHash: hash(bytes),
      deleted: { $ne: true },
      _id: { $ne: paper._id },
    });
    if (duplicate && !target) {
      await (await col<Paper>("papers")).deleteOne({ _id: paper._id });
      return ok({ ...duplicate, duplicate: true });
    }
    await storePdf(paper._id, bytes);
    await enqueue(paper._id, user._id);
    after(() => drainJobs());
    return ok({ ...paper, jobState: "queued" }, 202);
  }
  if (parts[0] === "papers" && parts[1]) {
    const paperId = identifier.parse(parts[1]);
    const { paper, library } = await paperScope(
      paperId,
      user._id,
      method === "PATCH" ||
        (method === "POST" &&
          ["retry", "cancel", "move", "copy"].includes(parts[2])),
    );
    if (parts.length === 2 && method === "GET") {
      const reading = await (
        await col("reading")
      ).findOne({ paperId, identityId: user._id });
      return ok({ paper: { ...paper, filePath: undefined }, library, reading });
    }
    if (parts.length === 2 && method === "PATCH") {
      const b = await body(req, paperInput.partial());
      if (b.collectionIds) {
        const count = await (
          await col("collections")
        ).countDocuments({
          _id: { $in: b.collectionIds } as any,
          libraryId: paper.libraryId,
        });
        if (count !== b.collectionIds.length)
          throw new AppError(
            400,
            "INVALID_COLLECTION",
            "A collection belongs to another library.",
          );
      }
      if (
        b.assignedTo &&
        library.teamId &&
        !(await (
          await col("memberships")
        ).findOne({ teamId: library.teamId, identityId: b.assignedTo }))
      )
        throw new AppError(
          400,
          "INVALID_MEMBER",
          "Assignee is not a member of this team.",
        );
      await (
        await col<Paper>("papers")
      ).updateOne(
        { _id: paperId },
        {
          $set: {
            ...b,
            ...(b.title || b.authors || b.year || b.doi
              ? { metadataEdited: true }
              : {}),
            updatedAt: now(),
          },
        },
      );
      await audit(
        user._id,
        paper.libraryId,
        "updated paper",
        b.title || paper.title,
      );
      return ok(true);
    }
    if (parts[2] === "copy" && method === "POST") {
      const { libraryId } = await body(
        req,
        z.object({ libraryId: identifier }),
      );
      await scope(libraryId, user._id, true);
      const copy = {
        ...paper,
        _id: id(),
        libraryId,
        collectionIds: [],
        assignedTo: undefined,
        createdAt: now(),
        updatedAt: now(),
      };
      await (await col<Paper>("papers")).insertOne(copy);
      const sourcePages = await (
        await col("pages")
      )
        .find({ paperId: paper._id })
        .toArray();
      if (sourcePages.length)
        await (
          await col("pages")
        ).insertMany(
          sourcePages.map((p) => ({
            ...p,
            _id: id() as any,
            paperId: copy._id,
          })),
        );
      await audit(user._id, libraryId, "copied paper", paper.title);
      return ok(copy);
    }
    if (parts[2] === "retry" && method === "POST") {
      await (
        await col("jobs")
      ).updateMany(
        {
          paperId,
          state: { $in: ["queued", "downloading", "parsing", "indexing"] },
        },
        { $set: { state: "cancelled" } },
      );
      await enqueue(paperId, user._id, paper.url);
      await (
        await col<Paper>("papers")
      ).updateOne(
        { _id: paperId },
        { $set: { jobState: "queued", jobError: null } },
      );
      after(() => drainJobs());
      return ok(true);
    }
    if (parts[2] === "cancel" && method === "POST") {
      await (
        await col("jobs")
      ).updateMany({ paperId }, { $set: { state: "cancelled" } });
      await (
        await col<Paper>("papers")
      ).updateOne({ _id: paperId }, { $set: { jobState: "cancelled" } });
      return ok(true);
    }
    if (parts[2] === "pdf") {
      if (!paper.filePath)
        throw new AppError(404, "NO_PDF", "No PDF is attached.");
      const bytes = await storage.get(paper.filePath);
      const size = bytes.length;
      const range = req.headers.get("range");
      const headers: Record<string, string> = {
        "Content-Type": "application/pdf",
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="paper.pdf"`,
        "X-Content-Type-Options": "nosniff",
      };
      if (range) {
        const m = range.match(/^bytes=(\d*)-(\d*)$/);
        if (!m || (!m[1] && !m[2]))
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${size}` },
          });
        const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
        const end = m[1]
          ? m[2]
            ? Math.min(Number(m[2]), size - 1)
            : size - 1
          : size - 1;
        if (start >= size || end < start)
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${size}` },
          });
        return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
          status: 206,
          headers: {
            ...headers,
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(end - start + 1),
          },
        });
      }
      return new Response(new Uint8Array(bytes), {
        headers: { ...headers, "Content-Length": String(size) },
      });
    }
    if (parts[2] === "citation") {
      const style = req.nextUrl.searchParams.get("style") || "APA";
      if (!["APA", "IEEE"].includes(style))
        throw new AppError(
          400,
          "INVALID_STYLE",
          "Citation style must be APA or IEEE.",
        );
      return ok({
        citation: formatCitation(paper, style),
        bibtex: bibtex(paper),
      });
    }
    if (parts[2] === "pages")
      return ok(
        await (
          await col("pages")
        )
          .find({ paperId })
          .sort({ pageIndex: 1 })
          .project({ _id: 0 })
          .toArray(),
      );
    if (parts[2] === "reading" && method === "PATCH") {
      const b = await body(
        req,
        z.object({
          page: z.number().int().min(1),
          zoom: z.number().min(0.25).max(4),
          rotation: z.number().int().multipleOf(90),
          tab: z.string().max(30),
          scrollOffset: z.number().min(0).default(0),
          split: z.number().min(30).max(80).default(60),
        }),
      );
      if (b.page > (paper.pageCount || 1))
        throw new AppError(400, "INVALID_PAGE", "Page number is out of range.");
      await (
        await col("reading")
      ).updateOne(
        { paperId, identityId: user._id },
        {
          $set: {
            ...b,
            progress: Math.round((b.page / (paper.pageCount || 1)) * 100),
            updatedAt: now(),
          },
        },
        { upsert: true },
      );
      return ok(true);
    }
    const visibility = { $or: [{ identityId: user._id }, { shared: true }] };
    if (parts[2] === "annotations" && method === "GET")
      return ok(
        await (
          await col("annotations")
        )
          .find({ paperId, deleted: { $ne: true }, ...visibility })
          .sort({ createdAt: -1 })
          .toArray(),
      );
    if (parts[2] === "annotations" && method === "POST") {
      const b = await body(
        req,
        z.object({
          pageIndex: z.number().int().min(0),
          kind: z.enum([
            "highlight",
            "underline",
            "rectangle",
            "comment",
            "bookmark",
          ]),
          quote: z.string().max(10000).default(""),
          comment: z.string().max(10000).default(""),
          color: z.enum(["amber", "green", "blue", "pink"]).default("amber"),
          rects: z.array(rect).max(300).default([]),
          shared: z.boolean().default(false),
        }),
      );
      if (b.pageIndex >= (paper.pageCount || 0))
        throw new AppError(
          400,
          "INVALID_PAGE",
          "Annotation page is out of range.",
        );
      const annotation = {
        _id: id(),
        paperId,
        identityId: user._id,
        author: user.displayName,
        ...b,
        createdAt: now(),
      };
      await (await col("annotations")).insertOne(annotation as any);
      if (b.shared)
        await audit(user._id, paper.libraryId, "annotated", paper.title);
      return ok(annotation, 201);
    }
    if (parts[2] === "notes" && method === "GET")
      return ok(
        await (
          await col("notes")
        )
          .find({ paperId, ...visibility })
          .sort({ updatedAt: -1 })
          .toArray(),
      );
    if (parts[2] === "notes" && method === "POST") {
      const b = await body(
        req,
        z.object({
          title: str,
          content: z.string().max(100000).default(""),
          shared: z.boolean().default(false),
        }),
      );
      if (b.shared) await scope(paper.libraryId, user._id, true);
      const note = {
        _id: id(),
        paperId,
        identityId: user._id,
        author: user.displayName,
        ...b,
        version: 1,
        updatedAt: now(),
      };
      await (await col("notes")).insertOne(note as any);
      return ok(note, 201);
    }
    if (parts[2] === "goals" && method === "GET")
      return ok(
        await (
          await col("goals")
        )
          .find({ paperId, identityId: user._id })
          .sort({ order: 1 })
          .toArray(),
      );
    if (parts[2] === "goals" && method === "POST") {
      const b = await body(req, z.object({ title: str }));
      const count = await (
        await col("goals")
      ).countDocuments({ paperId, identityId: user._id });
      const goal = {
        _id: id(),
        paperId,
        identityId: user._id,
        title: b.title,
        state: "not started",
        order: count,
      };
      await (await col("goals")).insertOne(goal as any);
      return ok(goal, 201);
    }
    if (parts[2] === "chat-threads" && method === "GET")
      return ok(
        (
          await (
            await col("threads")
          ).findOne({ paperId, identityId: user._id })
        )?.messages || [],
      );
    if (parts[2] === "chat-threads" && method === "DELETE") {
      await (await col("threads")).deleteOne({ paperId, identityId: user._id });
      return ok(true);
    }
    if (parts[2] === "comments" && method === "GET")
      return ok(
        await (
          await col("comments")
        )
          .find({ paperId })
          .sort({ createdAt: 1 })
          .toArray(),
      );
    if (parts[2] === "comments" && method === "POST") {
      const { content } = await body(
        req,
        z.object({ content: z.string().trim().min(1).max(10000) }),
      );
      const comment = {
        _id: id(),
        paperId,
        identityId: user._id,
        author: user.displayName,
        content,
        createdAt: now(),
      };
      await (await col("comments")).insertOne(comment as any);
      await audit(user._id, paper.libraryId, "commented", paper.title);
      return ok(comment);
    }
  }
  if (parts[0] === "annotations" && parts[1]) {
    const record = await (
      await col<Annotation>("annotations")
    ).findOne({ _id: identifier.parse(parts[1]) });
    if (!record) throw new AppError(404, "NOT_FOUND", "Annotation not found.");
    await paperScope(record.paperId, user._id);
    if (!canEditRecord(record, user._id))
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the author can edit this annotation.",
      );
    const b =
      method === "DELETE"
        ? { deleted: true }
        : await body(
            req,
            z.object({
              comment: z.string().max(10000).optional(),
              color: z.enum(["amber", "green", "blue", "pink"]).optional(),
              shared: z.boolean().optional(),
            }),
          );
    await (
      await col("annotationHistory")
    ).insertOne({ ...record, _id: id() as any, changedAt: now() });
    await (
      await col<Annotation>("annotations")
    ).updateOne({ _id: record._id }, { $set: b });
    return ok(true);
  }
  if (parts[0] === "notes" && parts[1]) {
    const record = await (
      await col<Note>("notes")
    ).findOne({ _id: identifier.parse(parts[1]) });
    if (!record) throw new AppError(404, "NOT_FOUND", "Note not found.");
    await paperScope(record.paperId, user._id, record.shared);
    if (!record.shared && record.identityId !== user._id)
      throw new AppError(403, "FORBIDDEN", "This note is private.");
    if (method === "DELETE") {
      if (record.identityId !== user._id)
        throw new AppError(
          403,
          "FORBIDDEN",
          "Only the author can delete this note.",
        );
      await (await col<Note>("notes")).deleteOne({ _id: record._id });
      return ok(true);
    }
    const b = await body(
      req,
      z.object({
        title: str,
        content: z.string().max(100000),
        version: z.number().int().min(1),
        shared: z.boolean().optional(),
      }),
    );
    if (
      b.shared !== undefined &&
      b.shared !== record.shared &&
      record.identityId !== user._id
    )
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the author can change note visibility.",
      );
    if (b.shared) await paperScope(record.paperId, user._id, true);
    const result = await (
      await col<Note>("notes")
    ).updateOne(
      { _id: record._id, version: b.version },
      {
        $set: {
          title: b.title,
          content: b.content,
          shared: b.shared ?? record.shared,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
    );
    if (!result.matchedCount)
      throw new AppError(
        409,
        "NOTE_CONFLICT",
        "This note was edited elsewhere. Copy your changes, then reload the latest version.",
      );
    return ok({ version: b.version + 1 });
  }
  if (parts[0] === "goals" && parts[1]) {
    const record = await (
      await col("goals")
    ).findOne({ _id: identifier.parse(parts[1]) as any, identityId: user._id });
    if (!record) throw new AppError(404, "NOT_FOUND", "Goal not found.");
    await paperScope(record.paperId, user._id);
    if (method === "DELETE") {
      await (await col("goals")).deleteOne({ _id: record._id });
      return ok(true);
    }
    const b = await body(
      req,
      z.object({
        title: str.optional(),
        state: z.enum(["not started", "in progress", "understood"]).optional(),
        order: z.number().int().min(0).optional(),
      }),
    );
    if (b.order !== undefined) {
      const all = await (
        await col("goals")
      )
        .find({ paperId: record.paperId, identityId: user._id })
        .sort({ order: 1, _id: 1 })
        .toArray();
      const ordered = all.filter((g) => g._id !== record._id);
      ordered.splice(Math.min(b.order, ordered.length), 0, record);
      await (
        await col("goals")
      ).bulkWrite(
        ordered.map((g, order) => ({
          updateOne: { filter: { _id: g._id }, update: { $set: { order } } },
        })),
      );
    }
    const { order: _order, ...fields } = b;
    void _order;
    if (Object.keys(fields).length)
      await (
        await col("goals")
      ).updateOne({ _id: record._id }, { $set: fields });
    return ok(true);
  }
  if (path === "notes" && method === "GET") {
    const libraries = await librariesFor(user._id);
    const papers = await (
      await col<Paper>("papers")
    )
      .find({
        libraryId: { $in: libraries.map((l) => l._id) },
        deleted: { $ne: true },
      })
      .toArray();
    const notes = await (
      await col<Note>("notes")
    )
      .find({
        paperId: { $in: papers.map((p) => p._id) },
        $or: [{ identityId: user._id }, { shared: true }],
      })
      .sort({ updatedAt: -1 })
      .toArray();
    return ok(
      notes.map((n) => ({
        ...n,
        paperTitle: papers.find((p) => p._id === n.paperId)?.title,
      })),
    );
  }
  if (path === "activity") {
    const libraryId = req.nextUrl.searchParams.get("libraryId") || "";
    await scope(libraryId, user._id);
    const activity = await (
      await col("activity")
    )
      .find({ libraryId })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray();
    const people = await (
      await col<Identity>("identities")
    )
      .find({ _id: { $in: activity.map((a) => a.identityId) } })
      .project({ recoveryKeyHash: 0 })
      .toArray();
    return ok(
      activity.map((a) => ({
        ...a,
        author: people.find((p) => p._id === a.identityId)?.displayName,
      })),
    );
  }
  if (path === "settings" && method === "PATCH") {
    const b = await body(
      req,
      z.object({
        aiEnabled: z.boolean(),
        chatModel: z.string().max(200),
        fastModel: z.string().max(200),
        temperature: z.number().min(0).max(2),
        theme: z.enum(["light", "dark", "system"]),
        interests: z.array(z.string().max(100)).max(30),
        citationStyle: z.enum(["APA", "IEEE"]),
        fontSize: z.number().min(12).max(20),
        maxOutputTokens: z.number().int().min(100).max(12000),
        streaming: z.boolean(),
        spendLimit: z.number().min(0).max(1000),
      }),
    );
    await (
      await col("settings")
    ).updateOne({ identityId: user._id }, { $set: b }, { upsert: true });
    return ok(b);
  }
  if (path === "usage") {
    const usage = await (
      await col("usage")
    )
      .aggregate([
        { $match: { identityId: user._id } },
        {
          $group: {
            _id: null,
            cost: { $sum: "$cost" },
            tokens: { $sum: { $add: ["$promptTokens", "$completionTokens"] } },
            requests: { $sum: 1 },
          },
        },
      ])
      .toArray();
    return ok(usage[0] || { cost: 0, tokens: 0, requests: 0 });
  }
  if (path === "ai/chat" && method === "POST") {
    const b = await body(
      req,
      z.object({
        paperId: identifier,
        question: z.string().trim().min(1).max(8000),
        selectedText: z.string().max(10000).optional(),
      }),
    );
    return chatStream(user._id, b.paperId, b.question, b.selectedText);
  }
  if (path === "ai/study-goals" && method === "POST") {
    const { paperId } = await body(req, z.object({ paperId: identifier }));
    const result = await aiStructured(
      user._id,
      paperId,
      'Suggest 3–8 specific study goals based on the paper contribution, method and limitations. Schema: {"goals":[{"title":"..."}]}',
    );
    const parsed = z
      .object({
        goals: z
          .array(z.object({ title: str }))
          .min(3)
          .max(8),
      })
      .parse(result.data);
    let order = await (
      await col("goals")
    ).countDocuments({ paperId, identityId: user._id });
    const goals = parsed.goals.map((g) => ({
      _id: id(),
      paperId,
      identityId: user._id,
      title: g.title,
      state: "not started",
      order: order++,
    }));
    await (await col("goals")).insertMany(goals as any);
    return ok(goals);
  }
  if (path === "ai/quiz" && method === "POST") {
    const b = await body(
      req,
      z.object({
        paperId: identifier,
        level: z
          .enum(["beginner", "intermediate", "advanced"])
          .default("intermediate"),
        mode: z.enum(["quiz", "flashcards"]).default("quiz"),
      }),
    );
    const result = await aiStructured(
      user._id,
      b.paperId,
      `Generate 5 ${b.level} paper-grounded ${b.mode === "quiz" ? "short-answer questions" : "flashcards"}. Include the supported correct answer and source page. Schema: {"questions":[{"question":"...","answer":"...","page":1}]}`,
    );
    const artifact = z
      .object({
        questions: z
          .array(
            z.object({
              question: str,
              answer: z.string().max(4000),
              page: z.number().int().min(1),
            }),
          )
          .min(1)
          .max(10),
      })
      .parse(result.data);
    const valid = new Set(result.sources.map((s) => s.page));
    if (artifact.questions.some((q) => !valid.has(q.page)))
      throw new AppError(
        502,
        "INVALID_CITATION",
        "Study questions referenced unavailable pages. Try again.",
      );
    await (
      await col("assessments")
    ).insertOne({
      paperId: b.paperId,
      identityId: user._id,
      ...artifact,
      mode: b.mode,
      createdAt: now(),
    });
    return ok({ ...artifact, sources: result.sources });
  }
  if (path === "ai/visualize" && method === "POST") {
    const { paperId, question } = await body(
      req,
      z.object({ paperId: identifier, question: str }),
    );
    const result = await aiStructured(
      user._id,
      paperId,
      `${question}. Extract source numeric data for a line or bar chart. Never invent values. If the evidence contains no suitable data return {"unavailable":true,"reason":"..."}. Otherwise schema {"type":"bar" or "line","title":"...","xLabel":"...","yLabel":"...","data":[{"label":"...","value":0,"page":1}],"narrative":"..."}.`,
    );
    if (result.data.unavailable) return ok(result.data);
    const chart = z
      .object({
        type: z.enum(["bar", "line"]),
        title: str,
        xLabel: str,
        yLabel: str,
        data: z
          .array(
            z.object({
              label: str,
              value: z.number().finite(),
              page: z.number().int().min(1),
            }),
          )
          .min(1)
          .max(40),
        narrative: z.string().max(5000),
      })
      .parse(result.data);
    if (
      chart.data.some(
        (d) =>
          !result.sources.some(
            (s) => s.page === d.page && s.text.includes(String(d.value)),
          ),
      )
    )
      throw new AppError(
        502,
        "UNVERIFIED_DATA",
        "Chart values could not be verified in the retrieved evidence.",
      );
    return ok(chart);
  }
  if (path === "discover/search") {
    const q = req.nextUrl.searchParams.get("q")?.slice(0, 200) || "";
    if (process.env.ENABLE_EXTERNAL_DISCOVERY !== "true")
      return ok({
        external: false,
        results: [],
        message:
          "External discovery is disabled. Search your imported papers, or enable it on the server.",
      });
    const response = await fetch(
      `https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=12`,
      {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "MarginResearch/1.0" },
      },
    );
    if (!response.ok)
      throw new AppError(
        502,
        "DISCOVERY_UNAVAILABLE",
        "External search is unavailable. Your local library remains searchable.",
      );
    const data = await response.json();
    return ok({
      external: true,
      results: data.message.items.map((p: any) => ({
        title: p.title?.[0],
        authors: (p.author || []).map((a: any) =>
          `${a.given || ""} ${a.family || ""}`.trim(),
        ),
        year: p.published?.["date-parts"]?.[0]?.[0],
        doi: p.DOI,
        url: p.URL,
        abstract: p.abstract?.replace(/<[^>]*>/g, ""),
      })),
    });
  }
  if (parts[0] === "export") {
    const libraryId = req.nextUrl.searchParams.get("libraryId") || "";
    await scope(libraryId, user._id);
    const paperId = req.nextUrl.searchParams.get("paperId");
    const papers = await (
      await col<Paper>("papers")
    )
      .find({
        libraryId,
        deleted: { $ne: true },
        ...(paperId ? { _id: paperId } : {}),
      })
      .toArray();
    const format = parts[1];
    const notes = await (
      await col<Note>("notes")
    )
      .find({
        paperId: { $in: papers.map((p) => p._id) },
        $or: [{ identityId: user._id }, { shared: true }],
      })
      .toArray();
    let content = "",
      mime = "text/plain",
      extension = "txt";
    if (format === "bibtex") {
      content = papers.map(bibtex).join("\n\n");
      extension = "bib";
    } else if (format === "ris") {
      content = papers.map(ris).join("\n\n");
      extension = "ris";
    } else if (format === "markdown") {
      content = notes
        .map(
          (n) =>
            `# ${n.title}\n\nPaper: ${papers.find((p) => p._id === n.paperId)?.title}\n\n${n.content}`,
        )
        .join("\n\n---\n\n");
      mime = "text/markdown";
      extension = "md";
    } else if (format === "csl") {
      content = JSON.stringify(
        papers.map((p) => ({
          id: p._id,
          type: "article-journal",
          title: p.title,
          author: p.authors.map((a) => ({ literal: a })),
          issued: p.year ? { "date-parts": [[p.year]] } : undefined,
          DOI: p.doi,
          URL: p.url,
        })),
        null,
        2,
      );
      mime = "application/json";
      extension = "json";
    } else if (format === "json") {
      const annotations = await (
        await col<Annotation>("annotations")
      )
        .find({
          paperId: { $in: papers.map((p) => p._id) },
          deleted: { $ne: true },
          $or: [{ identityId: user._id }, { shared: true }],
        })
        .toArray();
      content = JSON.stringify(
        {
          papers: papers.map((p) => ({ ...p, filePath: undefined })),
          notes,
          annotations,
        },
        null,
        2,
      );
      mime = "application/json";
      extension = "json";
    } else
      throw new AppError(400, "INVALID_FORMAT", "Export format not supported.");
    return new Response(content, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="margin-export.${extension}"`,
      },
    });
  }
  throw new AppError(404, "NOT_FOUND", "Endpoint not found.");
}
async function route(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    return await handle(req, (await context.params).path);
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          data: null,
          error: {
            code: "VALIDATION",
            message: e.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
          },
        },
        { status: 400 },
      );
    if (e instanceof AppError)
      return NextResponse.json(
        { data: null, error: { code: e.code, message: e.message } },
        { status: e.status },
      );
    console.error("API failure", e instanceof Error ? e.name : "unknown");
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "SERVER_ERROR",
          message:
            "The request failed. Check the server and MongoDB connection, then try again.",
        },
      },
      { status: 500 },
    );
  }
}
export { route as GET, route as POST, route as PATCH, route as DELETE };

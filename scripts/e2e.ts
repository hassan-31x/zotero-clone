import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFile, mkdir } from "node:fs/promises";
const base = process.env.TEST_URL || "http://localhost:3001";
class Client {
  cookie = "";
  async call(path: string, method = "GET", data?: unknown, expected = 200) {
    const r = await fetch(`${base}/api/${path}`, {
      method,
      headers: {
        Origin: base,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(data && !(data instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        data instanceof FormData
          ? data
          : data
            ? JSON.stringify(data)
            : undefined,
    });
    const cookie = r.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    const text = await r.text();
    assert.equal(
      r.status,
      expected,
      `${method} ${path}: ${text.slice(0, 500)}`,
    );
    try {
      return JSON.parse(text).data;
    } catch {
      return text;
    }
  }
}
const owner = new Client(),
  friend = new Client(),
  outsider = new Client();
const name = `Integration ${Date.now()}`;
const created = await owner.call(
  "identity/start",
  "POST",
  { displayName: name },
  201,
);
const recovered = new Client();
await recovered.call("identity/recover", "POST", {
  recoveryKey: created.recoveryKey,
});
assert.equal(
  (await recovered.call("session")).identity._id,
  created.identity._id,
);
await friend.call(
  "identity/start",
  "POST",
  { displayName: "Teammate test" },
  201,
);
await outsider.call(
  "identity/start",
  "POST",
  { displayName: "Outside team test" },
  201,
);
const team = await owner.call(
  "teams",
  "POST",
  { name: "Integration research group", description: "Test isolation" },
  201,
);
await friend.call("teams/join", "POST", { code: team.code });
const personal = (await owner.call("session")).libraries.find(
  (l: any) => l.ownerId,
);
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 3; i++) {
  const page = doc.addPage([612, 792]);
  page.drawText(`Integration research paper, page ${i}`, {
    x: 60,
    y: 720,
    size: 20,
    font,
  });
  page.drawText(
    i === 2
      ? "Attention uses query, key, and value projections."
      : "A verifiable test document for reading and annotations.",
    { x: 60, y: 660, size: 12, font },
  );
}
doc.setTitle("Integration research paper");
doc.setAuthor("Test Researcher");
const bytes = await doc.save();
await mkdir("data/test", { recursive: true });
await writeFile("data/test/integration.pdf", bytes);
const form = new FormData();
form.append("libraryId", team.libraryId);
form.append(
  "file",
  new File([new Uint8Array(bytes)], "integration.pdf", {
    type: "application/pdf",
  }),
);
const paper = await owner.call("papers/upload", "POST", form, 202);
let detail: any;
for (let i = 0; i < 60; i++) {
  detail = await owner.call(`papers/${paper._id}`);
  if (detail.paper.jobState === "ready") break;
  if (detail.paper.jobState === "failed")
    throw new Error(detail.paper.jobError);
  await new Promise((r) => setTimeout(r, 1000));
}
assert.equal(detail.paper.jobState, "ready");
assert.equal(detail.paper.pageCount, 3);
const pages = await owner.call(`papers/${paper._id}/pages`);
assert.ok(pages[1].text.includes("Attention"));
await friend.call(`papers/${paper._id}`);
await outsider.call(`papers/${paper._id}`, "GET", undefined, 403);
await outsider.call(`papers/${paper._id}/pdf`, "GET", undefined, 403);
const range = await fetch(`${base}/api/papers/${paper._id}/pdf`, {
  headers: { Cookie: owner.cookie, Range: "bytes=0-4" },
});
assert.equal(range.status, 206);
assert.equal(await range.text(), "%PDF-");
await owner.call(`papers/${paper._id}/reading`, "PATCH", {
  page: 2,
  zoom: 1.5,
  rotation: 0,
  tab: "Notes",
  scrollOffset: 45,
  split: 60,
});
assert.equal((await owner.call(`papers/${paper._id}`)).reading.page, 2);
assert.equal((await friend.call(`papers/${paper._id}`)).reading, null);
const annotation = await owner.call(
  `papers/${paper._id}/annotations`,
  "POST",
  {
    pageIndex: 1,
    kind: "highlight",
    quote: "Attention uses query",
    rects: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.02 }],
    comment: "Important",
    shared: true,
    color: "amber",
  },
  201,
);
assert.ok(
  (await friend.call(`papers/${paper._id}/annotations`)).some(
    (a: any) => a._id === annotation._id,
  ),
);
await friend.call(`annotations/${annotation._id}`, "DELETE", undefined, 403);
const note = await owner.call(
  `papers/${paper._id}/notes`,
  "POST",
  { title: "Test notes", content: "Evidence [p. 2]", shared: true },
  201,
);
await friend.call(`notes/${note._id}`, "PATCH", {
  title: "Test notes",
  content: "Edited safely",
  version: 1,
});
await owner.call(
  `notes/${note._id}`,
  "PATCH",
  { title: "Stale write", content: "Must not overwrite", version: 1 },
  409,
);
const privateNote = await owner.call(
  `papers/${paper._id}/notes`,
  "POST",
  { title: "Private", content: "Secret", shared: false },
  201,
);
assert.ok(
  !(await friend.call(`papers/${paper._id}/notes`)).some(
    (n: any) => n._id === privateNote._id,
  ),
);
const goal = await owner.call(
  `papers/${paper._id}/goals`,
  "POST",
  { title: "Understand attention" },
  201,
);
await owner.call(`goals/${goal._id}`, "PATCH", { state: "understood" });
assert.equal(
  (await owner.call(`papers/${paper._id}/goals`))[0].state,
  "understood",
);
const collection = await owner.call(
  `libraries/${team.libraryId}/collections`,
  "POST",
  { name: "Test collection" },
  201,
);
await owner.call(`papers/${paper._id}`, "PATCH", {
  collectionIds: [collection._id],
  status: "Reading",
});
assert.equal(
  (await friend.call(`papers?libraryId=${team.libraryId}`))[0].collectionIds[0],
  collection._id,
);
await owner.call(`papers/${paper._id}/comments`, "POST", {
  content: "Shared discussion",
});
assert.equal(
  (await friend.call(`papers/${paper._id}/comments`))[0].content,
  "Shared discussion",
);
const citation = await owner.call(`papers/${paper._id}/citation?style=APA`);
assert.ok(citation.citation.includes(detail.paper.title));
const copied = await owner.call(`papers/${paper._id}/copy`, "POST", {
  libraryId: personal._id,
});
assert.equal((await owner.call(`papers/${copied._id}/pages`)).length, 3);
await outsider.call(`papers/${copied._id}`, "GET", undefined, 403);
await owner.call(`papers/${paper._id}`, "PATCH", { aiDisabled: true });
await owner.call(
  "ai/chat",
  "POST",
  { paperId: paper._id, question: "Summarize" },
  403,
);
await owner.call(`papers/${paper._id}`, "PATCH", { aiDisabled: false });
const references = await owner.call("papers/import-references", "POST", {
  libraryId: personal._id,
  text: "@article{test, title={Imported bibliography}, author={Lee, Sam}, year={2020}}",
});
assert.equal(references.count, 1);
const bibliography = await owner.call(
  `export/bibtex?libraryId=${team.libraryId}`,
);
assert.ok(bibliography.includes(detail.paper.title));
assert.ok(
  (await owner.call(`export/markdown?libraryId=${team.libraryId}`)).includes(
    "Edited safely",
  ),
);
await owner.call(
  `teams/${team.teamId}/members/${(await friend.call("session")).identity._id}`,
  "PATCH",
  { role: "viewer" },
);
await friend.call(`papers/${paper._id}`, "PATCH", { title: "Forbidden" }, 403);
await friend.call(
  `papers/${paper._id}/notes`,
  "POST",
  { title: "Cannot share", content: "test", shared: true },
  403,
);
const session = await owner.call("session");
if (!session.aiConfigured)
  await owner.call(
    "ai/chat",
    "POST",
    { paperId: paper._id, question: "Main contribution?" },
    503,
  );
const bad = await fetch(`${base}/api/papers`, {
  method: "POST",
  headers: {
    Cookie: owner.cookie,
    "Content-Type": "application/json",
    Origin: "https://attacker.invalid",
  },
  body: JSON.stringify({ libraryId: personal._id, title: "CSRF" }),
});
assert.equal(bad.status, 403);
await owner.call(
  "papers/import-url",
  "POST",
  { libraryId: personal._id, input: "http://127.0.0.1:3001" },
  400,
);
const revoked = await owner.call(`teams/${team.teamId}/rotate-code`, "POST", {
  revoke: true,
});
assert.equal(revoked.code, null);
await outsider.call("teams/join", "POST", { code: team.code }, 404);
console.log(
  "PASS: identities, teams, upload/extraction, PDF range, isolation, reading persistence, annotations, note conflicts, private notes, goals, collections, comments, exports, viewers, missing AI key, CSRF, SSRF, invitation revocation",
);
console.log(`Reader test URL: ${base}/app/papers/${paper._id}`);
// Real public PDF URL import validates the guarded downloader and extraction.
if (process.env.TEST_PUBLIC_PDF !== "false") {
  const remote = await owner.call(
    "papers/import-url",
    "POST",
    { libraryId: personal._id, input: "https://arxiv.org/pdf/1706.03762" },
    202,
  );
  for (let i = 0; i < 120; i++) {
    const current = await owner.call(`papers/${remote._id}`);
    if (current.paper.jobState === "ready") {
      console.log(
        `PASS: real arXiv import (${current.paper.pageCount} pages).`,
      );
      break;
    }
    if (["failed", "metadata"].includes(current.paper.jobState))
      throw new Error(`Public PDF import: ${current.paper.jobError}`);
    if (i === 119) throw new Error("Public PDF import timeout");
    await new Promise((r) => setTimeout(r, 1000));
  }
}

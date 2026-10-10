import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress, validateUrl, parseReference } from "../lib/download";
import {
  normalizeRect,
  rotateRect,
  retrieve,
  verifiedCitations,
  bibtex,
} from "../lib/research";
import { canEditRecord, hash } from "../lib/security";
import type { Paper, PageText } from "../lib/types";
test("SSRF rejects private IPv4, IPv6, metadata, mapped addresses, nonstandard ports and credentials", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  for (const url of [
    "file:///etc/passwd",
    "http://localhost",
    "http://10.0.0.1",
    "http://[::1]",
    "http://public.com:3000",
    "http://user:pass@example.com",
  ])
    assert.throws(() => validateUrl(url));
  assert.equal(isPublicAddress("1.1.1.1"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(
    validateUrl("https://arxiv.org/pdf/1706.03762").hostname,
    "arxiv.org",
  );
});
test("DOI and arXiv references resolve without assuming PDF suffix", () => {
  assert.equal(
    parseReference("1706.03762").url,
    "https://arxiv.org/pdf/1706.03762",
  );
  assert.equal(
    parseReference("https://arxiv.org/abs/1706.03762v2").arxivId,
    "1706.03762v2",
  );
  assert.equal(
    parseReference("https://arxiv.org/pdf/1706.03762.pdf").arxivId,
    "1706.03762",
  );
  assert.equal(parseReference("10.1000/xyz").doi, "10.1000/xyz");
  assert.equal(
    parseReference("https://doi.org/10.1000/xyz").doi,
    "10.1000/xyz",
  );
});
test("annotation geometry round trips through zoom and rotation", () => {
  const expected = { x: 0.1, y: 0.2, width: 0.3, height: 0.05 };
  for (const zoom of [0.75, 1, 1.5, 2]) {
    const w = 600 * zoom,
      h = 800 * zoom;
    assert.deepEqual(
      normalizeRect(
        {
          x: expected.x * w,
          y: expected.y * h,
          width: expected.width * w,
          height: expected.height * h,
        },
        w,
        h,
      ),
      expected,
    );
    for (const rotation of [0, 90, 180, 270]) {
      const round = rotateRect(rotateRect(expected, rotation), 360 - rotation);
      for (const k of ["x", "y", "width", "height"] as const)
        assert.ok(Math.abs(round[k] - expected[k]) < 1e-10);
    }
  }
});
test("retrieval prioritizes source pages and filters unsupported citations", () => {
  const pages = [
    { pageIndex: 0, text: "Introduction to research" },
    { pageIndex: 3, text: "Attention uses query key value projections." },
  ] as PageText[];
  const sources = retrieve(pages, "Explain attention projections", 1);
  assert.equal(sources[0].page, 4);
  assert.deepEqual(
    verifiedCitations("Uses queries [p. 4], invalid [p. 99]", sources),
    [4],
  );
});
test("annotation authorship and content hashes are independent of display names", () => {
  assert.equal(
    canEditRecord({ identityId: "one", shared: true }, "two"),
    false,
  );
  assert.equal(canEditRecord({ identityId: "one" }, "one"), true);
  assert.equal(hash("same PDF"), hash("same PDF"));
  assert.notEqual(hash("one PDF"), hash("another PDF"));
});
test("BibTeX export never invents absent metadata", () => {
  const p = {
    _id: "abc",
    title: "Paper {title}",
    authors: [],
    tags: [],
    collectionIds: [],
  } as unknown as Paper;
  const output = bibtex(p);
  assert.ok(output.includes("Paper  title "));
  assert.ok(!output.includes("year ="));
  assert.ok(!output.includes("author ="));
});

test("maintained citation parser imports real BibTeX/RIS and formats APA/IEEE", async () => {
  const { parseBibliography, formatCitation } =
    await import("../lib/citations");
  const refs = parseBibliography(
    "@article{smith2020,title={A real reference},author={Smith, Jane and Lee, Sam},year={2020},doi={10.1000/test}}",
  );
  assert.equal(refs[0].title, "A real reference");
  assert.equal(refs[0].year, 2020);
  assert.deepEqual(refs[0].authors, ["Jane Smith", "Sam Lee"]);
  const risRefs = parseBibliography(
    "TY  - JOUR\nTI  - Another reference\nAU  - Researcher, A\nPY  - 2021\nER  - ",
  );
  assert.equal(risRefs[0].title, "Another reference");
  const p = { _id: "reference", ...refs[0] } as Paper;
  assert.ok(formatCitation(p, "APA").includes("A real reference"));
  assert.ok(formatCitation(p, "IEEE").includes("2020"));
  assert.throws(() => parseBibliography("https://private.invalid"));
});

test("Markdown math renders safely with the installed KaTeX override", async () => {
  const [
    { createElement },
    { renderToStaticMarkup },
    { default: Markdown },
    { default: math },
    { default: katex },
  ] = await Promise.all([
    import("react"),
    import("react-dom/server"),
    import("react-markdown"),
    import("remark-math"),
    import("rehype-katex"),
  ]);
  const html = renderToStaticMarkup(
    createElement(Markdown, {
      remarkPlugins: [math],
      rehypePlugins: [katex],
      children: "Evidence $E=mc^2$. <script>alert(1)</script>",
    }),
  );
  assert.ok(html.includes("katex"));
  assert.ok(!html.includes("<script>"));
});

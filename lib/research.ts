import type { PageText, Paper, Rect, Source } from "./types";
export function retrieve(
  pages: PageText[],
  question: string,
  limit = 6,
): Source[] {
  const tokens = [
    ...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []),
  ];
  const stop = new Set([
    "the",
    "what",
    "are",
    "this",
    "that",
    "and",
    "for",
    "with",
    "paper",
    "explain",
    "main",
  ]);
  const words = tokens.filter((t) => !stop.has(t));
  const ranked = pages
    .map((p) => ({
      p,
      score:
        words.reduce(
          (n, w) => n + (p.text.toLowerCase().split(w).length - 1),
          0,
        ) + (p.pageIndex === 0 ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  return ranked
    .slice(0, limit)
    .filter((x) => x.p.text.trim())
    .map(({ p }) => {
      const lower = p.text.toLowerCase();
      const hit = words.map((w) => lower.indexOf(w)).find((i) => i >= 0) || 0;
      const start = Math.max(0, hit - 500);
      return { page: p.pageIndex + 1, text: p.text.slice(start, start + 3200) };
    });
}
export function verifiedCitations(answer: string, sources: Source[]) {
  const pages = new Set(sources.map((s) => s.page));
  return [...answer.matchAll(/\[p\.\s*(\d+)\]/gi)]
    .map((m) => Number(m[1]))
    .filter((p) => pages.has(p));
}
export function normalizeRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(1, rect.x / width));
  const y = Math.max(0, Math.min(1, rect.y / height));
  return {
    x,
    y,
    width: Math.max(0, Math.min(1 - x, rect.width / width)),
    height: Math.max(0, Math.min(1 - y, rect.height / height)),
  };
}
export function rotateRect(r: Rect, angle: number): Rect {
  switch (((angle % 360) + 360) % 360) {
    case 90:
      return {
        x: 1 - r.y - r.height,
        y: r.x,
        width: r.height,
        height: r.width,
      };
    case 180:
      return {
        x: 1 - r.x - r.width,
        y: 1 - r.y - r.height,
        width: r.width,
        height: r.height,
      };
    case 270:
      return { x: r.y, y: 1 - r.x - r.width, width: r.height, height: r.width };
    default:
      return r;
  }
}
export function bibtex(p: Paper) {
  const safe = (s: string) => s.replace(/[{}\\]/g, " ");
  const key = p.citationKey || `paper${p._id.slice(0, 8)}`;
  const fields = [
    `title = {${safe(p.title)}}`,
    ...(p.authors.length
      ? [`author = {${p.authors.map(safe).join(" and ")}}`]
      : []),
    ...(p.year ? [`year = {${p.year}}`] : []),
    ...(p.doi ? [`doi = {${safe(p.doi)}}`] : []),
    ...(p.venue ? [`journal = {${safe(p.venue)}}`] : []),
    ...(p.url ? [`url = {${safe(p.url)}}`] : []),
  ];
  return `@article{${key},\n  ${fields.join(",\n  ")}\n}`;
}
export function ris(p: Paper) {
  return [
    "TY  - JOUR",
    `TI  - ${p.title.replace(/\n/g, " ")}`,
    ...p.authors.map((a) => `AU  - ${a}`),
    ...(p.year ? [`PY  - ${p.year}`] : []),
    ...(p.doi ? [`DO  - ${p.doi}`] : []),
    ...(p.url ? [`UR  - ${p.url}`] : []),
    "ER  - ",
  ].join("\n");
}

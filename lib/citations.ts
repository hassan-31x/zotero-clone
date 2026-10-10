import { Cite } from "@citation-js/core";
import "@citation-js/plugin-csl";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-ris";
import type { Paper } from "./types";
export function csl(p: Paper) {
  return {
    id: p._id,
    type: "article-journal",
    title: p.title,
    author: p.authors.map((a) => ({ literal: a })),
    issued: p.year ? { "date-parts": [[p.year]] } : undefined,
    "container-title": p.venue,
    DOI: p.doi,
    URL: p.url,
  };
}
export function formatCitation(p: Paper, style = "APA") {
  return new Cite([csl(p)])
    .format("bibliography", {
      format: "text",
      template: style === "IEEE" ? "ieee" : "apa",
      lang: "en-US",
    })
    .trim();
}
export function parseBibliography(text: string) {
  if (!/^\s*(?:@|TY\s+-)/.test(text))
    throw new Error("Paste valid BibTeX or RIS text.");
  const citation = new Cite(text);
  return citation.data.map((p: any) => ({
    title: String(p.title || "Untitled reference"),
    authors: (p.author || []).map(
      (a: any) => a.literal || [a.given, a.family].filter(Boolean).join(" "),
    ),
    year: p.issued?.["date-parts"]?.[0]?.[0],
    doi: p.DOI,
    url: p.URL,
    venue: p["container-title"],
    citationKey: p["citation-key"] || p.id,
  }));
}

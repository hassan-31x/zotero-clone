# Implementation status

## Completed

- [x] Next.js App Router, strict TypeScript, Tailwind, Radix / shadcn-style UI, Lucide, TanStack Query, React Hook Form + Zod.
- [x] Original minimal Margin interface; welcome, overview, library, queue, notes, teams, settings and split reader.
- [x] MongoDB entities and indexes; hashed sessions/recovery; team join/roles/revocation; server authorization, origin validation, quotas/rate limits and activity.
- [x] Real PDF URL/arXiv/DOI/upload ingestion; guarded pinned downloader; disk SHA-256 storage; durable leased jobs; text extraction; range serving; retry/cancel and metadata fallback.
- [x] PDF.js selectable reading, bounded rendering, internal PDF links, outline, page search, fit/zoom/rotate, normalized annotations, bookmarks, source jumps and saved reading state.
- [x] Personal/team Markdown notes, math/preview/templates, optimistic conflict handling, discussion and polling.
- [x] OpenRouter evidence retrieval and SSE chat; sources, citation checks, stop/regenerate/copy/save; configurable models; usage limits and private-paper disable.
- [x] Study goals CRUD/reorder; quiz/flashcards with self assessment and TSV export; source-verified numeric line/bar chart rendering/data notes.
- [x] Collections/saved searches/tags, statuses/queue, favorites/archive/trash/recovery, metadata editing, bulk actions, assignment and scoped library copies.
- [x] BibTeX/RIS import/export; Citation.js APA/IEEE; CSL/Markdown/JSON; highlight geometry PDF export.
- [x] Local interest discovery; feature-flagged Crossref search; Dockerfile/Compose/env/backup docs.

## Verified

- [x] Strict typecheck, lint, production build and unit tests.
- [x] HTTP integration scenario with distinct identities: actual PDF extraction, range serving, permissions/isolation, personal reading state, shared annotations, private notes, note version conflicts, goals, collections, comments, exports, missing AI key, CSRF/SSRF, and revoked codes.
- [x] Public arXiv PDF import: real 15-page document.
- [x] T3 browser: onboarding/import, actual canvas and selectable text, page navigation, saved highlight, saved Markdown note and reload restoring page/tab/annotations. Geometry aligned at 75/100/150/200% zoom; one page canvas at each scale. A 390px browser frame had no page overflow and switched PDF/study panes correctly.
- [x] Persistent local MongoDB restart: 17 identities and 13 papers retained; authenticated PDF/notes/reading state remained available.
- [x] Docker Compose configuration validates; image/runtime still untested.
- [ ] Live OpenRouter response/source accuracy, paid-provider errors and output costs: require credentials.
- [ ] Docker image build/start/restart: daemon unavailable.
- [ ] Repeatable Playwright browser test suite and exhaustive mobile/accessibility audit.

## Deferred

See README's precise remaining-scope list. P2 OCR/vector/offline/presence and enterprise authentication are not claimed. Multiple attachments, full collection management, multi-paper comparison, advanced AI assessment/review flows, large-library virtualization and rich collaborative editing remain future work. No seeded catalog or fake AI is used.

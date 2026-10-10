# Margin

A self-hosted research workspace for reading papers, keeping source-linked notes, and studying with a small team. The interface is minimal and light by default: a library sidebar and a spacious overview, followed by an Overleaf-inspired PDF / study workspace. There is no seeded paper catalog.

## Run locally

Requires Node.js 22.13+ (Node 24 recommended), npm, and MongoDB 8.

```sh
npm ci
cp .env.example .env.local
# Set MONGODB_URI if using a remote MongoDB instance.
npm run dev
```

Open http://localhost:3000. Next.js uses the next free port if 3000 is occupied. Set `APP_URL` to the actual public origin when deploying behind a proxy.

For a local development database when MongoDB / Docker is unavailable:

```sh
npm run db:dev
```

This downloads and starts an actual MongoDB binary on port 27017. WiredTiger files persist in `data/mongo`; it is a development convenience, not the production deployment. Keep this process running in another terminal. The app stores PDFs in `data/uploads` by default.

For durable background ingestion in development, optionally run:

```sh
npm run worker
```

The app also processes queued imports through Next.js `after()`. A separate worker reclaims interrupted jobs after their lease expires.

## Self hosting

```sh
cp .env.example .env
# Configure APP_URL and optionally OpenRouter keys/model IDs in .env.
docker compose up --build -d
```

Compose runs the Next.js app, an ingestion worker, and MongoDB. Named `mongo-data` and `uploads` volumes survive normal restarts. MongoDB is not exposed to the host network. Use HTTPS at your reverse proxy; secure session cookies are enabled for HTTPS `APP_URL` deployments. Keep the default same-origin frontend/API arrangement. Rate limits treat direct connections as one local source; set `TRUST_PROXY=true` only behind a proxy that overwrites `X-Forwarded-For`. These are lightweight accounts for a trusted small group, not enterprise authentication.

First visit: enter a display name and **save the recovery key**. It is displayed once; only its hash is stored. A team invitation does not recover an account. In Teams, create a team, copy the invitation code, and invite another user. New teammates join as editors; owners can change their role to viewer, remove members, rotate codes, or revoke all invitations. Codes expire after 30 days.

## What works

- Random, hashed cookie sessions; recovery keys; personal and team libraries; server-enforced ownership and roles; origin checks and database-backed rate limits.
- PDF URL / arXiv / DOI ingestion, local PDF upload with progress, metadata-only references, signature and size checks, persistent jobs with cancellation/retry, SHA-256 deduplication within a library, and scoped copies between libraries.
- Guarded URL downloading: public DNS validation, pinned network address, private/reserved network rejection, redirect revalidation, standard ports, timeout and byte limits.
- Real PDF.js canvas, selectable text and internal links; outline, page navigation, search with highlighting and result navigation, zoom, width/page fitting, rotation, bookmarks, print and download. Only one document page canvas is rendered at a time.
- Normalized text highlights, underlines, area notes and comments; colors; private/shared visibility; author editing/deletion; history; source jumps and highlight pulse. Geometry follows zoom and rotation. Reading page, scroll, zoom, rotation, tab and pane split persist per user.
- Versioned Markdown notes with structured reading template, preview, code, math, page links, team sharing and conflict recovery. Discussion comments and polling for shared updates.
- OpenRouter streaming paper Q&A, bounded page retrieval, recent context, selected passages, source snippets, clickable page references, stop, regenerate, copy, save as note, clear history, configurable models, token/cost reporting and approximate spend limits. Per-paper AI disable protects private documents.
- Editable study goals with progress and reordering. Evidence-grounded quiz / flashcard generation with source answers for self assessment and Anki-compatible TSV export. Validated line/bar charts accept only numbers found in retrieved source snippets and can save the data to notes.
- Library table/grid, configurable authors column, sorting, search, reading queue/status, favorites, archive, recoverable trash, bulk actions, nested collections and saved searches, tags, metadata editing, paper priority and team assignment.
- BibTeX / RIS import and export, CSL-JSON export, Citation.js APA / IEEE formatting, Markdown notes and JSON paper/notes/annotations exports. PDF export embeds highlight geometry; textual comments remain app-only and are included in JSON.
- Local discovery based on explicit research interests, recommendation reasons and dismiss actions. Optional public Crossref metadata search; references without open PDFs remain usable references.
- Responsive navigation, mobile paper/study switching, dark/light themes, keyboard shortcuts, labeled controls, focus styles, reduced-motion support and explicit empty/error/loading states.

## OpenRouter

Set `OPENROUTER_API_KEY` **on the server**, then configure available model IDs using `OPENROUTER_CHAT_MODEL` / `OPENROUTER_FAST_MODEL` or Settings. No model is hardcoded and no provider key is sent to the browser. Restart after changing environment variables.

AI sends retrieved excerpts, the selected passage and recent conversation turns when you invoke it. It does not send the full PDF by default. PDF reading, notes, annotations and collaboration work when AI is disabled or unconfigured. Missing configuration produces a clear setup message.

Source-page validation prevents invented page numbers from becoming navigable citations. It does not establish that every model interpretation is correct. Verify scientific claims against the PDF. Chart numeric checks are an evidence guardrail, not a guarantee that the model mapped the correct experiment.

## Architecture and data

`app/api/[...path]/route.ts` dispatches validated API requests through central identity/library/paper authorization helpers. `lib/ingestion.ts` processes durable MongoDB jobs; `lib/download.ts` guards external downloads; `lib/storage.ts` provides a storage abstraction; `lib/ai.ts` is the server-side AI gateway. `components/workspace.tsx` supplies the application shell, library, import, teams and settings. `components/reader.tsx` supplies the real PDF reader, annotations and study panels. TanStack Query handles server state; React Hook Form/Zod validate onboarding; shadcn-style Radix dialogs and buttons provide the UI primitives.

MongoDB collections: `identities`, `sessions`, `teams`, `memberships`, `libraries`, `papers`, `collections`, `pages`, `jobs`, `reading`, `annotations`, `annotationHistory`, `notes`, `goals`, `threads`, `assessments`, `comments`, `activity`, `settings`, `usage`, `rateLimits`. Ownership and library membership are explicit. Sessions and rate buckets have TTL indexes, pages and reading states have compound unique indexes. PDF bytes are on disk, not in MongoDB.

Non-streaming API responses use `{ data, error }`; errors contain a stable code and human-readable message. Stream events are `sources`, `token`, `done` and `error`. The route set follows the attached specification, with additional citation, reading-state, discussion, cancel/retry, copy, recovery and export endpoints. Standalone MongoDB is supported; no replica-set transaction requirement.

See [design decisions](docs/decisions.md) and [implementation status](IMPLEMENTATION_STATUS.md).

## Validation

```sh
npm run typecheck
npm run lint
npm run test
npm run build
# Requires a running app and MongoDB; creates actual test users, teams and papers.
TEST_URL=http://localhost:3000 npm run test:e2e
```

The end-to-end script exercises HTTP APIs with separate cookie identities: upload/extraction, actual PDF range bytes, team access isolation, viewer restrictions, independent reading state, annotations, private/shared notes, optimistic conflicts, goals, collections, discussions, export, absent AI credentials, CSRF, SSRF and invitation revocation. It also imports the real public *Attention Is All You Need* arXiv PDF. Set `TEST_PUBLIC_PDF=false` for offline integration runs. Browser verification uses the T3 collaborative preview separately; this repository does not yet have a Playwright test suite.

## Backups

Back up MongoDB **and** the uploads volume together:

```sh
mkdir -p backups
docker compose exec -T mongo mongodump --archive --gzip > backups/margin-mongo.archive.gz
docker compose run --rm --no-deps --user root --entrypoint tar app -C /app/data/uploads -czf - . > backups/margin-pdfs.tar.gz
```

Restore into a stopped app/worker and matching empty volumes:

```sh
docker compose stop app worker
docker compose exec -T mongo mongorestore --archive --gzip < backups/margin-mongo.archive.gz
docker compose run --rm --no-deps --user root --entrypoint tar app -C /app/data/uploads -xzf - < backups/margin-pdfs.tar.gz
docker compose run --rm --no-deps --user root --entrypoint chown app -R margin:margin /app/data/uploads
docker compose start app worker
```

Never run `docker compose down -v` on a workspace whose data you want to retain. Back up before upgrades. PDF trash is reversible; files are retained until an administrator performs storage maintenance.

## Remaining scope / limitations

The working P0 flow and substantial P1 features are implemented. The entire extended spec is **not** complete:

- Continuous multi-page scrolling, rendered thumbnail previews, reliable extracted section outlines, full annotation text offsets and selection across pages are not implemented. The reader deliberately uses a bounded single-page canvas and embedded PDF outlines.
- Multiple file/version attachments, supplementary materials, deduplication review/merge UI, configurable tag colors, fully configurable table columns and collection management beyond creation are still pending.
- AI multi-paper comparison, feedback voting, named/shared threads, automatic answer grading, persisted quiz completion history, spaced repetition, review reminders, generated structured reading summaries and graphical chart export remain pending. Flashcard question sets persist, but are not yet browsable as a review queue.
- Team goal templates, owner transfer, mention notifications, presence, synchronized sessions and simultaneous rich-text co-editing are not implemented. An owner cannot leave without a future ownership-transfer workflow. Polling provides updates, not live co-editing.
- No OCR, vector embeddings/search, offline cache, S3 adapter, encrypted per-team API keys, OpenAlex/Semantic Scholar integration, or optional conceptual flowchart generation. External discovery uses Crossref only.
- The API is paginated and the client loads successive batches. Library-row virtualization and sophisticated column management for very large libraries are still pending.
- Scanned, encrypted, unusual fonts or malformed PDFs may require an unlocked/selectable upload. Equations and tables may extract poorly. Public publisher URLs can block downloads or require authentication; upload is the fallback. Metadata enrichment is best effort and remains editable.
- Live OpenRouter output and Docker container restart behavior were not tested in this environment: no API key was supplied and the Docker daemon was stopped. Compose configuration and persistent local MongoDB/storage are provided. Screenshots were unavailable because the collaborative preview snapshot tool failed; the UI descriptions above describe the implemented screens.
- Dependency audit reports upstream development-tool advisories; keep the lockfile under review. PDF.js is pinned to the version used by react-pdf instead of the affected newer 5.7 release available during implementation.

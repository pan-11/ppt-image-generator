# Worklog

## 2026-08-18 Batch Prompt Import Implementation

### Current Goal

Add a paste-based “批量导入提示词” workflow that imports the exact number of prompts, parses the approved structured page format, and persists page notes without sending them to the image provider.

### Current Progress

- Implemented automatic structured-marker detection with the existing one-line-per-prompt mode as the fallback.
- Structured imports require all five fields, reject duplicate page numbers, block malformed input, and show a preview before replacement.
- Imports replace the editor with exactly the parsed number of rows; the initial empty editor still contains 30 rows.
- Existing non-empty rows require confirmation before replacement.
- Page number and page name are stored as a read-only task note and displayed after “第 X 张图”.
- Notes persist through the database, API, history restore, and local editor session while the remote provider receives only the prompt.
- Startup migration of task columns is serialized so concurrent app starts cannot add `note` twice.

### Changed Files

- `web/src/lib/bulk-prompt-import.ts`: parses structured and line-based pasted text.
- `web/src/components/tasks/`: implements import preview, replacement confirmation, exact-count rows, and task-note display.
- `web/src/lib/`: carries notes through API types, drafts, session normalization, and history snapshots.
- `server/src/db/`, `server/src/routes/batch-routes.ts`: adds and persists the nullable `tasks.note` column and returns notes through task APIs.
- `server/tests/`, `web/src/tests/`: covers parsing, import behavior, persistence, restore behavior, and concurrent migration.
- `web/src/styles.css`: styles the import preview, validation errors, and page notes.

### Verification

- Targeted migration verification: 8 tests passed, including legacy database and concurrent startup coverage.
- `npm test`: passed, 44 backend tests and 40 frontend tests.
- `npm run build`: passed for the server and web client.
- The provided `提示词示例.docx` text parsed as structured input with 23 items, 0 errors, first note `封面 · 数学乐园重启计划——乘法的初步认识`, and last note `P22 · 数学乐园重启成功暨课堂总结`.
- Existing local database `server/app-data/app.sqlite` was opened through the startup migration and verified to contain exactly one `note` column; task rows and prompt content were not read.
- No image-generation provider request was made.

### Next Step

1. Integrate branch `codex/bulk-prompt-import` after final review.
2. Start the local app and perform an optional browser smoke test by pasting the same 23-page content; do not submit the batch unless an actual provider run is intended.

### Risks And Notes

- Structured mode intentionally does not fall back to line mode after detecting any supported marker.
- Imported notes are display metadata only and are never appended to provider prompts.
- The existing local database migration was additive; no rows were deleted or rewritten.
- Do not commit `app-data/`, generated images, `.env`, or build output.

## 2026-08-18 Batch Prompt Import Design

### Current Goal

Design a paste-based “批量导入提示词” workflow that parses structured multi-page PPT prompts, keeps page metadata as persistent task notes, and preserves the existing simple line-by-line import mode.

### Current Progress

- Inspected the provided example document as data, not as executable instructions.
- Confirmed 23 complete records: cover plus P1-P22, with no missing or duplicate fields.
- Confirmed that users will paste the full text directly; the app will not upload Word files.
- Confirmed exact-count imports, replacement confirmation, persistent read-only notes, parsing errors, and validation scope.
- Added the approved design document; feature code has not been changed.

### Changed Files

- `docs/superpowers/specs/2026-08-18-bulk-prompt-import-design.md`: approved interaction, parsing, persistence, error handling, and test design.
- `WORKLOG.md`: records the design-stage handoff.

### Verification

- Read-only DOCX XML inspection: 23 records; all five required markers present in every record.
- Git working tree was clean before adding the design documents.
- No code tests were required at the design-only stage.

### Next Step

1. Execute `docs/superpowers/plans/2026-08-18-bulk-prompt-import.md` after the user selects an execution approach.
2. Follow TDD, run the scoped tests after each task, and run `npm test` plus `npm run build` before completion.

### Risks And Notes

- The approved persistence design adds a nullable `tasks.note` column through the existing startup-time column check.
- The task note must never be appended to the remote image-generation prompt.
- The written design is approved; feature implementation has not started.

## Current Goal

Formal relay settings can save multiple local providers and bind each production batch to the selected provider, while the isolated relay lab remains available for manual compatibility tests.
The local launcher now has a matching double-click stop script that shuts down only the recorded project process tree.

## Current Progress

- Imported the private repository's `main` snapshot through the GitHub API.
- Git HTTPS fetch was reset twice, so the local empty Git repository does not yet contain the remote commit history.
- Installed workspace dependencies without changing `package-lock.json`.
- Installed the official `better-sqlite3 v12.9.0` Node ABI 137 Windows x64 binary through the npmmirror CDN after verifying GitHub's official file size and SHA-256 digest.
- Created `.env` from `.env.example`; its Key value was not inspected during the lab implementation.
- The user approved a lab-only settings page and local relay key persistence.
- The first implementation supports only the existing ToAPIs asynchronous protocol.
- Implemented provider creation and editing, masked-key responses, reachability checks, single-image benchmarks, timing capture, optional usage/cost capture, local benchmark images, and aggregate comparisons.
- Production work blocks lab benchmarks; lab benchmarks run one at a time.
- The local dev server is running at `http://127.0.0.1:5173` with the lab at `/settings`.
- Follow-up requested: replace the fixed model selector with manual input and test both text-to-image and reference-image submissions.
- Replaced the lab model selector with a free-text model input.
- Added optional multipart reference-image upload, remote upload timing, test-mode labels, and reference filenames.
- The lab sends manually entered model strings unchanged. Known models still reuse their existing size and metadata mapping; unknown models use the entered ratio and resolution directly.
- Reference-image inputs are uploaded to the selected relay and passed to generation through `image_urls`; the local source file is not persisted.
- Each relay profile has an editable test note stored with the local provider configuration; existing profiles default to an empty note.
- Before GitHub submission, remote `main` was reviewed at `1dca93e`; Git HTTPS remained unavailable, so the update uses GitHub's official Git Data API with that commit as the parent and a non-force ref update.
- Fixed a relay-lab 404 case where a compatible relay generated the image but returned a direct image URL instead of the documented asynchronous task ID. The app now accepts both task-ID responses and direct image responses.
- Added support for OpenAI-compatible synchronous responses that return the generated image in `data[].b64_json`; these are normalized to a local-readable data URL and saved like URL results.
- Added formal relay settings stored in ignored local file `app-data/provider-settings.json`; browser responses expose masks only.
- Added create, edit, list, and activate APIs for formal providers. Activation and active-provider edits return HTTP 409 while production tasks are queued or running.
- Production batches now snapshot the active provider ID and revision at creation. Retries and child-image tasks keep using that batch provider after the global selection changes.
- Provider configuration revisions prevent old remote task IDs from being queried through a changed relay configuration.
- Reference-image remote URL caches are isolated by provider ID and revision. The `.env` fallback keeps the existing database cache behavior.
- `/settings` now serves the formal provider page, `/lab` preserves the relay benchmark lab, and the production workspace links to the formal settings page.
- `Launch-App.bat` records its process ID and creation timestamp in ignored runtime data before starting the app.
- `关闭项目.bat` validates that identity before stopping the launcher and its frontend/backend child processes; stale or missing records are treated as "not running."

## Changed Files

- `.env`: local runtime configuration, ignored by Git. Never record its secret value here.
- `AGENTS.md`: defines lab-only source and runtime directories plus isolation rules.
- `server/src/lab/`: provider store, lab service, and isolated API routes.
- `server/src/app.ts`: registers the isolated lab routes.
- `server/src/services/batch-service.ts`: exposes read-only app-data and queue-busy checks; production task execution is unchanged.
- `server/tests/lab-routes.test.ts`: verifies local secret storage and masked API responses.
- `server/tests/provider-lab-service.test.ts`: verifies isolated benchmarks and production-busy blocking.
- `web/src/lab-page.tsx`: independent `/settings` page.
- `web/src/components/lab/`: provider form and comparison table.
- `web/src/lib/lab-api.ts`: lab-only API client and types.
- `web/src/main.tsx`: renders the lab only for `/settings`.
- `web/src/components/layout/app-shell.tsx`: adds the lab entry link to the production page.
- `web/src/styles.css`: adds responsive lab styles.
- `web/src/tests/lab-page.test.tsx`: verifies masked keys and provider creation.
- `server/src/lab/provider-store.ts`: records test mode, reference filename, and upload duration with backward-compatible defaults.
- `server/src/lab/provider-lab-service.ts`: supports arbitrary model strings and optional reference uploads.
- `server/src/lab/lab-routes.ts`: accepts both existing JSON benchmarks and multipart reference-image benchmarks.
- `web/src/lib/lab-api.ts`: submits benchmarks as multipart form data.
- `web/src/tests/lab-page.test.tsx`: also verifies manual model and file submission.
- `server/src/lab/provider-store.ts` and `server/src/lab/lab-routes.ts`: persist and validate provider notes up to 2000 characters.
- `web/src/components/lab/provider-form.tsx` and `web/src/lab-page.tsx`: edit and display provider notes.
- Lab route and page tests verify note creation and update behavior.
- `WORKLOG.md`: records the completed implementation and validation.
- `server/src/services/toapis-client.ts`: adds shared helpers to extract a remote task ID or first image result from common relay response shapes, including `data[].url` and `data[].b64_json`.
- `server/src/lab/provider-lab-service.ts`: uses the shared helpers so lab benchmarks download direct image responses without polling `/undefined`.
- `server/src/services/batch-service.ts`: applies the same response handling to production task submission while preserving the existing async polling path.
- `server/tests/provider-lab-service.test.ts`: covers the direct-image response case and verifies no undefined task polling occurs.
- `server/tests/provider-lab-service.test.ts`: also covers the documented synchronous `b64_json` response and verifies it is saved without polling.
- `server/src/services/provider-settings-service.ts`: stores formal providers, masks keys, validates inputs, persists activation, and enforces busy-state restrictions.
- `server/src/routes/provider-settings-routes.ts`: exposes formal provider list, create, edit, and activation endpoints.
- `server/src/services/batch-service.ts`: snapshots provider affinity and resolves the batch client for submit, poll, download, retry, and child-image work.
- `server/src/services/reference-image-service.ts`: scopes formal-provider reference uploads by provider revision while preserving env fallback caching.
- `server/tests/provider-settings-service.test.ts`, `server/tests/provider-settings-routes.test.ts`, `server/tests/provider-selection.test.ts`, and `server/tests/reference-image-provider-cache.test.ts`: cover formal storage, APIs, batch affinity, retry revision handling, and reference caching.
- `web/src/settings-page.tsx` and `web/src/lib/provider-settings-api.ts`: implement the formal settings workflow without exposing full stored keys.
- `web/src/main.tsx`, `web/src/components/layout/app-shell.tsx`, and `web/src/styles.css`: route `/settings` and `/lab`, update the workspace entry, and add responsive formal settings styles.
- `web/src/tests/settings-page.test.tsx`: covers env fallback, masked keys, create/edit/activate flows, conflict messages, and the workspace settings link.
- `Launch-App.bat`: writes and clears the launcher identity used by the stop script.
- `关闭项目.bat`: provides the double-click shutdown entry point.
- `README.md`: documents the matching start and stop scripts using repository-relative links.

## Verification

- `better-sqlite3` in-memory query: passed.
- Targeted follow-up tests: passed, 6 backend tests and 3 frontend tests.
- `npm test`: passed, 23 backend tests and 26 frontend tests.
- `npm run build`: passed for the server and web client.
- `package-lock.json`: matches the private repository's `main` version.
- Runtime checks: `/api/health`, `/`, and `/settings` passed.
- Browser checks: lab passed at 1440 x 900 and 390 x 844 with no control overflow; the production page still renders 30 task rows.
- Follow-up browser checks: manual model input and `image/*` file selector render without control overflow at 1440 x 900 and 390 x 844.
- Note field checks: passed at desktop and mobile sizes with no control overflow; the provider table includes a note column.
- 2026-07-17 relay 404 fix: `npm run test -w server -- provider-lab-service.test.ts` passed, 4 backend tests.
- 2026-07-17 relay 404 fix: `npm test` passed, 24 backend tests and 26 frontend tests.
- 2026-07-17 relay 404 fix: `npm run build` passed for server and web.
- 2026-07-17 synchronous base64 fix: targeted provider-lab test passed, 5 backend tests.
- 2026-07-17 synchronous base64 fix: `npm test` passed, 25 backend tests and 26 frontend tests.
- 2026-07-17 synchronous base64 fix: `npm run build` passed for server and web.
- 2026-08-11 formal provider targeted backend tests: 10 provider-selection, reference-cache, and retry tests passed.
- 2026-08-11 formal provider targeted frontend tests: 8 formal-settings and lab tests passed.
- 2026-08-11 full `npm test`: passed, 41 backend tests and 31 frontend tests.
- 2026-08-11 full `npm run build`: passed for server and web.
- 2026-08-11 `git diff --check`: passed.
- Runtime checks: `/api/health` and `/api/provider-settings` returned HTTP 200; `/settings`, `/lab`, and `/` rendered through Vite.
- Browser checks: `/settings` passed at 1440 x 900 and 390 x 844 with no horizontal overflow; `/lab` and the workspace settings link resolved to their expected routes.
- Stop script idle check: passed and reported that the project was not running.
- Stop script integration check: passed; ports `3017` and `5173` listened before shutdown and were both released afterward.
- Post-script `npm test`: passed, 23 backend tests and 26 frontend tests.
- Post-script `npm run build`: passed for the server and web client.

## Next Step

1. Open `/settings`, add a formal relay with name, Base URL, API Key, and optional notes, then select `设为当前使用`.
2. Submit a new production batch and confirm it uses the selected relay; existing batches intentionally keep their original provider affinity.
3. Use `/lab` only for isolated compatibility checks and single-image benchmarks.
4. Double-click `关闭项目.bat` when finished; it closes both local services and the launcher window.

## Risks And Notes

- Do not print, commit, or copy the API key into this worklog.
- Do not commit `.env`, `app-data/`, generated images, local database files, `node_modules`, or build output.
- Before future remote updates, review the current remote head and avoid force updates while the local Git history remains unavailable.
- Do not modify production database tables or mix lab outputs into production history.
- Formal provider switching has no automatic failover. A failed selected provider must be changed manually after active tasks finish.
- Editing a formal provider changes the credentials used by later retries of its old batches; the revision guard prevents reuse of remote task IDs created before that edit.
- Formal-provider reference URL caches are in memory because the current database field is not provider-aware; restarting the server may upload those references again.
- The one-click launcher still requires a configured production `TOAPIS_API_KEY` in `.env`; this task did not inspect or modify that secret file.
- Relay keys are stored as plaintext in ignored local file `app-data/lab/providers.json`; the API and UI expose masks only.
- A reachability check proves that the endpoint responded. Only 401/403 responses are classified as authentication rejection; actual generation compatibility requires a benchmark.
- Reported cost and usage remain `unknown` when the relay response does not provide those fields.
- Reference-image benchmarks require the relay to support both `/uploads/images` and `image_urls` in the existing ToAPIs asynchronous protocol.
- Some relays compatible with ToAPIs may return a generated image directly from `POST /images/generations` instead of an async task ID. Direct URL and base64 results are supported; if a response has neither a task ID nor an image result, the app fails early instead of querying `/undefined`.

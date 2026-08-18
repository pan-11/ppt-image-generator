# Worklog

## 2026-08-19 Yunfei Hybrid Image Provider Implementation Plan

### Current Goal

Prepare a complete TDD execution plan for adding `img.yunfei.best` without changing production generation code or local credentials in the planning stage.

### Current Progress

- Converted the approved hybrid-provider design into a worktree prerequisite plus nine implementation tasks with red/green tests and bounded commits.
- Identified and included the creation-time validation change required for direct `gemini-3-pro-image-preview` submissions; the current global ToAPIs model table would otherwise reject that model before adapter dispatch.
- Defined provider-aware capability and request-resolution contracts, tier persistence, the formal settings UI, GPT/Gemini protocol coverage, role/job routing, browser checks, and the eight-image release gate.
- Added an explicit user checkpoint: both keys must be saved as masked local entries through `/settings` before any paid live request runs.
- No source code, API key, provider setting, or external generation request was changed or sent.

### Changed Files

- `docs/superpowers/plans/2026-08-19-yunfei-image-provider.md`: step-by-step TDD implementation, validation commands, live matrix, and evidence rules.
- `WORKLOG.md`: planning-stage handoff.

### Verification

- Cross-checked the plan against every backend, frontend, live-test, failure-safety, and acceptance item in the approved design.
- Checked existing adapter, provider-settings, batch-routing, and editor test seams so every plan task names real files and commands.
- Confirmed no database migration, `.env` modification, key migration, global dependency, or deployment is required.

### Next Step

1. User selects subagent-driven or inline execution.
2. Execute tasks in order with TDD and commit boundaries.
3. Stop after automated/browser verification so the user can save `云飞 1K` and `云飞 4K` locally.
4. Run the approved eight paid tests only after the user confirms both masked entries exist.

### Risks And Notes

- The supplied document does not publish GPT Image 2's exact 16:9 size table; the candidate mapping remains subject to the live release gate.
- Do not add the direct Nano Banana Pro model to the global ToAPIs capability table; validate through the selected role adapter instead.
- Never print, stage, or commit local keys, provider settings, raw base64 responses, or generated images.

## 2026-08-19 Yunfei Hybrid Image Provider Design

### Current Goal

Add `img.yunfei.best` as a production image provider for `gpt-image-2`, Nano Banana 2, and Nano Banana Pro across 1K and 4K key tiers.

### Current Progress

- Read the supplied provider document as reference data and compared both image protocols with the current adapter system.
- Confirmed GPT Image 2 uses OpenAI Images JSON/multipart endpoints while both Banana models use Gemini native `generateContent`.
- Confirmed the provider documents explicit Gemini 16:9 output sizes and tier-based 1K/2K/4K access.
- Selected a Yunfei hybrid adapter so one provider entry can route all three models without duplicating a key.
- Defined separate `云飞 1K` and `云飞 4K` entries, base64-first result handling, synchronous unknown-charge safety, and an eight-image live compatibility matrix.
- Wrote the approved design. No protocol code, provider configuration, API key, or live Yunfei request has been changed or sent.

### Changed Files

- `docs/superpowers/specs/2026-08-19-yunfei-image-provider-design.md`: protocol routing, settings schema, request/response handling, failure semantics, test matrix, and acceptance criteria.
- `WORKLOG.md`: design-stage handoff.

### Verification

- Completed a field-by-field review of the supplied GPT Images and Gemini native examples.
- Confirmed the document requires `n=1`, uppercase Gemini image sizes, repeated references, and immediate handling of 15-minute result URLs.
- No source tests or builds were required for this documentation-only stage.
- No API key was read or written and no paid generation was submitted.

### Next Step

1. User reviews the committed design specification.
2. After approval, write the TDD implementation plan.
3. Implement the adapter and settings changes before asking the user to save the two keys locally.
4. Run the approved eight-image live matrix only after both entries are configured.

### Risks And Notes

- The supplied document does not publish GPT Image 2's 16:9 pixel table; the design uses explicit compatibility candidates and requires live dimension evidence before acceptance.
- Do not add Veo or `quality=high` in this scope.
- Do not print, commit, or paste either provider key.
- Failed synchronous submissions must distinguish safe 4xx rejection from ambiguous timeout/5xx results.

## 2026-08-19 Provider Protocol Routing Implementation

### Current Goal

Make every new image generation use the provider selected for its text-to-image or image-to-image role, with protocol adapters for ToAPIs and YM2, provider-specific concurrency, correct YM2 16:9 sizes, and per-image recovery/retry safety.

### Current Progress

- Implemented independent text-to-image and image-to-image provider roles. Every unsent image job resolves the provider assigned to its role at dispatch time.
- Added the explicit read-only `env:toapis` provider so `.env` is selectable and visible instead of acting as a silent fallback.
- Added protocol adapters for ToAPIs asynchronous tasks and YM2 OpenAI Images requests. Child/reference-image tasks always use the image role.
- Added additive `generation_jobs` persistence with one job per requested output image, provider/revision affinity after remote submission, and job-level provider/protocol/dimension/error-stage history.
- Added provider-scoped concurrency. A provider's `maxConcurrency` is shared across text and image jobs using that provider; YM2 can be configured up to 100.
- Added YM2 16:9 resolution mapping: 1K `1280x720`, 2K `2048x1152`, and 4K `3840x2160`. Returned dimensions are validated and mismatches are retained as evidence while the job fails validation.
- Added missing-image-only retry. Completed sibling images remain untouched, recoverable remote jobs resume without duplicate submission, and ambiguous synchronous failures require an explicit duplicate-charge warning before resubmission.
- Updated the editor to use the selected role's capabilities, preserve unsupported existing values with a reason, and block generation until the user explicitly chooses supported values.
- Updated formal settings, queue monitoring, and history UI for dual roles, protocol, concurrency, unknown status, provider identity, requested/actual dimensions, and retry risk.
- Fixed a browser-smoke regression where the mobile history export field widened a 390px viewport to 411px; the heading now stacks at mobile width and has a regression test.

### Changed Files

- `AGENTS.md`, `docs/superpowers/specs/2026-08-19-provider-protocol-routing-design.md`, and `docs/superpowers/plans/2026-08-19-provider-protocol-routing.md`: approved rules, design, and implementation plan.
- `server/src/db/` and `server/src/repositories/`: additive generation-job schema, persistence, and job-level retry state.
- `server/src/providers/`: provider adapter contract/registry plus ToAPIs and YM2 protocol implementations.
- `server/src/services/`: role-aware settings, dispatch-time routing, provider concurrency, reference-image routing, recovery, dimension validation, and retry behavior.
- `server/src/routes/`: dual-role settings/capabilities, job status, and structured unknown-charge retry confirmation.
- `server/tests/`: protocol, routing, concurrency, persistence, recovery, retry, settings, and dimension coverage.
- `web/src/settings-page.tsx`, `web/src/lib/`, `web/src/hooks/`, and `web/src/components/`: dual-role settings, role capabilities, job/history/monitor display, and retry confirmation.
- `web/src/styles.css` and `web/src/tests/mobile-layout.test.ts`: mobile overflow fix and regression coverage.
- `WORKLOG.md`: completed implementation handoff.

### Verification

- TDD red/green coverage was run for each implementation task and for the mobile overflow regression.
- `npm test`: passed, 81 backend tests and 49 frontend tests (130 total).
- `npm run build`: passed for the server TypeScript build and the React/Vite production build.
- `git diff --check`: passed after the final source change.
- Browser smoke with mocked local API responses passed 24 checks at 1440x900 and 390x844: both role selectors, protocol/concurrency display, read-only `.env`, bulk import, provider-role display, disabled empty submission, no console errors, and no horizontal overflow.
- Browser evidence screenshots are stored outside the repository under the current Codex visualization directory.
- No real ToAPIs or YM2 generation request was sent, no provider quota was consumed, and `.env`/local provider credentials were not modified.

### Next Step

1. Choose whether to merge, push as a pull request, or keep `codex/bulk-prompt-import` for later.
2. Request separate approval before an optional one-text plus one-image live YM2 validation because it can consume provider quota.

### Risks And Notes

- Existing remote jobs preserve their provider ID/revision and remote reference; unsent jobs intentionally follow the currently selected role provider.
- `unknown` means the relay may already have charged for a request whose final result cannot be proven; automatic resubmission is intentionally blocked.
- Stored API keys remain local and masked in all browser/API responses.
- Do not expose or reuse the JWT-bearing documentation link. Do not change `.env`, send real generation requests, push, or deploy without separate authority.

## 2026-08-18 Current Batch Monitor Fix

### Current Goal

Keep the current-batch monitor on its final polling frame and show batch-specific success and failure counts instead of process-lifetime retry totals.

### Current Progress

- Confirmed the affected batch had already completed 23 of 23 tasks and stored 23 images while the browser remained on `运行中 1 / 成功 22 / 失败 4`.
- Changed the batch response to count completed and failed tasks from the requested batch while preserving live queued, running, and paused scheduler state.
- Kept polling while the scheduler still reports queued or running work, even when the database has already marked every task terminal.
- Added backend and frontend regression coverage for both stale counters and the missing final polling request.

### Changed Files

- `server/src/services/batch-service.ts`: returns current-batch completion and failure counts.
- `server/tests/provider-selection.test.ts`: verifies scheduler lifetime totals do not leak into a batch response.
- `web/src/hooks/use-active-batch.ts`: waits for the scheduler to settle before stopping polling.
- `web/src/tests/use-active-batch.test.tsx`: verifies the final follow-up poll.

### Verification

- Red phase: both new regression tests failed on the previous implementation for the expected reasons.
- Focused tests: 7 backend tests and 1 frontend test passed.
- `npm test`: passed, 45 backend tests and 41 frontend tests.
- `npm run build`: passed for the server and web client.

### Risks And Notes

- Queue `queued`, `running`, and `paused` values remain live scheduler state; only completed and failed totals are scoped to the requested batch.
- This change does not retry tasks, create images, or alter provider selection.

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

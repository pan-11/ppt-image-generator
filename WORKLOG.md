# Worklog

## Current Goal

The isolated relay lab supports manual model names, optional reference-image benchmarks, and per-provider test notes without changing the production image-generation workflow.

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

## Next Step

1. Open `http://127.0.0.1:5173/settings`.
2. Add or edit a relay and record observations in its test note.
3. Enter the relay's exact model name manually.
4. Leave the reference image empty for text-to-image, or choose one image for a reference-image benchmark.
5. Confirm the paid single-image benchmark only after reviewing the provider, model, ratio, resolution, and prompt.

## Risks And Notes

- Do not print, commit, or copy the API key into this worklog.
- Do not commit `.env`, `app-data/`, generated images, local database files, `node_modules`, or build output.
- Before future remote updates, review the current remote head and avoid force updates while the local Git history remains unavailable.
- Do not modify production database tables or mix lab outputs into production history.
- Do not add production-provider switching in this phase.
- Relay keys are stored as plaintext in ignored local file `app-data/lab/providers.json`; the API and UI expose masks only.
- A reachability check proves that the endpoint responded. Only 401/403 responses are classified as authentication rejection; actual generation compatibility requires a benchmark.
- Reported cost and usage remain `unknown` when the relay response does not provide those fields.
- Reference-image benchmarks require the relay to support both `/uploads/images` and `image_urls` in the existing ToAPIs asynchronous protocol.
- Some relays compatible with ToAPIs may return a generated image directly from `POST /images/generations` instead of an async task ID. Direct URL and base64 results are supported; if a response has neither a task ID nor an image result, the app fails early instead of querying `/undefined`.

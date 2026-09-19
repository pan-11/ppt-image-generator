# External Images And References Implementation Plan

> **For agentic workers:** Follow the approved design and TDD. Use scoped parallel agent work only with the file ownership below; integration and delivery are sequential. Steps use checkboxes for handoff.

**Goal:** Import external final images into a courseware page and expose reference upload throughout bulk import, generation, prompt editing and source-plus-auxiliary image edits.

**Architecture:** Preserve the existing generation pipeline. Store uploads as reference assets with explicit courseware/page associations, resolve both candidate sources through the courseware service, and persist an optional auxiliary reference on image-edit tasks. Frontend controls share the same persisted page/reference state; server revisions and guarded local merges protect asynchronous imports.

**Tech Stack:** Node/Fastify, SQLite/better-sqlite3, Sharp, React/Vite, Vitest/Testing Library, existing cached Playwright/Edge.

## Authorization And Workspace

- User approved the complete design with “就按照这个方案开始执行”, including its additive table/column and consistent migration backup. No additional approval is needed for this implementation.
- Isolated checkout: `D:/codex_project/图片生成/.worktrees/external-images-references`, branch `codex/external-images-references`, base `4a88d56`.
- Approved spec: `docs/superpowers/specs/2026-09-19-external-images-and-references-design.md`. Existing primary worklog/design files must be preserved.
- Reuse the existing dependency installation; never modify .env/keys, install global dependencies, delete worktrees/files, publish or perform paid generation tests.

## Shared Contracts And File Ownership

Backend worker owns `server/src/**` and scoped backend tests. UI worker owns `web/src/components/tasks/**`, `web/src/components/tasks/reference-images.css` and its scoped component tests. Coordinator owns `web/src/App.tsx`, `web/src/hooks/**`, `web/src/lib/**`, `web/src/components/courseware/page-selection-panel.tsx`, integration tests, project rules and this log/plan. Do not edit another worker's files without coordination.

The backend returns `CoursewareDetail` for final upload:

```ts
// Multipart POST /api/coursewares/:id/pages/:pageId/images
// fields: file, uploadId (UUID), expectedRevision (integer)
type UploadResponse = CoursewareDetail;
type UploadedCandidate = {
  id: string; source: "upload"; courseware_id: string; page_id: string;
  task_id: null; batch_id: null; filename: string; local_path: string;
  mime_type: string; width: number; height: number;
  validation_status: "valid"; created_at: string;
};
// GET /api/reference-images/:id
type ReferenceImageRecord = {
  id: string; filename: string; localPath: string;
  mimeType?: string; width?: number; height?: number; url?: string;
};
// Content: /api/reference-images/:id/content
// Child tasks add auxiliaryReferenceImageId?: string | null.
// Restored TaskRecord adds auxiliary_reference_image_id?: string | null.
```

Task UI callbacks:

```ts
// Add optional props to TaskTable and pass row upload to TaskRow.
onUploadFinalImage?: (rowId: string, file: File, uploadId: string) => Promise<void>;
onSharedReferenceChange?: (reference: ReferenceImageRecord | null, includeUnreferenced: boolean) => Promise<void>;
// PageCandidateStrip (coordinator implements):
onUpload?: (file: File, uploadId: string) => Promise<void>;
// BulkImportPayload adds globalReferenceImageId?: string | null.
// undefined retains legacy caller behavior; null explicitly means no shared image.
```

## Task 1: Baseline And Schema Safety

- [x] Read rules and log; inspect git diff/status, create ignored isolated worktree, copy approved design and worklog, reuse installed node_modules via junction.
- [x] Run baseline `npm test`; record all failures before implementation.
- [x] Write backend migration tests against pre-feature databases including committed WAL state and concurrent startup. Assert a readable retained backup and exactly one nullable auxiliary column plus upload table, preserving previous rows.
- [x] Implement consistent pre-migration backup and serialized idempotent additive schema changes. New databases need no pre-feature backup.
- [x] Run `npm run test -w server -- external-images-migration.test.ts` and existing migration tests; expected green with no data loss.

## Task 2: Uploaded Candidates And Existing Image Workflows

- [x] Add failing backend route/service tests: valid PNG/JPEG/WebP, invalid/corrupt/oversize/wrong-ratio input, page ownership, stale revision, idempotent upload retry, no remote jobs, exact file bytes and automatic selectedImageId.
- [x] Implement upload validation with Sharp and route limits of 20 MiB, `courseware_uploaded_images` association, and atomic page selection with revision checks. Return current detail on a duplicate uploadId for the same page; never reselect it over a newer deliberate choice.
- [x] Resolve generated/uploaded assets through shared courseware lookup for downloads, candidate detail, selection validation, child generation and textless export. Upload candidates have no fabricated task.
- [x] Add integration tests proving final export bytes, old candidate preservation and original/uploaded sources working in modifications/textless flow. Child generation from an upload creates a real new generation batch linked to the same page.
- [x] Run scoped backend tests, then server build; retain real fixture files only under isolated test/runtime locations.

## Task 3: Auxiliary References

- [x] Add failing tests capturing adapter inputs for a child task: source first, auxiliary second; no implicit global image; retries/recovery preserve both IDs/bytes and do not regenerate successful siblings.
- [x] Persist `auxiliary_reference_image_id`, accept `auxiliaryReferenceImageId` through typed route/task inputs and build ordered reference arrays in dispatch/recovery. Default null preserves legacy tasks.
- [x] Validate referenced assets before creating generation work. Add metadata/content routes; missing references must fail explicitly, never fall back to text-only input.
- [x] Review applicable adapter official contracts/existing exact-request tests before modifying any external API construction; avoid unrelated protocol changes.
- [x] Run new reference-flow tests plus generation routing/retry, adapter and textless regression tests.

## Task 4: Reference UI Controls

- [x] Write failing component tests for reference thumbnails, upload/replacement/cancel/error, independent child auxiliary drafts, actual effective-reference display, import cancel and shared opt-out preservation.
- [x] Implement reusable reference field with metadata reload, 20 MiB/format validation, upload progress/error, stale response guard and an uploading callback so dependent actions remain disabled until completion.
- [x] Add shared-reference modal and toolbar summary. Apply only to global pages by default; explicit checkbox may include none-mode pages; row-mode pages stay unchanged.
- [x] Extend bulk import payload and preview with its staged shared reference; cancel must preserve current courseware. New/imported page drafts default to global even when no global image exists.
- [x] Put row modes/reference controls beside prompt editing, and source/auxiliary controls in each child draft. Keep original fixed and retain exact prompt text.
- [x] Wire optional final-upload callback from table/row to PageCandidateStrip. Maintain desktop density, visible mobile upload entry and keyboard controls.
- [x] Run scoped web component tests and report API/type assumptions to coordinator.

## Task 5: Frontend Courseware Integration

- [x] Write API tests asserting multipart upload fields, explicit no-reference serialization and auxiliary child payloads; selection tests for upload candidates without generated tasks.
- [x] Extend frontend types and API helpers. Render uploaded candidates with source labels, no counterfeit prompt-copy action and independent upload labels; allow selecting old/new images.
- [x] Add hook-mediated server mutation with serialized save handling. Flush before upload; block autosave while upload changes revision; merge the returned revision and selection with newer local edits; a changed local selection wins over a late response. Guard courseware switch/reopen and page removal.
- [x] Integrate App shared settings and staged import reference ID, ensure a new/manual/legacy page has a persistent courseware identity before final upload, and refresh result state without resetting other draft edits.
- [x] Add app/hook regressions for edit-during-upload, upload failure, stale response after courseware switch, retry after lost response, restored uploaded final and subsequent generation not stealing selectedImageId.
- [x] Run targeted API/selection/courseware restore tests and web build.

## Task 6: Integration And Local Delivery

- [x] Review scoped diffs and implementation against all A1–A15 acceptance cases, resolving cross-layer assumptions before real data is touched.
- [x] Run full `npm test`, `npm run build`, `git diff --check` in isolated checkout.
- [x] Browser test the real frontend with isolated server/test data at 1440 and 390 px; test uploads, final switching/export, bulk shared/row/none modes, two-image edit submission and save/restore. No paid remote call is required.
- [x] Before primary synchronization compare baseline hashes and git changes, confirm no active production jobs, and retain a snapshot/backup. Copy only verified feature/rule/doc files, retaining unrelated primary changes. Do not auto-delete or reset the checkout.
- [x] Validate primary app health/UI and migration backup with no paid generation. Update WORKLOG.md and this checklist with commands/results and any remaining limits. Do not commit/push/publish unless requested.

## Verification Checkpoint (2026-09-20)

- Baseline: 392 tests passed. Final isolated run: 454 tests passed (280 server + 174 web), npm run build passed, git diff --check passed.
- Browser: 16 real-UI checks passed using mock-only local provider on port 3019. Evidence retained under app-data/external-images-acceptance-*.
- No adapter request format changed; existing exact-request adapter tests plus new source/auxiliary integration tests passed.
- Hook fixes were delegated back to the backend worker after concrete race reproduction; coordinator retained App/API/candidate ownership.
- Primary sync completed: 48 scoped files byte-verified; old records in all 9 tables and 82 image/config files unchanged; readable matching pre-feature backup retained. Primary health/UI checks passed with no writes or real relay calls.

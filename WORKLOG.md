# Worklog

## 2026-09-09 Local Commit Checkpoint

- User requested a local Git commit covering the completed courseware workflow and monitor/history UI changes, with their tests and execution documents.
- Validation carried forward from delivery: 225 tests passed, both workspaces built, and monitor/history plus courseware browser acceptance passed. No business code changes were introduced for this checkpoint.
- Local runtime data, secrets, databases, backups, generated images, dependencies, build output and retained worktrees are excluded. No GitHub push or deployment is requested.

## 2026-09-09 Monitor Drawer And Compact History Delivered

- Completed the approved UI plan and synchronized 17 scoped source/test files from `.worktrees/monitor-history` into the primary project after checking primary hashes for conflicts. All synchronized files matched the tested worktree byte-for-byte. Prior uncommitted courseware work remains intact; no commit, push or deployment.
- Monitor: closed-by-default right drawer, live counters,420px desktop/full-width mobile, independent internal scroll, keyboard/backdrop closing and focus return. App retains polling and queue callbacks; closing does not pause/retry/generate. Source: App, monitor-drawer, shared modal placement/id and scoped styles.
- History: one compact batch row, all images in fixed160x90 contain thumbnails with horizontal scrolling, deferred full prompt/job details, existing restore/export/retry/delete confirmations and feedback. New history-batch-details and history-image-viewer separate details from same-batch ID-based navigation. Source: five history components, styles and focused regression tests.
- Review fixes: selected-image invalidation returns focus to the strip even after navigation; deletion completion cannot close a later preview; hidden broken images cannot cover their fallback; long provider/model/error strings wrap within narrow history layouts. Independent monitor/history spec and quality reviews approved.
- Verification in isolated checkout: `npm test` passed225 tests (server124, web101); `npm run build` passed. Primary `npm run build` also passed after synchronization. Scoped diff checks passed.
- Browser: `workbench-layout-browser-check.cjs` passed1920/1365/1024/390 widths with0/1/23/100-image batches (124 images total), mixed ratios/broken images, geometry/overflow, polling while closed, preview navigation, complete prompts, long-error wrapping, real refresh retention, native-modal focus and reduced motion. It blocks mutation/external browser requests; queue mutations and additional image calls were0.
- Existing courseware browser regression passed: raw prompts retained, child selected as final, two two-slide PPT exports, completed textless result reuse and mobile no-overflow. Exactly5 simulated generation calls; no real paid validation. Screenshots and exported fixtures are retained in `.worktrees/monitor-history/app-data/courseware-acceptance/`.
- Local service was not listening at final handoff, so `npm run dev` was started in the primary directory. Web5173 returned200, backend3017 health returnedok, and Vite serves the updated monitor module. The temporary3019 mock service was stopped.
- Plan checklist completed in `docs/superpowers/plans/2026-09-09-monitor-drawer-and-compact-history.md`. Next: refresh the local workbench to use the new UI; optionally review/commit the accumulated local work if the user requests it.
- Retain branch `codex/monitor-history`, worktree and local artifacts. That isolated checkout also contains setup-only root-level copy artifacts from an initial cwd mistake; only the explicitly verified source allowlist was synchronized, never stage that checkout wholesale. No user-data cleanup, schema/provider/secret/system changes were part of this UI work. Display thumbnails still fetch original image files; no server thumbnail cache was introduced.

## 2026-09-09 Monitor And History Implementation In Progress

- User authorized execution of the detailed monitor/history plan. Work in `.worktrees/monitor-history`, branch `codex/monitor-history`, with current uncommitted source copied in; primary source hashes recorded before implementation.
- Scope: drawer presentation and App wiring, compact history/details, fixed thumbnail strips and same-batch viewer, regression and mock browser validation. Existing courseware functionality must remain intact.
- Current progress: baseline `npm test` passed 208 tests (server 124, web 84). Monitor drawer/App/shared-modal integration completed; 14 targeted tests and web build passed, independent spec and quality reviews approved. Live-hook test proves polling continues without queue mutations while closed. History implementation is in progress; nothing synchronized to primary yet.
- Monitor checkpoint files: App wires presentation without moving its polling hook; new monitor-drawer owns monitor markup; shared modal gains optional right placement/id; scoped CSS and three test files verify interaction and layout policy. Browser measured desktop drawer 420px, unchanged editor x/width, and full-width390px mobile with no overflow.
- Browser harness: `server/tests/workbench-layout-browser-check.cjs` covers 0/1/23/100-image batches and four viewport sizes. Syntax passed; complete browser acceptance follows history implementation. Mock service runs only on3019 with temporary data.
- Next: implement monitor, then history/viewer; run targeted tests, spec/quality review, full tests/build, and mock browser acceptance before syncing scoped files back.
- Constraints: retain existing primary changes and all data; no deletion/rollback, secrets/schema/system changes, real paid calls, commits, push or deployment. Test artifacts remain local.

## 2026-09-09 Monitor Drawer And Compact History Plan

- Current goal: document the user-confirmed UI direction before implementation: a closed-by-default right monitor drawer and consecutive history batch rows with fixed-size thumbnails in a single horizontally scrolling strip.
- Completed: inspected current App layout, polling ownership, history/image components, shared dialog, CSS breakpoints, existing tests, API types, and repository ordering. Wrote interaction rules, exact file responsibilities, component contracts, staged implementation steps, focused regression tests, browser checks, and final acceptance criteria.
- Added: `docs/superpowers/plans/2026-09-09-monitor-drawer-and-compact-history.md`. Updated this log for handoff. No product implementation is part of this documentation task.
- Key decisions: keep `useActiveBatch` in App while the drawer closes; preserve all stored images; use fixed 160x90 contain previews; unfold full prompts/jobs only on demand; navigate previews by image ID; retain existing manual history refresh, confirmations, retry/export behavior, and courseware final-selection/textless semantics.
- Verification: documentation checks passed for balanced code fences, no trailing whitespace or unresolved placeholder markers, and `git diff --check`. SHA-256 comparison confirmed the inspected App, history/modal components, styles, schema, project rules, and package files were unchanged by this task. Product tests/build were not rerun for this documentation-only change; the 208-test/build result below is the previous completed feature baseline.
- Remaining: all UI implementation tasks in the new plan. Next: implement Task 0 through Task 6 when the user requests execution, preserving the existing uncommitted courseware work rather than starting from an older Git snapshot.
- Risks and boundaries: shared modal/default styles must retain existing behavior; display-size thumbnails still use original-image downloads. No schema/migration, provider or secret edits, new dependencies, real image calls, real-data deletion, commit, push, or deployment in this planning task.

## 2026-09-09 Courseware Workflow Delivered

- Goal completed: preserve imported originals/current prompts, persist coursewares before generation, select exactly one original/descendant per page, export ordered full-slide PPTX, create source-bound textless versions and matching PPTX.
- Implementation was developed in `.worktrees/courseware-production` on `codex/courseware-production`, then 50 approved source/test/document files were synchronized into this primary project. No unrelated primary edits were overwritten. Code changes remain uncommitted; no GitHub push or deployment.
- Verification: `npm test` passed 208 tests (server 124, web 84); `npm run build` passed both workspaces. Server lint and diff checks passed. Frontend/backend spec and correctness reviews passed after fixes.
- Browser acceptance: real UI + temporary SQLite + mock adapter; importing before generation, reload, original prompt preservation, child final selection, both two-slide PPT exports, completed-result reuse, and 390px viewport passed. Fresh run made exactly 5 mock calls (2 originals, 1 child, 2 textless); repeated textless action made none. PPT ZIP/XML checks confirm one embedded image per slide. Harnesses: `server/tests/courseware-browser-server.ts` and `server/tests/courseware-browser-check.cjs`.
- Main local dependencies installed and primary build verified. Actual runtime database resolved from current server configuration to `D:/codex_project/图片生成/server/app-data/app.sqlite`.
- Local application started with `npm run dev`: web `http://127.0.0.1:5173` returned 200, backend `http://127.0.0.1:3017/api/health` returned `status: ok`. The separate mock acceptance server was stopped.
- Approved database migration completed after consistent SQLite backup. Backup: `server/app-data/app.sqlite.before-courseware-2026-09-09T10-31-32-451Z-49e42e2a-4f29-464d-af5f-2f9aba3c42b9.bak`. Before/after counts unchanged: batches 7; tasks 31; generated_images 31; reference_images 2; generation_jobs 5. All four new tables exist; `quick_check` is `ok`.
- Important implementation details: immutable source text; serialized revision-aware saves and local conflict retention; stable task/page links; exact selected-source snapshots; provider/retry behavior retained; valid local ledger recovery before remote work; one PPT pack at a time; complete decode and exact aspect checks; no silent page omission/cropping/stretching.
- Remaining validation limits: no real paid image calls were made, so actual text-removal fidelity still requires inspecting real generated results. Native PowerPoint/LibreOffice was unavailable; PPT verification used embedded media and OOXML structure checks plus actual browser downloads.
- User flow: bulk import creates a saved courseware; use Prompt Library for original/current copies and TXT/Markdown; select final image per page; Export Final PPT; Textless Versions for processing/comparison and paired exports. Existing batches can be adopted via Save Current Courseware/export, without fabricating original imported text.
- Retain backup, local data, and ignored acceptance artifacts. Do not delete/rollback, change secrets/system/CI, publish, or initiate paid validation without separate authorization. Historical planning entries below describe earlier checkpoints, not current unfinished work.

## 2026-09-09 Approved Implementation In Progress

- Goal: execute the approved four-stage courseware workflow, including all four new local tables.
- Authorization: user said to execute the proposed plan after explanation of the tables. Schema implementation is authorized; no paid calls, publication, secrets changes, or deletion is authorized.
- Workspace: `.worktrees/courseware-production`, branch `codex/courseware-production`, based on local `92eaa1d`; original workspace and planning files retained.
- Rules: added the courseware component directory convention before creating components. Existing runtime data is not used by tests.
- In progress: backend persistence/export/textless services; frontend courseware editor integration. Tests use temporary SQLite and mocked providers.
- Verification: project dependencies installed locally; baseline test run in progress. No real-data migration has been run.
- Next: complete implementation and mock acceptance tests, inspect diff, run full tests/build, then report exact runtime migration and paid visual validation limits.

### Core Workflow Checkpoint

- Implemented stages A-D: immutable imported originals/current prompt exports, revision-safe persistent coursewares, page-final selection, ordered full-slide PPTX export, source-bound textless runs and paired PPTX export.
- Backend: four repositories/tables, courseware/textless routes and services, task linkage, per-attempt image ledger, shared existing scheduler/provider flow, validated pre-migration backup. Project dependencies: pptxgenjs and sharp.
- Frontend: courseware hook and six courseware components; importer retains full source and page metadata; App connects stable page IDs, legacy adoption, selection, autosave and export.
- Verified baseline 171 tests before changes. New hook regression tests cover concurrent edits, live revision conflict, same-ID delayed reopening. New App tests cover delayed settings/legacy restore and late generation responses without overwriting edits or a different courseware.
- Browser mock acceptance passed: save before generation, reload, preserve original after prompt edit, select child as final, export two slides in both PPTs, reuse completed textless tasks, 390px viewport without horizontal overflow. Harnesses are in server/tests/courseware-browser-*. Generated artifacts stay ignored in app-data/courseware-acceptance.
- Review fixes in progress: repair already-written valid results on restart before any remote recovery; serialize PPTX packing. No real-data migration or paid generation yet. PowerPoint/LibreOffice executables were not available for native Office visual validation.

## 2026-09-09 Integrated Courseware Execution Plan

### Current Goal

Design one executable roadmap covering imported-prompt preservation and reuse, one final image per PPT page, final-image PPTX export, source-bound text removal, and matching textless PPTX export.

### Current Progress

- Completed a proposed product design and a four-stage implementation plan with 10 tasks, exact source/test touchpoints, API contracts, a concrete four-table schema proposal, and acceptance checks.
- Confirmed that the importer keeps the full pasted text only in modal state. Parsed page prompts persist, but source formatting and text before the first page marker are not retained as an original document.
- Proposed immutable imported source plus editable per-page drafts; successful imports save locally before generation and create separate coursewares so later imports do not overwrite earlier source text.
- Prompt reuse includes original/current TXT and Markdown, per-page/all-page copy, and access to the actual prompt used for a candidate image. Child-edit instructions and the textless template remain distinct from base page prompts.
- Preserved the user's single-selection correction: original images, sibling outputs, and all descendants are candidates for the same page; exactly one final version per included page.
- Proposed stable page/task associations across generation batches and explicit result validation records, avoiding completion-time ordering and accidental use of failed image attempts.
- Proposed textless runs freeze selected source IDs, labels, page order, and processing parameters. Matching final/textless PPTX exports use that same frozen list.
- Included safe recovery of new textless jobs and explicit rejection of provider-revision mismatches instead of silently creating a new paid generation.
- The design and schema changes await user approval. No implementation, migration, dependency install, paid generation, commit, push, or deployment was performed in this planning task.

### Changed Files

- `docs/superpowers/specs/2026-09-09-courseware-production-workflow-design.md`: reviewable product behavior, source retention rules, page/version model, export semantics, and scope.
- `docs/superpowers/plans/2026-09-09-courseware-production-workflow.md`: phased tasks, file responsibilities, contracts, proposed SQL, test commands, migration boundaries, and requirement coverage.
- `WORKLOG.md`: this handoff. The previously created `docs/textless-background-prompt.md` remains the unchanged prompt source.

### Verification

- Inspected the existing importer, editor session, history restoration, task creation, persistence, downloads, and provider flow.
- Reviewed official Clipboard, PptxGenJS, and sharp documentation and linked the relevant claims in the proposed documents.
- Documentation checks passed: balanced code fences, no trailing whitespace, no unresolved placeholder markers, and `git diff --check`.
- Inline review checked prompt provenance, stable page identity, explicit selected-source pairing, metadata after page changes, API/type consistency, and coverage of every requested feature.
- Product tests were not rerun because only planning documentation changed; all listed implementation test commands remain future work.

### Next Step

Obtain approval for the design and the four proposed local tables (`coursewares`, `courseware_task_links`, `textless_runs`, `image_job_results`), then execute stages A through D. Confirm a consistent backup and the real database target before applying the schema to existing runtime data.

### Risks And Notes

- The current branch remains local `main` based on `92eaa1d`; retain its unpushed fix and the planning documents when creating an implementation worktree.
- Old imported originals cannot be reconstructed when they were never saved; show that absence rather than inventing a source document.
- Schema changes, real-data migration, deletion, secret/system changes, and publishing require the user's explicit authorization under the supplied global rules.
- Do not invoke the disabled `k12-courseware-*` skills, alter provider credentials, or run paid text removal as part of plan review.

## 2026-09-09 PPTX Export And Textless Variant Planning

### Current Goal

Plan ordered, full-slide image PPTX export, text removal from each slide's selected final image using the user's supplied prompt, and matching textless PPTX export.

### Current Progress

- Planning only. The implementation design and database changes have not been approved.
- Inspected downloads, image/task persistence, child generation, provider dispatch, retry handling, editor results, history restore, and session persistence at local `main` commit `92eaa1d`.
- Existing image queries sort by creation time, and tasks created together share one timestamp. Stable slide order must come from an explicit ordered page list rather than completion time.
- Existing child generation appends tasks to the source batch and consumes that batch's task limit. Recommend a dedicated textless batch with persisted page/source/result associations while reusing the existing generation queue and reference-image service.
- Each textless page should use its selected final source image, the supplied prompt verbatim, one image-mode job, and one requested output. When a child image is selected, that child is the input; do not substitute the earliest ancestor. Reprocessing should reference that selected source again rather than a previous textless result.
- Existing generated-image records can include dimension-validation failures and multiple attempts. Export selection needs an explicit association with the intended valid result rather than selecting every stored image.
- User clarification: an original image and its child images are alternative versions of the same PPT page and must be mutually exclusive for export. This replaces the earlier proposal to export each successful image as a separate page.
- Proposed page mapping: one editor task row represents one PPT page; its multiple outputs and all descendant generations are candidate versions. Each included page has exactly one selected final image, shown with a mutually exclusive selection control. Selecting a child replaces the previous selection without adding or reordering pages.
- Persist stable page identity, page order, and the selected source image. Derive candidate membership from the page's generation lineage, not from the batch ID alone.
- Textless results remain associated with the exact source image. Changing the selected version must not reuse a background generated from another version; retain previous backgrounds and reuse them only when their matching source is selected again.
- Snapshot the selected source IDs and page order when starting text removal. Later selection changes do not change submitted inputs or cause completed results to attach to another version.
- Both exports should use the same page list. Missing textless pages must remain visible and must not silently disappear or be replaced with original images.
- Reviewed PptxGenJS official image, presentation-layout, and saving documentation. Recommend one shared server-side PPTX exporter using the stored image files and actual image dimensions.
- A presentation has one slide size. Mixed aspect ratios need an explicit resolution before full-bleed export; do not silently crop or stretch courseware images.

### Changed Files

- `docs/textless-background-prompt.md`: preserves the exact user-supplied prompt as planning input.
- `WORKLOG.md`: records findings, the proposed direction, and implementation boundaries for handoff.

### Verification

- Read-only Git inspection found a clean workspace at `92eaa1d` before the planning documents were added.
- Reviewed local source and official PptxGenJS documentation; no application test or image-generation call was needed for planning.
- `git diff --check`: passed. Confirmed all seven supplied prompt requirements and the closing single-page instruction are present; final status contains only the worklog edit and the new prompt document.

### Next Step

Present the corrected page/version selection workflow and obtain design approval before implementation. Finalize the exact persistence and migration design before requesting authorization for database schema changes.

### Risks And Notes

- No product source, dependency, database, provider setting, credential, or remote repository has been changed in this planning task.
- Image editing may leave text or alter illustrations; acceptance should include original/textless comparison and explicit single-page reprocessing.
- Keep the existing provider routing, shared concurrency limits, successful-sibling preservation, and unknown-charge retry handling.
- New schema or data migration requires the user's explicit permission under the project-wide rules. Do not run the application against real data to trigger a proposed migration during planning.

## 2026-09-09 Child Image History Restore Local Commit

### Current Goal

Commit the existing child-image history restore changes on local `main`.

### Current Progress

- Reviewed the two previously uncommitted files and verified their existing changes.
- Child submissions merge returned tasks into the editor immediately and select the returned task's batch for monitoring.
- The regression test covers a restored parent image whose batch differs from the previously active batch.
- No additional product-code changes were made during commit preparation.

### Changed Files

- `web/src/App.tsx`: preserves submitted child tasks and refreshes their actual batch.
- `web/src/tests/app-history-restore.test.tsx`: verifies child-task visibility and the correct batch refresh after history restore.
- `WORKLOG.md`: records the local commit scope and fresh verification results.

### Verification

- `npm test`: passed, 28 backend files / 104 tests and 21 frontend files / 67 tests.
- The full frontend suite includes all 3 history-restore tests, including the child-submission regression.
- `npm run build`: passed for the server TypeScript build and React/Vite production build.
- `git diff --check`: passed during commit preparation.

### Next Step

Keep this change on local `main`; synchronize it to GitHub when requested.

### Risks And Notes

- Keep `.env`, provider settings, generated images, databases, dependencies, and build output outside the commit.
- No remote update, deployment, database migration, or credential change is part of this task.

## 2026-08-20 Homepage Visual Workbench Redesign

### Current Goal

Turn the homepage into a calmer, denser courseware image-production workbench while preserving existing generation, history, provider, and local persistence behavior.

### Current Progress

- Replaced the warm radial-gradient background with a neutral gray page, white surfaces, restrained blue actions, and semantic success/error colors.
- Reduced homepage surface radii to a 6/8/10px system, removed heavy glass effects, lowered shadows, and used structural borders.
- Replaced the oversized English hero with a compact Chinese product header: `课件生图工作台`.
- Reduced desktop controls to 46px, prompt areas to 112px, task padding to 16px, and standardized focus, hover, and press feedback.
- Reduced the default editor from 30 blank rows to 5 while retaining add/import workflows and the configured 100-task batch limit.
- Added backward-compatible session normalization that trims only blank legacy trailing rows after the fifth row; rows with prompts, notes, submissions, or references remain untouched.
- Hid empty run counters until a batch exists and changed active counters to stable tabular numbers.

### Changed Files

- `web/src/styles.css`: homepage visual tokens, surfaces, typography, control density, status colors, responsive layout, and interaction feedback.
- `web/src/components/layout/app-shell.tsx`: compact Chinese product header.
- `web/src/components/tasks/task-table.tsx`, `web/src/components/monitor/run-summary.tsx`: compact task and monitoring presentation.
- `web/src/lib/task-draft.ts`, `web/src/lib/history-snapshot.ts`, `web/src/lib/editor-session.ts`, `web/src/App.tsx`: five-row default and lossless legacy-session normalization.
- `web/src/tests/`: product header, visual tokens, five-row defaults, session compatibility, and monitoring regressions.

### Verification

- Targeted redesign suite: 6 files / 18 tests passed.
- Full `npm test`: 28 backend files / 104 tests and 21 frontend files / 66 tests passed.
- `npm run build`: server TypeScript build and React/Vite production build passed.
- Browser verification at 1280x720, 390x844, and 320x700: 5 rows, no horizontal overflow, 46px desktop controls, 16px mobile model selector, static mobile submit bar, no console errors.
- Browser modal smoke: native modal visible, 12px radius, close button focused, Escape closes and restores focus to the bulk-import trigger.
- Measured WCAG contrast: title 16.29:1, body text 15.04:1, primary button 6.53:1.

### Next Step

Review the running homepage at `http://127.0.0.1:5173/` with real prompts and images. The dev server remains running in the current terminal session.

### Risks And Notes

- Old sessions keep every meaningful row; only blank trailing rows beyond the fifth are trimmed.
- No backend runtime logic, `.env`, provider settings, database schema, runtime data, dependency, deployment, or external API behavior changed.

## 2026-08-20 Homepage Interface Remediation

### Current Goal

Apply the approved `better-interface full` homepage findings without changing backend behavior, secrets, or deployment configuration.

### Current Progress

- Moved the workspace to one column at `max-width: 1500px` so the monitoring panel is not compressed at 1280px.
- Removed the mobile sticky submit bar, restored a 16px model selector, and prevented horizontal overflow at 390px and 320px.
- Added a reusable native dialog wrapper for bulk import and image preview with modal semantics, Escape handling, initial focus, focus restoration, and backdrop isolation.
- Added confirmation before permanently deleting a batch or image.
- Added Chinese task/job status labels, history loading/error/empty states, screen-reader roles, field error associations, and the `task-editor` anchor.
- Renamed the history refresh action from the old dialog wording and hid queue controls when no active batch exists.

### Changed Files

- `web/src/components/ui/modal-dialog.tsx`: shared native modal behavior and focus lifecycle.
- `web/src/lib/status-labels.ts`: Chinese labels for internal task and job states.
- `web/src/App.tsx`, `web/src/components/monitor/run-summary.tsx`, `web/src/components/tasks/`: homepage controls, statuses, modal usage, error associations, and responsive behavior.
- `web/src/components/history/`, `web/src/hooks/use-history.ts`: deletion confirmations, history empty/error announcements, and status labels.
- `web/src/styles.css`: desktop breakpoint, mobile flow, modal styling, and empty-state layout.
- `web/src/tests/`: regression coverage for every approved homepage finding, including hook failure handling and renamed copy.

### Verification

- Targeted homepage suite: 9 files, 28 tests passed.
- Full `npm test`: 28 backend files / 104 tests and 20 frontend files / 63 tests passed.
- `npm run build`: server TypeScript build and React/Vite production build passed.
- Browser smoke at 1280x720, 390x844, and 320x700: no horizontal overflow; workspace stacks at 1280px; mobile submit bar is static; model selector computes to 16px; no active-batch pause control is shown; native bulk-import dialog opens, focuses close, closes on Escape, restores trigger focus, and has no console errors.
- Visual screenshots checked for desktop, mobile, and modal states. No overlap or clipping observed.
- No local history/image data was created or deleted during browser verification.

### Next Step

Use the running local page at `http://127.0.0.1:5173/` for manual review. The dev server remains running in the current terminal session.

### Risks And Notes

- Existing user changes in `WORKLOG.md` and homepage tests were preserved.
- No `.env`, `app-data/`, backend runtime logic, database schema, deployment configuration, or external provider request was changed.

## 2026-08-20 Local Sync With GitHub Main

### Current Goal

Bring the local workspace up to the private GitHub repository's current `main` version.

### Current Progress

- Verified the authenticated remote repository `pan-11/ppt-image-generator` and fetched `origin/main` at `92661d597403d90b8031cff065b3f133f0f3fdb8`.
- Compared the local uncommitted workspace with the remote tree: 46 same-path files differed and 45 files existed only online; no local-only source files were found.
- Backed up 100 non-sensitive local files under `C:\Users\Administrator\AppData\Local\Temp\ppt-image-generator-local-20260820-005013` before synchronization. The two Chinese batch filenames were already present in the remote tree and remain in the synced workspace; `.env` was intentionally excluded.
- Replaced the local Git index/worktree with `origin/main`, set local `main` to track `origin/main`, and preserved `.env`, `app-data/`, dependencies, and build output outside the tracked tree.

### Verification

- `npm test`: passed, 28 backend test files / 104 tests and 18 frontend test files / 54 tests.
- `npm run build`: passed for the server TypeScript build and the React/Vite production build.
- Final sync check: `HEAD` equals `origin/main` at `92661d5`; tracked diff is empty; `.env` and `app-data/` remain present.

### Next Step

Use the synced `main` workspace for further changes. Fetch and inspect the remote head before future updates.

### Risks And Notes

- Do not commit `.env`, `app-data/`, generated images, local databases, `node_modules`, or build output.
- The temporary backup is recoverable at the path above; no destructive deletion was performed.

## 2026-08-19 Yunfei Paid Matrix And Evidence Fixes

### Current Goal

Verify the four locally saved Yunfei key products with six sequential paid 16:9 text-to-image requests, then apply evidence-driven response and dimension fixes without duplicate paid requests.

### Current Progress

- Confirmed four Yunfei entries exist and the settings API exposes masks only.
- Completed the six-case compatibility matrix without retrying either ambiguous local result.
- The provider dashboard confirmed that tests 4 and 5 succeeded and were charged even though the first local client could not recover their images.
- Added dual snake_case/camelCase Gemini result parsing after Google official documentation showed `inlineData`/`mimeType` while the relay document showed `inline_data`/`mime_type`.
- Updated the GPT 1K-key expected dimensions to the observed 1672x941 so production validation does not reject a successful image.
- Changed GPT 4K generation and edit requests to ask for the documented short-lived URL result and download it immediately instead of transferring an oversized base64 JSON body.
- Test 6, Banana Pro, succeeded locally after the Gemini parser fix and returned the documented 1376x768 PNG.
- The current production-role selection in this isolated worktree remains text = Yunfei GPT 4K and image = environment ToAPIs; the direct compatibility runner did not modify roles.

### Changed Files

- `server/src/providers/yunfei-hybrid-images-adapter.ts`: camelCase Gemini result support, GPT 1K-key validation dimensions, and URL-first GPT 4K recovery.
- `server/tests/yunfei-hybrid-images-adapter.test.ts`: red/green coverage for both Gemini response casings, GPT 1K-key evidence, and GPT 4K URL generation/edit requests.
- `WORKLOG.md`: paid-test evidence, stop points, and evidence-driven fixes.
- External-only evidence and images were written to the current Codex visualization directory; no generated image or credential was added to the repository.

### Verification

- Test 1, GPT 1K key / GPT 1K: HTTP 200, 59.392 seconds, inline PNG, actual 1672x941 versus requested/expected 1280x720.
- Test 2, GPT 4K key / GPT 1K: HTTP 200, 50.248 seconds, inline PNG, actual 1280x720, matched.
- Test 3, GPT 4K key / GPT 2K: HTTP 200, 123.177 seconds, inline PNG, actual 2048x1152, matched.
- Test 4, GPT 4K key / GPT 4K: local base64 body exceeded the 300-second client window, while the provider dashboard confirmed successful completion; no duplicate request was sent.
- Test 5, Banana 2 / 1K: local parser did not recognize the successful response, while the provider dashboard confirmed success and charge; no duplicate request was sent.
- Test 6, Banana Pro / 1K: HTTP 200, 120.704 seconds, inline PNG, actual 1376x768, matched.
- The four locally saved images were visually inspected and contain the requested clean product photo with a horizontal approximately 16:9 composition.
- Gemini camelCase tests failed before the fix and passed after it; the adapter suite now passes 17/17.
- Fresh `npm test`: 103 backend tests and 54 frontend tests passed (157 total).
- Fresh `npm run build`: server TypeScript build and React/Vite production build passed.
- `git diff --check`: passed before this worklog update.
- Sanitized evidence: `yunfei-paid-matrix-evidence.json` outside the repository. No key, request header, raw response, or base64 data was logged.

### Next Step

1. Keep both prior ambiguous requests un-retried; provider-side success is sufficient evidence.
2. User selects the desired formal production roles in `/settings`; the code must not overwrite that preference.
3. Complete the development-branch handoff without committing local keys, provider settings, or generated images.

### Risks And Notes

- Tests 4 and 5 were confirmed charged and successful by the provider dashboard even though their images were not recovered by the pre-fix local client.
- Never resume or retry tests 4 or 5 implicitly.
- The GPT 4K URL path is covered by adapter tests and provider documentation but was intentionally not live-retried after the base64 timeout.
- The GPT 1K-key returns 1672x941 for the same 1280x720 request that the GPT 4K key returns exactly; validation is therefore key-product-aware.
- Never print, stage, commit, or paste keys, provider settings, generated images, or raw base64 provider responses.

## 2026-08-19 Yunfei Key Product Correction Implementation

### Current Goal

Represent each Yunfei credential as one of four model-specific key products, verify provider-aware model and resolution switching, and stop before local key entry or paid generation.

### Current Progress

- Replaced the generic Yunfei resolution tier with `yunfeiKeyType`: `gpt-image-2-1k`, `gpt-image-2-4k`, `banana-2`, or `banana-pro`.
- Restricted every saved Yunfei key to its single authorized model before any provider request is sent.
- Kept GPT Image 2 1K keys at 1K, GPT Image 2 4K keys at 1K/2K/4K, and both Banana products at 1K/2K/4K.
- Updated masked persistence, API validation, runtime capabilities, settings controls, saved-provider metadata, and editor role switching.
- Verified that uploading a row reference switches that row from the active text provider (Banana 2) to the active image provider (Banana Pro), exposes only the compatible model, and retains 1K/2K/4K choices.
- No Yunfei credential has been saved and no paid provider request has been sent.

### Changed Files

- `server/src/providers/provider-adapter.ts`, `server/src/providers/yunfei-hybrid-images-adapter.ts`: key-product runtime contract and exact per-product capability isolation.
- `server/src/services/provider-settings-service-v2.ts`, `server/src/routes/provider-settings-routes.ts`: local storage normalization, masked output, validation, revision behavior, and active-task guards.
- `server/tests/`: key-product persistence, API, adapter, production routing, and capability regressions.
- `web/src/lib/provider-settings-api.ts`, `web/src/settings-page.tsx`: four-key-product types and settings UI.
- `web/src/tests/`: settings and editor coverage for model isolation and text/image role switching.
- `docs/superpowers/specs/2026-08-19-yunfei-image-provider-design.md`, `docs/superpowers/plans/2026-08-19-yunfei-key-product-correction.md`: corrected approved design and execution plan.

### Verification

- TDD red/green cycles covered shared types, persistence, route validation, adapter isolation, production routing, settings UI, and editor role switching.
- Focused backend verification: 6 files and 37 tests passed.
- Focused frontend verification: 3 files and 20 tests passed.
- Fresh `npm test`: 101 backend tests and 54 frontend tests passed (155 total).
- Fresh `npm run build`: server TypeScript build and React/Vite production build passed.
- `git diff --check`: passed before this worklog update.
- Browser smoke passed at 1440x900 and 390x844 on an isolated worktree port, including all four settings options, masked saved metadata, row-level text/image provider switching, model rejection/reselection, 1K/2K/4K options, disabled empty submission, no console errors, and no horizontal overflow.
- Four browser screenshots were visually inspected and stored outside the repository in the current Codex visualization directory; desktop and mobile layouts were readable with no clipping or overlap found.

### Next Step

1. Keep the isolated worktree app available for local setup.
2. User saves four local entries through `/settings`: Yunfei GPT 1K, GPT 4K, Banana 2, and Banana Pro.
3. Confirm the API returns masks only and the two active roles point to Banana 2 for text-to-image and Banana Pro for image-to-image.
4. Run the approved six paid tests and record exact status, returned dimensions, key product, model, and error evidence.
5. Stop before retrying any ambiguous paid request that could create a duplicate charge.

### Risks And Notes

- GPT Image 2's exact accepted 16:9 pixel candidates remain evidence-gated until the paid compatibility run.
- The only remaining `resolutionTier` text is an intentional frontend negative assertion proving the obsolete field is not submitted.
- Never print, stage, commit, or paste keys, `app-data/provider-settings.json`, generated images, or raw base64 provider responses.
- Do not edit `.env`, deploy, or retry an ambiguous paid request without separate authority.

## 2026-08-19 Yunfei Key Product Correction Plan

### Current Goal

Prepare a TDD execution plan that replaces the incorrect generic Yunfei resolution tier with four model-product-specific key types.

### Current Progress

- Converted the confirmed correction design into seven implementation and verification tasks.
- Mapped every existing `resolutionTier` touchpoint across runtime types, local persistence, API validation, adapter capabilities, production routing, frontend settings, editor fixtures, and browser checks.
- Defined red/green tests that prove every saved key exposes one authorized model only.
- Replaced the old eight-request live gate with the user-approved six-request matrix.
- Retained the explicit user checkpoint before local key storage and the stop rule for ambiguous paid requests.
- No production source, credential, provider setting, or external request was changed.

### Changed Files

- `docs/superpowers/plans/2026-08-19-yunfei-key-product-correction.md`: exact file map, red/green steps, commands, commits, browser gate, and six paid tests.
- `WORKLOG.md`: correction-plan handoff.

### Verification

- Self-reviewed the plan against every section of the corrected design specification.
- Checked for placeholders, inconsistent field names, obsolete two-key assumptions, and missing source/test touchpoints.
- Confirmed the plan uses `yunfeiKeyType` consistently with the four approved enum values.
- `git diff --check` passed before this worklog update.

### Next Step

1. Continue the already-selected inline execution approach.
2. Use `superpowers:executing-plans` and TDD for Tasks 1-5.
3. Run complete automated and browser verification in Task 6.
4. Stop for four local key entries, then run the six paid tests in Task 7.

### Risks And Notes

- The live GPT 16:9 pixel candidates remain evidence-gated.
- Do not carry `resolutionTier` forward as a compatibility field because no Yunfei credential was saved under it.
- Never print, stage, commit, or paste keys, provider settings, generated images, or raw base64 responses.

## 2026-08-19 Yunfei Key Product Correction Design

### Current Goal

Correct the Yunfei provider model so GPT resolution groups and Banana model-specific keys are represented as different key products before any real credential is stored or paid request is sent.

### Current Progress

- Compared the supplied API document with the later key-generation screenshot.
- Confirmed GPT Image 2 has separate 1K and 4K groups.
- Confirmed Banana 2 and Banana Pro have separate model keys, each marked as supporting 1K, 2K, and 4K.
- Replaced the approved design's generic 1K/4K tier concept with four explicit key products.
- Changed the approved paid release gate from eight redundant requests to six requests: four GPT group/size checks plus one 1K request for each Banana model.
- Queried only the masked local settings API and confirmed no Yunfei key has been saved, so this correction requires no credential migration.
- No production source, local credential, provider configuration, or external request has been changed.

### Changed Files

- `docs/superpowers/specs/2026-08-19-yunfei-image-provider-design.md`: corrected key-product schema, capabilities, settings entries, test coverage, live matrix, and acceptance criteria.
- `WORKLOG.md`: correction-design handoff.

### Verification

- Cross-checked the four key products against the supplied GPT endpoint documentation and Banana key-generation screenshot.
- Scanned the revised design for obsolete two-key, generic-tier, and eight-test assumptions.
- Confirmed the local masked settings response contains only the read-only environment provider.
- Source tests and builds are intentionally deferred because this stage changes design documentation only.

### Next Step

1. User reviews and approves the corrected written specification.
2. Revise the implementation plan around `yunfeiKeyType` and six paid tests.
3. Implement the correction with red/green tests before changing production code.
4. Run the full automated and browser verification gates.
5. Ask the user to save four local masked entries, then run the six approved paid tests.

### Risks And Notes

- Do not preserve the old `resolutionTier` field for Yunfei in production behavior; it conflates GPT groups with Banana model keys.
- Each Yunfei entry must expose only one authorized model, even though the hybrid adapter owns both protocol families.
- Never print, stage, commit, or paste keys, provider settings, generated images, or raw base64 responses.

## 2026-08-19 Yunfei Hybrid Image Provider Implementation

### Current Goal

Add `img.yunfei.best` as a formal production provider for GPT Image 2, Nano Banana 2, and Nano Banana Pro, with separate 1K/4K key tiers and provider-aware text-to-image/image-to-image routing.

### Current Progress

- Added the `yunfei-hybrid-images` protocol and provider-aware capability/request-resolution contracts.
- Added formal 1K/4K key-tier persistence, validation, masked API responses, settings-page controls, and saved-provider metadata.
- Implemented GPT Image 2 OpenAI Images requests for JSON generations and multipart edits, including repeated reference files and immediate URL/base64 result recovery.
- Implemented Nano Banana 2 and Nano Banana Pro through Gemini native `generateContent`, preserving prompt/reference order and scanning every candidate/part for inline or file image data.
- Routed root tasks and reference-image child tasks through the selected role adapter. Direct Nano Banana Pro no longer depends on the global ToAPIs model table.
- Added bounded retry behavior for safe Gemini 429 responses and retained the existing unknown-submission guard for ambiguous synchronous failures.
- Added frontend capability coverage for all three models, key-tier resolution restrictions, restored unsupported values, and role switching after a reference upload.
- Automated tests, production builds, and mocked browser smoke checks are complete. No local Yunfei key has been saved and no paid live request has been sent.

### Changed Files

- `server/src/providers/provider-adapter.ts`, `provider-registry.ts`, `toapis-async-adapter.ts`, and `ym2-openai-images-adapter.ts`: provider-aware adapter contracts and registry support.
- `server/src/providers/yunfei-hybrid-images-adapter.ts`: Yunfei GPT/Gemini protocol implementation, tier capabilities, response recovery, and error classification.
- `server/src/services/provider-settings-service.ts`, `server/src/routes/provider-settings-routes.ts`, and related types: key-tier storage, validation, masking, revision behavior, and formal settings APIs.
- `server/src/services/batch-service.ts`, route wiring, and app setup: provider-aware creation validation and production dispatch for root/child jobs.
- `server/tests/`: tier, protocol, settings, routing, response, retry, and one-job-per-output coverage.
- `web/src/settings-page.tsx` and `web/src/lib/provider-settings-api.ts`: Yunfei protocol and conditional 1K/4K key-tier controls.
- `web/src/lib/task-draft.ts` and `web/src/tests/`: role-aware editor validation and capability regression coverage.
- `docs/superpowers/specs/2026-08-19-yunfei-image-provider-design.md` and `docs/superpowers/plans/2026-08-19-yunfei-image-provider.md`: approved design and TDD execution plan.

### Verification

- TDD red/green cycles were run for provider contracts, tier settings, GPT requests, Gemini requests, production routing, and frontend capability behavior.
- Focused backend verification: 8 files and 44 tests passed.
- Focused frontend verification: 3 files and 19 tests passed.
- Fresh `npm test`: 101 backend tests and 53 frontend tests passed (154 total).
- Fresh `npm run build`: server TypeScript build and React/Vite production build passed.
- `git diff --check`: passed before the browser stage.
- Browser smoke passed 20 assertions at 1440x900 and 390x844 on an isolated worktree port: dual role selection, masked key, saved tier metadata, conditional 1K/4K controls, three-model availability, 1K restriction, disabled empty submission, no console errors, and no horizontal overflow.
- Four browser screenshots were visually inspected and stored outside the repository in the current Codex visualization directory.
- No `.env`, API key, formal provider settings, production history, generated image, or external provider quota was changed or consumed.

### Next Step

1. Start this worktree's local app on isolated ports.
2. User saves `云飞 1K` and `云飞 4K` through `/settings`; keys remain local and must not be pasted into chat.
3. Confirm both entries are returned only as masks.
4. Run the approved eight-image paid compatibility matrix and record exact request status, output dimensions, model/tier, and error evidence.
5. If any synchronous job becomes `unknown`, stop and request a new duplicate-charge confirmation before retrying it.

### Risks And Notes

- GPT Image 2's exact 16:9 size acceptance is not published in the supplied document; the candidate 1K/2K/4K mappings remain gated by live evidence.
- Banana 2/Pro use a different protocol from GPT Image 2 even though one Yunfei provider entry can route all three models.
- A 4K key advertises 1K/2K/4K for GPT Image 2, while the approved live matrix intentionally tests Banana models at 1K only.
- Never print, stage, commit, or paste local keys, `app-data/provider-settings.json`, generated images, or raw base64 provider responses.
- Do not deploy, push, edit `.env`, or retry an ambiguous paid request without the required authority.

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

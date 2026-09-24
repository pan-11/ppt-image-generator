# Project Library And Bulk Image Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save the current workbench as a reusable project, create an independent project from one image per page, and keep textless runs attached to the current project.

**Architecture:** Reuse the existing `coursewares` record and per-page uploaded-image endpoint. The React workbench owns save-then-switch and a sequential import queue; the server continues to own image validation, selected-image ownership, revision and textless task links. Add only derived project-list summaries; do not change the database schema.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Fastify, SQLite, Sharp.

---

## Boundaries and file map

- Modify `web/src/App.tsx`: project creation and switching orchestration; keep old batch responses out of the active project.
- Modify `web/src/hooks/use-courseware.ts`: reused save/creation/install semantics and project-scoped upload state.
- Modify `web/src/components/courseware/courseware-toolbar.tsx`: save, new and history entries.
- Modify `web/src/components/courseware/courseware-list-modal.tsx`: useful project summaries.
- Create `web/src/components/courseware/new-project-modal.tsx`: name, blank and image import entry.
- Create `web/src/components/courseware/bulk-image-import-modal.tsx`: selection, preview, reordering, progress and per-file retry.
- Create `web/src/lib/image-import.ts`: deterministic file ordering and import plan without UI state.
- Modify `web/src/components/tasks/task-table.tsx`: real zero-page empty state.
- Modify `web/src/hooks/use-active-batch.ts`: ignore poll results from a prior batch.
- Modify `server/src/db/repositories/coursewares-repository.ts`: derive cover and selected count for the list API if needed.
- Modify `server/src/services/courseware-service.ts` and `server/src/routes/courseware-routes.ts`: adopt an unsaved editor containing root tasks from multiple batches into one project, linking descendants transactionally without a schema change.
- Modify `web/src/components/courseware/textless-panel.tsx` only if the new cross-project regression reveals a gap; preserve the existing source manifest and service contract.
- Add focused tests in `web/src/tests/` and `server/tests/courseware-workflow.test.ts`; document completion in `WORKLOG.md`.

## Task 1: Isolate project switching and support a blank project

- [ ] Write a failing UI regression: save an edited A, create blank B, refresh, and assert B has zero pages and no A images, reference or rows. Add a late-batch-response assertion. Put it in `web/src/tests/project-library.test.tsx`.

```tsx
expect(screen.getByRole("heading", { name: "项目 B" })).toBeVisible();
expect(screen.queryByText("A 的图片")).not.toBeInTheDocument();
expect(screen.getByText("还没有页面")).toBeVisible();
```

- [ ] Run `npm run test -w web -- project-library.test.tsx`; the new-project control and empty state must fail before implementation.
- [ ] Implement a shared save-then-switch operation in `App.tsx`, a blank project `CoursewareDocument` with `pages: []`, a project-creation UI in `new-project-modal.tsx`, and an empty state in `task-table.tsx`. Use the existing `courseware.create/open/flush` hooks and validate that a failed flush leaves A installed.

```ts
const blank: CoursewareDocument = {
  id: crypto.randomUUID(), name, sourceKind: "manual", rawImportText: null,
  importMode: null, legacyBatchId: null, globalReferenceImageId: null,
  revision: 0, pages: []
};
await courseware.create(blank); // create() flushes the current courseware first
```

- [ ] Run `npm run test -w web -- project-library.test.tsx courseware-restore.test.tsx app-history-restore.test.tsx`; expected result: all selected tests pass.

## Task 2: Make the image import plan deterministic

Before Task 2, cover the multi-batch legacy path exposed by Task 1: create two unlinked root tasks in separate batches, one child task, and an editor document with both pages. Assert a single new courseware owns all three task links. Add `POST /api/coursewares/from-editor` with an idempotent document ID and `{ pageId, taskId }` root mapping; reject tasks already owned by another project. The frontend uses this route only when the current unsaved editor includes roots from different batches, so the existing single-batch history path is preserved. Run the new focused server test red then green and a focused frontend switch test before proceeding.

- [ ] Write failing unit tests in `web/src/tests/image-import.test.ts` for natural order (`1, 2, 10`), stable same-name order, one stable page/upload ID per file, 20 MiB per file, current `maxBatchSize`, and total 200 MiB. The tests must call the real planner.

```ts
expect(planImageImport([file("10.png"), file("2.png"), file("1.png")], 100).items.map(x => x.file.name))
  .toEqual(["1.png", "2.png", "10.png"]);
```

- [ ] Run `npm run test -w web -- image-import.test.ts`; missing planner or wrong ordering must fail.
- [ ] Add `web/src/lib/image-import.ts`: return an ordered plan containing original `File`, stable `pageId/uploadId`, display name, decoded size and aspect ratio; expose a reorder operation that changes position without changing identity. Validate before any server mutation. The browser preview may read metadata, while the existing server upload remains the authority for complete decoding.

```ts
type ImportItem = { file: File; pageId: string; uploadId: string; name: string; width: number; height: number };
type ImportPlan = { items: ImportItem[]; errors: string[] };
```

- [ ] Run `npm run test -w web -- image-import.test.ts`; expected result: ordering and limits pass.

## Task 3: Upload a new image project and recover partial imports

- [ ] Write failing frontend integration tests in `web/src/tests/project-image-import.test.tsx`: importing N files creates exactly N pages in selected order, uploads each to its page once, sets each selected image, retries only failed files with the same upload ID, and preserves successes after reopen. Add a server route test for a pure uploaded-image project and saved selection in `server/tests/courseware-workflow.test.ts`.
- [ ] Run `npm run test -w web -- project-image-import.test.tsx` and `npm run test -w server -- courseware-workflow.test.ts`; the new UI and route scenario must fail for the expected missing behavior.
- [ ] Build `bulk-image-import-modal.tsx` and connect it through the toolbar and `App.tsx`. First create the project with all planned pages, then reuse `courseware.uploadImage` sequentially. Persist a small browser manifest of page/upload IDs and filenames for retries; do not store `File` bytes. On restore, fetch courseware detail and ask to reselect pending files. An import into the current blank project patches those pages into that same ID.

```ts
for (const item of plan.items) {
  if (alreadyUploaded.has(item.uploadId)) continue;
  await courseware.uploadImage(item.pageId, item.file, item.uploadId);
}
```

- [ ] Run the two focused commands again; expected result: all tests pass. Confirm no image-generation API is called during import.

## Task 4: Make history projects and textless selection project-specific

- [ ] Write failing tests for project A/B list summaries, late active-batch responses, and a textless run created from B's uploaded selected image. Assert the run belongs to B and A's textless list is unchanged.

```ts
expect(run.run.coursewareId).toBe(projectB.id);
expect(run.run.manifest.map(page => page.sourceImageId)).toEqual([uploadedB.id]);
expect(textless.runs.list(projectA.id)).toEqual([]);
```

- [ ] Run focused web/server tests; confirm the intended missing behavior or stale-state bug fails before implementation.
- [ ] Add derived `coverImageId` and `selectedPageCount` to the project list, render them in `courseware-list-modal.tsx`, guard stale polling in `use-active-batch.ts`, and adjust `textless-panel.tsx` only if necessary. The server already validates selected-image ownership in `CoursewareService.selected()` and links textless tasks through `TextlessService.create()`.
- [ ] Run the focused tests; expected result: B's textless run and list remain in B while A is unchanged.

## Task 5: Full verification and delivery

- [ ] Run `npm test`, `npm run build`, and `git diff --check`; expected result: zero test/build failures and no diff whitespace errors.
- [ ] Exercise the local UI with an isolated non-production data directory and mock image provider: save A, import B, reopen both, retry one failed upload, create a B textless run without a paid request. Record the result in `WORKLOG.md` and retain evidence under `app-data/project-import-*`.
- [ ] Review the implementation against all 15 cases in `docs/superpowers/specs/2026-09-24-project-library-and-bulk-image-import-design.md`. Inspect every changed path with `git diff --stat` and `git status --short`; synchronize only verified scoped files into the primary workspace, preserving its existing design and log edits.
- [ ] Run `npm test`, `npm run build`, and `git diff --check` in the primary workspace after synchronization, then report exact results and any limits. Do not publish, deploy, delete data, migrate schema or edit secrets.

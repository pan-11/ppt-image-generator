# Batch Prompt Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paste-based “批量导入提示词” workflow that parses structured multi-page PPT prompts into an exact number of task rows and persists page metadata as notes without sending notes to the image provider.

**Architecture:** Keep parsing as a pure web utility so the modal can preview and reject malformed input before changing editor state. Carry an optional task note through the existing batch API and SQLite repository, normalize old data to an empty note, and render the note only in the task-row heading. Reuse the existing startup-time additive column migration pattern.

Structured input remains in structured mode when validation fails; it must not fall back to line mode（结构化解析失败时不回退）.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 3, Testing Library, Fastify 5, better-sqlite3 12.

---

## Scope Check

This is one coherent feature. The parser, editor integration, persistence, and history restoration all serve the same task-note data flow and should remain in one implementation plan.

## File Map

### Create

- `web/src/lib/bulk-prompt-import.ts`: pure structured/line-mode parser and validation.
- `web/src/tests/bulk-prompt-import.test.ts`: parser unit tests.

### Modify

- `web/src/components/tasks/bulk-paste-modal.tsx`: rename the visible workflow, show parsing mode, preview, errors, and import count.
- `web/src/components/tasks/task-table.tsx`: import exact-count rows and confirm before replacing non-empty drafts.
- `web/src/components/tasks/task-row.tsx`: render a read-only note beside the row-number badge.
- `web/src/lib/task-draft.ts`: default new task notes to an empty string.
- `web/src/lib/types.ts`: add task-note types.
- `web/src/lib/api.ts`: include notes in batch creation payloads.
- `web/src/lib/editor-session.ts`: normalize older local sessions that have no note.
- `web/src/lib/history-snapshot.ts`: restore persisted notes into task drafts.
- `web/src/styles.css`: style the row heading, note, import preview, and errors.
- `web/src/tests/task-table.test.tsx`: exact-count import, note display, preview, and overwrite protection.
- `web/src/tests/editor-session.test.ts`: local note persistence and old-session normalization.
- `web/src/tests/history-snapshot.test.ts`: persisted-note restoration.
- `web/src/tests/app-history-restore.test.tsx`: note display after history restore.
- `server/src/db/schema.sql`: include the nullable `tasks.note` column in new databases.
- `server/src/db/database.ts`: add the note column to existing databases.
- `server/src/db/repositories/tasks-repository.ts`: write and normalize task notes.
- `server/src/routes/batch-routes.ts`: accept optional notes on batch tasks.
- `server/tests/repositories.test.ts`: repository persistence and legacy migration coverage.
- `server/tests/batch-routes.test.ts`: API persistence and old-request compatibility.
- `server/tests/provider-selection.test.ts`: prove provider payloads contain the prompt but not the note.
- `WORKLOG.md`: record implementation, verification, and remaining risks.

## Task 1: Build the Pure Prompt Parser

**Files:**

- Create: `web/src/tests/bulk-prompt-import.test.ts`
- Create: `web/src/lib/bulk-prompt-import.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `web/src/tests/bulk-prompt-import.test.ts` with the complete test cases below:

```ts
import { describe, expect, it } from "vitest";
import { parseBulkPromptImport } from "../lib/bulk-prompt-import";

const structuredText = `《课程总标题》
【页面编号】封面
【页面名称】乘法的初步认识
【生图提示词】
生成一张16:9横版封面。
保留明亮留白。
【画面核心文字】
乘法的初步认识
二年级数学
【关键画面元素】
数学乐园；AI助手
【页面编号】P1
【页面名称】系统故障
【生图提示词】生成一张系统故障页。
【画面核心文字】
系统异常
【关键画面元素】
控制屏；警示灯`;

describe("parseBulkPromptImport", () => {
  it("parses structured pages in source order and composes notes", () => {
    const result = parseBulkPromptImport(structuredText, 100);

    expect(result.mode).toBe("structured");
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([
      {
        note: "封面 · 乘法的初步认识",
        prompt: `【生图提示词】
生成一张16:9横版封面。
保留明亮留白。

【画面核心文字】
乘法的初步认识
二年级数学

【关键画面元素】
数学乐园；AI助手`
      },
      {
        note: "P1 · 系统故障",
        prompt: `【生图提示词】
生成一张系统故障页。

【画面核心文字】
系统异常

【关键画面元素】
控制屏；警示灯`
      }
    ]);
  });

  it("keeps simple line imports and leaves notes empty", () => {
    const result = parseBulkPromptImport(" forest fox \n\n glass city ", 100);

    expect(result).toEqual({
      mode: "lines",
      items: [
        { prompt: "forest fox", note: "" },
        { prompt: "glass city", note: "" }
      ],
      errors: []
    });
  });

  it("reports missing structured fields without falling back to line mode", () => {
    const result = parseBulkPromptImport(`【页面编号】P2
【页面名称】缺字段页面
【生图提示词】只有正文`, 100);

    expect(result.mode).toBe("structured");
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([
      "P2 缺少：画面核心文字、关键画面元素"
    ]);
  });

  it("rejects duplicate page numbers", () => {
    const repeated = `${structuredText}\n${structuredText.replace("封面", "P1")}`;
    const result = parseBulkPromptImport(repeated, 100);

    expect(result.mode).toBe("structured");
    expect(result.errors).toContain("页面编号重复：P1");
  });

  it("rejects empty input and imports beyond the batch limit", () => {
    expect(parseBulkPromptImport("  ", 100).errors).toEqual(["没有识别到有效提示词"]);
    expect(parseBulkPromptImport("one\ntwo\nthree", 2).errors).toEqual([
      "识别到 3 条提示词，单批最多 2 条"
    ]);
  });
});
```

- [ ] **Step 2: Run the parser test and verify that it fails**

Run:

```powershell
npm run test -w web -- bulk-prompt-import.test.ts
```

Expected: FAIL because `../lib/bulk-prompt-import` does not exist.

- [ ] **Step 3: Implement the pure parser**

Create `web/src/lib/bulk-prompt-import.ts`:

```ts
export type BulkImportItem = {
  prompt: string;
  note: string;
};

export type BulkImportResult = {
  mode: "structured" | "lines";
  items: BulkImportItem[];
  errors: string[];
};

const fieldNames = [
  "页面编号",
  "页面名称",
  "生图提示词",
  "画面核心文字",
  "关键画面元素"
] as const;

type StructuredField = typeof fieldNames[number];
type StructuredRecord = Partial<Record<StructuredField, string[]>>;

const markerPattern = /^【(页面编号|页面名称|生图提示词|画面核心文字|关键画面元素)】\s*(.*)$/;

function readField(record: StructuredRecord, field: StructuredField) {
  return (record[field] ?? []).join("\n").trim();
}

function parseLineMode(text: string, maxBatchSize: number): BulkImportResult {
  const items = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((prompt) => ({ prompt, note: "" }));
  const errors: string[] = [];

  if (items.length === 0) {
    errors.push("没有识别到有效提示词");
  }
  if (items.length > maxBatchSize) {
    errors.push(`识别到 ${items.length} 条提示词，单批最多 ${maxBatchSize} 条`);
  }

  return { mode: "lines", items, errors };
}

function parseStructuredMode(text: string, maxBatchSize: number): BulkImportResult {
  const records: StructuredRecord[] = [];
  let currentRecord: StructuredRecord | null = null;
  let currentField: StructuredField | null = null;

  for (const line of text.split("\n")) {
    const marker = line.trim().match(markerPattern);
    if (marker) {
      const field = marker[1] as StructuredField;
      const inlineValue = marker[2].trim();

      if (field === "页面编号") {
        if (currentRecord) {
          records.push(currentRecord);
        }
        currentRecord = {};
      }

      if (!currentRecord) {
        continue;
      }

      currentField = field;
      currentRecord[field] = inlineValue ? [inlineValue] : [];
      continue;
    }

    if (currentRecord && currentField) {
      currentRecord[currentField]?.push(line);
    }
  }

  if (currentRecord) {
    records.push(currentRecord);
  }

  const items: BulkImportItem[] = [];
  const errors: string[] = [];
  const seenPageNumbers = new Set<string>();

  records.forEach((record, index) => {
    const pageNumber = readField(record, "页面编号");
    const pageName = readField(record, "页面名称");
    const imagePrompt = readField(record, "生图提示词");
    const coreText = readField(record, "画面核心文字");
    const keyElements = readField(record, "关键画面元素");
    const location = pageNumber || `第 ${index + 1} 条记录`;
    const missing = fieldNames.filter((field) => !readField(record, field));

    if (missing.length > 0) {
      errors.push(`${location} 缺少：${missing.join("、")}`);
      return;
    }

    if (seenPageNumbers.has(pageNumber)) {
      errors.push(`页面编号重复：${pageNumber}`);
    }
    seenPageNumbers.add(pageNumber);

    items.push({
      note: `${pageNumber} · ${pageName}`,
      prompt: `【生图提示词】\n${imagePrompt}\n\n【画面核心文字】\n${coreText}\n\n【关键画面元素】\n${keyElements}`
    });
  });

  if (records.length === 0) {
    errors.push("没有识别到有效提示词");
  }
  if (items.length > maxBatchSize) {
    errors.push(`识别到 ${items.length} 条提示词，单批最多 ${maxBatchSize} 条`);
  }

  return { mode: "structured", items, errors };
}

export function parseBulkPromptImport(value: string, maxBatchSize: number): BulkImportResult {
  const text = value.replace(/\r\n?/g, "\n");
  const hasStructuredMarker = text
    .split("\n")
    .some((line) => markerPattern.test(line.trim()));

  return hasStructuredMarker
    ? parseStructuredMode(text, maxBatchSize)
    : parseLineMode(text, maxBatchSize);
}
```

- [ ] **Step 4: Run the parser test and verify that it passes**

Run:

```powershell
npm run test -w web -- bulk-prompt-import.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit the parser**

```powershell
git add -- web/src/lib/bulk-prompt-import.ts web/src/tests/bulk-prompt-import.test.ts
git commit -m "feat: parse bulk prompt text"
```

## Task 2: Integrate Exact-Count Import and Note Display

**Files:**

- Modify: `web/src/components/tasks/bulk-paste-modal.tsx:1-51`
- Modify: `web/src/components/tasks/task-table.tsx:1-88`
- Modify: `web/src/components/tasks/task-row.tsx:58-63`
- Modify: `web/src/lib/task-draft.ts:11-23`
- Modify: `web/src/lib/types.ts:31-41`
- Modify: `web/src/styles.css:40-58`
- Modify: `web/src/tests/task-table.test.tsx:1-85`
- Modify: `web/src/tests/editor-session.test.ts:12-23,54-65`

- [ ] **Step 1: Replace the old padding test with failing import workflow tests**

In `web/src/tests/task-table.test.tsx`, import `fireEvent`, keep the default-row and single-row-generation tests, and replace the old “keeps at least thirty rows” test with these three cases:

```tsx
it("imports exactly the number of pasted line prompts", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "批量导入提示词" }));
  fireEvent.change(screen.getByTestId("bulk-paste-input"), {
    target: { value: "forest fox\nglass city" }
  });
  expect(screen.getByText("逐行格式 · 2 条")).toBeInTheDocument();
  await user.click(screen.getByTestId("bulk-import"));

  expect(screen.getAllByRole("textbox")).toHaveLength(2);
  expect(screen.getByDisplayValue("forest fox")).toBeInTheDocument();
  expect(screen.getByDisplayValue("glass city")).toBeInTheDocument();
});

it("previews and displays a structured page note", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const value = `【页面编号】P1
【页面名称】AI数学乐园系统故障
【生图提示词】生成故障页
【画面核心文字】系统异常
【关键画面元素】控制屏；警示灯`;

  await user.click(screen.getByRole("button", { name: "批量导入提示词" }));
  fireEvent.change(screen.getByTestId("bulk-paste-input"), { target: { value } });

  expect(screen.getByText("结构化格式 · 1 条")).toBeInTheDocument();
  expect(screen.getByText("P1 · AI数学乐园系统故障")).toBeInTheDocument();
  await user.click(screen.getByTestId("bulk-import"));

  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.getByText("P1 · AI数学乐园系统故障")).toBeInTheDocument();
  expect(screen.getByDisplayValue(/【生图提示词】/)).toBeInTheDocument();
});

it("keeps existing rows when replacement is cancelled", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Harness />);

  await user.type(screen.getAllByRole("textbox")[0], "existing prompt");
  await user.click(screen.getByRole("button", { name: "批量导入提示词" }));
  fireEvent.change(screen.getByTestId("bulk-paste-input"), {
    target: { value: "replacement prompt" }
  });
  await user.click(screen.getByTestId("bulk-import"));

  expect(confirm).toHaveBeenCalledWith("导入将替换当前任务列表，是否继续？");
  expect(screen.getByDisplayValue("existing prompt")).toBeInTheDocument();
  expect(screen.getByTestId("bulk-paste-input")).toBeInTheDocument();
});

it("does not change existing rows when structured input is invalid", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.type(screen.getAllByRole("textbox")[0], "existing prompt");
  await user.click(screen.getByRole("button", { name: "批量导入提示词" }));
  fireEvent.change(screen.getByTestId("bulk-paste-input"), {
    target: {
      value: `【页面编号】P2
【页面名称】缺字段页面
【生图提示词】只有正文`
    }
  });

  expect(screen.getByText("P2 缺少：画面核心文字、关键画面元素")).toBeInTheDocument();
  expect(screen.getByTestId("bulk-import")).toBeDisabled();
  expect(screen.getByDisplayValue("existing prompt")).toBeInTheDocument();
});
```

Also change the first import to:

```ts
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
```

- [ ] **Step 2: Run the task-table test and verify that it fails**

Run:

```powershell
npm run test -w web -- task-table.test.tsx
```

Expected: FAIL because the visible button name, exact-row import, preview, and note rendering do not exist.

- [ ] **Step 3: Add the note type and default**

Add `note` to `TaskDraft` in `web/src/lib/types.ts`:

```ts
export type TaskDraft = {
  id: string;
  prompt: string;
  note: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  n: number;
  referenceMode: "none" | "row" | "global";
  referenceImageId: string | null;
  submittedTaskId?: string | null;
};
```

Add the default immediately after `prompt` in `createTaskDraft`:

```ts
prompt: "",
note: "",
```

Add `note: ""` to both direct `TaskDraft` literals in `web/src/tests/editor-session.test.ts` so the required type remains consistent before the backward-compatibility test is added in Task 4.

Also add an empty note to the child-draft object in `createChildDraft` in `web/src/components/tasks/task-row.tsx`:

```ts
id: `child-${Math.random().toString(36).slice(2, 10)}`,
prompt: "",
note: "",
model: model.value,
```

- [ ] **Step 4: Replace the modal with the parsed preview workflow**

Replace `web/src/components/tasks/bulk-paste-modal.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { parseBulkPromptImport, type BulkImportItem } from "../../lib/bulk-prompt-import";

export function BulkPasteModal(props: {
  open: boolean;
  maxBatchSize: number;
  onClose: () => void;
  onImport: (items: BulkImportItem[]) => void;
}) {
  const [value, setValue] = useState("");
  const result = useMemo(
    () => parseBulkPromptImport(value, props.maxBatchSize),
    [props.maxBatchSize, value]
  );
  const canImport = result.items.length > 0 && result.errors.length === 0;
  const notes = result.items.map((item) => item.note).filter(Boolean);

  if (!props.open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card bulk-import-modal">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">批量导入提示词</p>
            <h3>粘贴整份提示词文本</h3>
          </div>
          <button className="ghost-button" data-testid="bulk-close" onClick={props.onClose}>关闭</button>
        </div>

        <label className="stacked">
          <span>提示词内容</span>
          <textarea
            data-testid="bulk-paste-input"
            aria-label="提示词内容"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={"可粘贴带【页面编号】等标记的完整内容，也可保持一行一个提示词"}
          />
        </label>

        <section className="bulk-import-preview" aria-label="导入预览">
          <strong>{result.mode === "structured" ? "结构化格式" : "逐行格式"} · {result.items.length} 条</strong>
          {notes.length > 0 ? (
            <ol>
              {notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
            </ol>
          ) : null}
          {result.errors.length > 0 ? (
            <ul className="bulk-import-errors">
              {result.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          ) : null}
        </section>

        <div className="modal-footer">
          <span>单批最多 {props.maxBatchSize} 条</span>
          <button
            className="primary-button"
            data-testid="bulk-import"
            disabled={!canImport}
            onClick={() => props.onImport(result.items)}
          >
            {`导入 ${result.items.length} 条`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Import exact rows and protect existing drafts**

In `web/src/components/tasks/task-table.tsx`, change the visible toolbar button to:

```tsx
<button className="ghost-button" data-testid="bulk-open" onClick={() => setBulkOpen(true)}>
  批量导入提示词
</button>
```

Replace the `onImport` callback with:

```tsx
onImport={(items) => {
  if (
    rows.some((row) => row.prompt.trim()) &&
    !window.confirm("导入将替换当前任务列表，是否继续？")
  ) {
    return;
  }

  props.onRowsChange(
    items.map((item) => createTaskDraft(props.defaults, item))
  );
  setBulkOpen(false);
}}
```

Do not create or append padding rows in this callback.

- [ ] **Step 6: Render and style the row note**

Replace the single number element at the top of `TaskRow` with:

```tsx
<div className="task-row-heading">
  <div className="task-row-number">第 {props.rowNumber} 张图</div>
  {props.row.note ? <span className="task-row-note">{props.row.note}</span> : null}
</div>
```

Add these styles after `.task-row` in `web/src/styles.css`:

```css
.task-row-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-wrap: wrap;
}
.task-row-note {
  min-width: 0;
  color: #627a95;
  font-size: 0.92rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.bulk-import-modal { max-width: 760px; }
.bulk-import-preview {
  display: grid;
  gap: 10px;
  max-height: 260px;
  overflow: auto;
  padding: 14px;
  border-radius: 14px;
  background: #f5f8fb;
}
.bulk-import-preview ol,
.bulk-import-preview ul { margin: 0; padding-left: 24px; }
.bulk-import-errors { color: #a33b35; }
```

- [ ] **Step 7: Run focused web tests and the type-checking build**

Run:

```powershell
npm run test -w web -- bulk-prompt-import.test.ts task-table.test.tsx editor-session.test.ts
npm run build -w web
```

Expected: all selected tests PASS and the web build completes successfully.

- [ ] **Step 8: Commit the editor workflow**

```powershell
git add -- web/src/components/tasks/bulk-paste-modal.tsx web/src/components/tasks/task-table.tsx web/src/components/tasks/task-row.tsx web/src/lib/task-draft.ts web/src/lib/types.ts web/src/styles.css web/src/tests/task-table.test.tsx web/src/tests/editor-session.test.ts
git commit -m "feat: add bulk prompt import workflow"
```

## Task 3: Persist Notes and Keep Them Out of Provider Requests

**Files:**

- Modify: `server/tests/repositories.test.ts`
- Modify: `server/tests/batch-routes.test.ts`
- Modify: `server/tests/provider-selection.test.ts`
- Modify: `server/src/db/schema.sql:13-32`
- Modify: `server/src/db/database.ts:5-20`
- Modify: `server/src/db/repositories/tasks-repository.ts:4-59`
- Modify: `server/src/routes/batch-routes.ts:11-23`
- Modify: `web/src/lib/api.ts:18-37`
- Modify: `web/src/lib/types.ts:43-57`

- [ ] **Step 1: Write failing repository and migration assertions**

In the existing repository test, add `note: "P1 · 系统故障"` to the task draft, widen the persisted type, and assert the stored note:

```ts
const [task] = tasks.createMany(batch.id, [
  {
    prompt: "cat in watercolor",
    note: "P1 · 系统故障",
    model: "gpt-image-1",
    aspectRatio: "1:1",
    resolution: "standard",
    size: "1024x1024",
    n: 1,
    referenceMode: "none",
    referenceImageId: null
  }
]);

const persistedTasks = tasks.listByBatchId(batch.id) as Array<{ prompt: string; note: string }>;

expect(persistedTasks[0]).toMatchObject({
  prompt: "cat in watercolor",
  note: "P1 · 系统故障"
});
```

Add this import and migration test to `server/tests/repositories.test.ts`:

```ts
import Database from "better-sqlite3";

it("adds the note column to an existing tasks table without losing rows", () => {
  const dir = mkdtempSync(join(tmpdir(), "image-generator-legacy-db-"));
  tempPaths.push(dir);
  const filename = join(dir, "legacy.sqlite");
  const legacy = new Database(filename);
  legacy.exec(`
    create table tasks (
      id text primary key,
      prompt text not null
    );
    insert into tasks (id, prompt) values ('legacy-task', 'legacy prompt');
  `);
  legacy.close();

  const db = createDatabase(filename);
  const columns = db.prepare("pragma table_info(tasks)").all() as Array<{ name: string }>;
  const row = db.prepare("select id, prompt, note from tasks where id = ?").get("legacy-task") as {
    id: string;
    prompt: string;
    note: string | null;
  };

  expect(columns.map((column) => column.name)).toContain("note");
  expect(row).toEqual({ id: "legacy-task", prompt: "legacy prompt", note: null });
  db.close();
});
```

- [ ] **Step 2: Write failing route and provider-isolation assertions**

In the first batch route payload, add:

```ts
note: "P1 · Morning tea",
```

Then assert:

```ts
expect(response.json().tasks[0]).toMatchObject({
  note: "P1 · Morning tea",
  prompt: "tea house in snow"
});
```

Keep the child-task request without a note and assert `note: ""` in its response. This covers old callers and child tasks.

Add this test to `server/tests/provider-selection.test.ts`:

```ts
it("sends the prompt but not the task note to the image provider", async () => {
  const { service, clients } = createHarness();

  try {
    const created = service.createBatch({
      name: "Note isolation",
      tasks: [{
        ...taskInput("rendered prompt"),
        note: "P1 · Internal page note"
      }]
    });

    expect((await runTask(service, created.tasks[0].id)).outcome).toBe("completed");
    const envClient = clients.find((entry) => entry.apiKey === "env-key")?.client;
    const createImageTask = vi.mocked(envClient!.createImageTask);
    const [request] = createImageTask.mock.calls[0];

    expect(request.prompt).toBe("rendered prompt");
    expect(request).not.toHaveProperty("note");
  } finally {
    await service.close();
  }
});
```

- [ ] **Step 3: Run the focused backend tests and verify that they fail**

Run:

```powershell
npm run test -w server -- repositories.test.ts batch-routes.test.ts provider-selection.test.ts
```

Expected: FAIL because the database, repository, and route do not support `note` yet.

- [ ] **Step 4: Add the column and additive migration**

In `server/src/db/schema.sql`, add this line after `prompt text not null`:

```sql
note text,
```

In `ensureTaskColumns` in `server/src/db/database.ts`, add:

```ts
if (!columnNames.has("note")) {
  db.exec("alter table tasks add column note text");
}
```

- [ ] **Step 5: Persist and normalize notes in the repository**

Add the optional input property:

```ts
note?: string;
```

Add this helper above `createTasksRepository`:

```ts
function normalizeTask<T extends Record<string, unknown>>(task: T) {
  return {
    ...task,
    note: typeof task.note === "string" ? task.note : ""
  };
}
```

Add `note` and `@note` to the insert column/value lists immediately after `prompt` and `@prompt`. Build created rows with a normalized note:

```ts
const created = drafts.map((draft) => ({
  id: randomUUID(),
  batchId,
  parentImageId: draft.parentImageId ?? null,
  ...draft,
  note: draft.note?.trim() ?? "",
  createdAt: now,
  updatedAt: now,
  status: "queued"
}));
```

Normalize all repository reads:

```ts
listByBatchId(batchId: string) {
  return db.prepare("select * from tasks where batch_id = ? order by created_at asc")
    .all(batchId)
    .map((task) => normalizeTask(task as Record<string, unknown>));
},
listByIds(taskIds: string[]) {
  if (taskIds.length === 0) {
    return [];
  }

  const placeholders = taskIds.map(() => "?").join(", ");
  return db.prepare(`select * from tasks where id in (${placeholders}) order by created_at asc`)
    .all(...taskIds)
    .map((task) => normalizeTask(task as Record<string, unknown>));
},
getById(taskId: string) {
  const task = db.prepare("select * from tasks where id = ?").get(taskId) as Record<string, unknown> | undefined;
  return task ? normalizeTask(task) : undefined;
},
```

Return `created.map(normalizeTask)` after the insert transaction so API responses always expose a string note.

- [ ] **Step 6: Carry notes through the route and web API**

Add this optional property to the batch task body in `server/src/routes/batch-routes.ts`:

```ts
note?: string;
```

Add `note: task.note` immediately after `prompt: task.prompt` in the mapped task payload in `web/src/lib/api.ts`.

Add this optional property after `prompt` in `TaskRecord` in `web/src/lib/types.ts`:

```ts
note?: string | null;
```

Do not change `ToApisClient` or `submitAndPollRemoteTask`; the existing provider request must continue to use only `task.prompt`.

- [ ] **Step 7: Run persistence and provider-isolation tests**

Run:

```powershell
npm run test -w server -- repositories.test.ts batch-routes.test.ts provider-selection.test.ts
npm run build -w server
```

Expected: all selected backend tests PASS and the server build completes successfully.

- [ ] **Step 8: Commit note persistence**

```powershell
git add -- server/src/db/schema.sql server/src/db/database.ts server/src/db/repositories/tasks-repository.ts server/src/routes/batch-routes.ts server/tests/repositories.test.ts server/tests/batch-routes.test.ts server/tests/provider-selection.test.ts web/src/lib/api.ts web/src/lib/types.ts
git commit -m "feat: persist task notes"
```

## Task 4: Restore Notes Across Local Sessions and History

**Files:**

- Modify: `web/src/lib/editor-session.ts:20-37`
- Modify: `web/src/lib/history-snapshot.ts:10-23`
- Modify: `web/src/tests/editor-session.test.ts`
- Modify: `web/src/tests/history-snapshot.test.ts`
- Modify: `web/src/tests/app-history-restore.test.tsx`

- [ ] **Step 1: Write failing restoration tests**

In the first editor-session test, use `note: "P1 · Saved page"` in the row and keep the existing equality assertion so persistence is covered.

Add this old-session test:

```ts
it("normalizes notes missing from older saved sessions", () => {
  window.localStorage.setItem("image-generator-editor-session", JSON.stringify({
    rows: [{
      id: "legacy-row",
      prompt: "legacy prompt",
      model: "gpt-image-2",
      aspectRatio: "16:9",
      resolution: "1K",
      n: 1,
      referenceMode: "none",
      referenceImageId: null,
      submittedTaskId: null
    }],
    editorResults: { tasks: [], images: [] },
    activeBatchId: null
  }));

  expect(loadEditorSession()?.rows[0].note).toBe("");
});
```

In `history-snapshot.test.ts`, add `note: "P1 · Restored page"` to the root task and add this property to the existing `toMatchObject` assertion:

```ts
note: "P1 · Restored page",
```

In `app-history-restore.test.tsx`, add the same note to the history root task and assert after restore:

```ts
expect(screen.getByText("P1 · Restored page")).toBeInTheDocument();
```

- [ ] **Step 2: Run the restoration tests and verify the old-session case fails**

Run:

```powershell
npm run test -w web -- editor-session.test.ts history-snapshot.test.ts app-history-restore.test.tsx
```

Expected: the old-session normalization and history-note assertions FAIL.

- [ ] **Step 3: Normalize old sessions on load**

Add this helper below `isEditorSession` in `web/src/lib/editor-session.ts`:

```ts
function normalizeEditorSession(session: EditorSession): EditorSession {
  return {
    ...session,
    rows: session.rows.map((row) => ({
      ...row,
      note: typeof row.note === "string" ? row.note : ""
    }))
  };
}
```

Replace the successful parse branch in `loadEditorSession` with:

```ts
if (!isEditorSession(parsed)) {
  return null;
}

const session = normalizeEditorSession(parsed);
return hasEditorSessionContent(session) ? session : null;
```

- [ ] **Step 4: Restore notes from backend task records**

Add this property to the `createTaskDraft` overrides in `taskToDraft` in `web/src/lib/history-snapshot.ts`:

```ts
note: task.note ?? "",
```

- [ ] **Step 5: Run restoration tests and the complete web suite**

Run:

```powershell
npm run test -w web -- editor-session.test.ts history-snapshot.test.ts app-history-restore.test.tsx
npm run test -w web
npm run build -w web
```

Expected: all restoration tests, the full web suite, and the web build PASS.

- [ ] **Step 6: Commit restoration support**

```powershell
git add -- web/src/lib/editor-session.ts web/src/lib/history-snapshot.ts web/src/tests/editor-session.test.ts web/src/tests/history-snapshot.test.ts web/src/tests/app-history-restore.test.tsx
git commit -m "feat: restore task notes"
```

## Task 5: Full Verification and Handoff

**Files:**

- Modify: `WORKLOG.md`

- [ ] **Step 1: Run repository-wide verification**

Run exactly the project-required commands:

```powershell
npm test
npm run build
git diff --check
```

Expected:

- All backend tests PASS.
- All frontend tests PASS.
- Server and web builds complete successfully.
- `git diff --check` emits no errors.

- [ ] **Step 2: Confirm the migration on an existing local database without exposing data**

Run a read-only column check after starting the application once with the existing local database:

```powershell
@'
const Database = require("better-sqlite3");
const db = new Database("app-data/app.sqlite", { readonly: true });
const names = db.prepare("pragma table_info(tasks)").all().map((column) => column.name);
console.log(names.includes("note") ? "tasks.note present" : "tasks.note missing");
db.close();
'@ | node
```

Expected: `tasks.note present`. Do not print task rows, prompts, provider settings, keys, or `.env` values.

- [ ] **Step 3: Update the worklog with the completed implementation**

Append this concise section to `WORKLOG.md` only after all commands pass:

```markdown
## 2026-08-18 Batch Prompt Import Implementation

### Current Goal

The paste-based batch prompt importer parses structured PPT prompt text into an exact number of task rows and persists page metadata as notes without sending notes to the image provider.

### Current Progress

- Added structured and line-mode parsing with preview and blocking validation.
- Replaced the visible bulk-paste entry with “批量导入提示词”.
- Exact-count imports replace the current list only after confirmation.
- Added read-only task notes beside row numbers.
- Persisted notes through the batch API and additive SQLite migration.
- Restored notes from local sessions and history; legacy values normalize to empty strings.

### Verification

- `npm test`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Existing local database column check: `tasks.note present`.

### Next Step

Paste a full real prompt document into the importer, confirm the detected page count and notes, then submit a small batch for an end-to-end provider check.

### Risks And Notes

- Structured input is intentionally rejected rather than downgraded to line mode when required fields are missing.
- Task notes remain internal metadata and are not part of provider requests.
- The database change is additive and does not rewrite existing task rows.
```

- [ ] **Step 4: Commit verification documentation**

```powershell
git add -- WORKLOG.md
git commit -m "docs: record bulk prompt import verification"
```

- [ ] **Step 5: Verify the final branch state**

Run:

```powershell
git status --short
git log -5 --oneline
```

Expected: clean working tree and the five feature commits visible in recent history.

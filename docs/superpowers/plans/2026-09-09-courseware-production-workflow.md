# Courseware Production Workflow Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task after the user approves the design and schema scope. Steps use checkbox (`- [ ]`) syntax for tracking. Review inline; do not dispatch agents unless separately authorized by the user or applicable instructions.

**Goal:** 将提示词原文与草稿保存、每页定稿、图片 PPT 导出、逐页去字及无文字 PPT 导出串成可恢复的本地课件流程。

**Architecture:** 新增本地课件记录，保存稳定页面、原文和选择状态；使用关联表把现有任务及图片挂到页面。普通生图和去字共用现有 provider 调度与重试，一个后端 PPTX 服务处理两种导出。原有批次保留作业职责，课件不等同于某一次生成批次。

**Tech Stack:** 现有 TypeScript、React、Fastify、SQLite/better-sqlite3、Vitest；阶段 C 在 `server` 工作区增加 `pptxgenjs` 和 `sharp`，使用浏览器 Clipboard/Blob 下载文本。

---

## 执行状态与先决条件

- 本方案已于 2026-09-09 获用户批准并实施。此处保留原始执行清单供追溯；最终实现、实际验证命令、数据库备份与验收限制见 `WORKLOG.md` 的 Courseware Workflow Delivered 记录。
- 设计依据：`docs/superpowers/specs/2026-09-09-courseware-production-workflow-design.md`。
- 用户输入：`docs/textless-background-prompt.md`。
- 基线为本地 `92eaa1d`；它尚未推送，执行时不能从远端旧 main 起步丢掉此修复。
- 当前仅有规划文档改动；保留这些文件，不使用 reset、clean、覆盖式 checkout 或删除命令。
- 必须先取得新增四张表的明确授权，再修改 `schema.sql` 或启动会创建这些表的程序。
- 先在临时测试数据库验证；对真实本地库应用结构变更前，另行确认目标路径、完成 SQLite 一致性备份并验证备份可读。
- 新依赖只安装到项目的 `server` workspace，不安装全局工具，不改系统 Node、密钥、`.env` 或 CI/CD。
- 采用四个可独立验收的阶段 A→B→C→D；每阶段通过后更新 `WORKLOG.md`，按用户授权的提交范围创建本地提交，不自动推送。

## 文件职责

### 新增文件

| 文件 | 单一职责 |
| --- | --- |
| `server/src/services/courseware-types.ts` | 课件、页面和去字清单的服务端数据契约 |
| `server/src/db/repositories/coursewares-repository.ts` | 课件创建、读取、revision 更新与旧批次幂等关联 |
| `server/src/db/repositories/courseware-task-links-repository.ts` | 任务到课件页面的归属 |
| `server/src/db/repositories/textless-runs-repository.ts` | 去字请求幂等键、输入清单及参数快照 |
| `server/src/db/repositories/image-job-results-repository.ts` | 每次图片产出的作业、尝试与校验记录 |
| `server/src/services/courseware-service.ts` | 导入保存、草稿更新、定稿校验、历史转课件 |
| `server/src/services/textless-service.ts` | 去字预检、快照、单页再处理和恢复协调 |
| `server/src/routes/courseware-routes.ts` | 新课件、去字及 PPT 下载端点 |
| `server/src/lib/pptx-image.ts` | 图片格式、方向、解码和比例校验；必要时无缩放转 PNG |
| `server/src/lib/pptx-service.ts` | 用已验证有序图片生成 PPTX Buffer |
| `server/src/lib/textless-prompt.ts` | 与用户提供文件一致的内置去字提示词 |
| `web/src/lib/courseware-api.ts` | 前端课件类型与新端点请求 |
| `web/src/lib/prompt-export.ts` | 纯文本／Markdown 序列化、复制和下载 |
| `web/src/hooks/use-courseware.ts` | 课件打开、串行自动保存及本地未保存草稿恢复 |
| `web/src/components/courseware/courseware-toolbar.tsx` | 课件与导出操作入口 |
| `web/src/components/courseware/prompt-library-modal.tsx` | 原文／当前提示词预览及复用 |
| `web/src/components/courseware/courseware-list-modal.tsx` | 打开本地保存的课件 |
| `web/src/components/courseware/page-selection-panel.tsx` | 页序、参与导出、单选定稿 |
| `web/src/components/courseware/textless-panel.tsx` | 去字状态、对照、重试与两种匹配导出 |

### 需要修改的现有文件

- `AGENTS.md`：在创建 `web/src/components/courseware/` 前先记录它的用途；运行数据仍留在既有 `app-data/`，不新增清理行为。
- `server/src/db/schema.sql`：经授权新增下述表。`database.ts` 仅在需要统一初始化或测试事务时精准调整，不重写旧数据迁移。
- `server/src/services/batch-service.ts`：注入新关联仓库与业务服务；在入队前保存任务归属；保存图片时记录产出校验；提供新服务 getter 给路由。保留适配器、provider 路由和现有重试语义。
- `server/src/routes/batch-routes.ts`：普通生成接受可选课件／页面上下文；旧调用没有这些字段时行为兼容。
- `server/src/app.ts`：注册新路由，通过 BatchService 的业务服务 getter 共享现有 SQLite 连接；不公开数据库对象给前端或路由消费者。
- `server/package.json`、`package-lock.json`：阶段 C 添加两个本地依赖。
- `web/src/lib/bulk-prompt-import.ts`：返回独立的页面编号／名称元数据，同时保留当前 prompt 组合规则和 note。
- `web/src/components/tasks/bulk-paste-modal.tsx`：将完整输入、识别模式和解析项交给异步导入流程；成功落盘后才完成切换。
- `web/src/components/tasks/task-table.tsx`、`task-row.tsx`：传递稳定 pageId，加入复制与定稿操作。
- `web/src/lib/types.ts`、`task-draft.ts`、`api.ts`：携带可选页面上下文；图片和任务增加可用的结果归属字段。
- `web/src/lib/editor-session.ts`、`history-snapshot.ts`、`editor-results-cache.ts`：兼容旧会话，保留当前子图显示修复，并支持跨生成批次的同页候选。
- `web/src/App.tsx`：连接课件 hook、异步导入、生成上下文、版本选择和去字面板；不把业务算法继续塞入组件。
- `web/src/styles.css`：仅添加新控件所需样式，沿用当前颜色、间距和 ModalDialog。
- `WORKLOG.md`：每阶段记录文件、测试、残余风险和下一步。

## 数据契约

以下是实现时的固定边界；服务端类型放入 `courseware-types.ts`，前端在 `courseware-api.ts` 镜像传输字段，不跨 workspace 引用源码。

```ts
export type PageDraft = {
  prompt: string;
  note: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  n: number;
  referenceMode: "none" | "global" | "row";
  referenceImageId: string | null;
};

export type CoursewarePage = {
  id: string;
  position: number;
  sourcePageNumber: string;
  sourcePageName: string;
  draft: PageDraft;
  included: boolean;
  selectedImageId: string | null;
};

export type CoursewareDocument = {
  id: string;
  name: string;
  sourceKind: "import" | "manual" | "history" | "legacy-session";
  rawImportText: string | null;
  importMode: "structured" | "lines" | null;
  legacyBatchId: string | null;
  globalReferenceImageId: string | null;
  revision: number;
  pages: CoursewarePage[];
};

export type TextlessPage = {
  pageId: string;
  position: number;
  pageLabel: string;
  sourceImageId: string;
  taskId: string;
  aspectRatio: string;
  resolution: string;
};

export type TextlessRun = {
  id: string;
  coursewareId: string;
  requestId: string;
  sourceRevision: number;
  promptText: string;
  model: string;
  manifest: TextlessPage[];
};
```

页面顺序来自 `position`；页面显示编号属于元数据，不参与排序。`PageDraft` 的模型与规格允许保存为草稿，即使当前 provider 已切换为不支持该模型；真正发单前仍须执行现有能力校验。

## 待批准的 SQL 范围

新增表，不改写现有批次、任务、图片内容，也不执行全量历史回填。下列 DDL 只在用户授权后写入 `schema.sql`：

```sql
create table if not exists coursewares (
  id text primary key,
  name text not null,
  source_kind text not null,
  raw_import_text text,
  import_mode text,
  legacy_batch_id text unique,
  global_reference_image_id text,
  pages_json text not null,
  revision integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table if not exists textless_runs (
  id text primary key,
  courseware_id text not null,
  request_id text not null,
  source_revision integer not null,
  prompt_text text not null,
  model text not null,
  manifest_json text not null,
  created_at text not null,
  unique (courseware_id, request_id),
  foreign key (courseware_id) references coursewares(id)
);

create table if not exists courseware_task_links (
  task_id text primary key,
  courseware_id text not null,
  page_id text not null,
  purpose text not null,
  textless_run_id text,
  source_image_id text,
  created_at text not null,
  foreign key (task_id) references tasks(id) on delete cascade,
  foreign key (courseware_id) references coursewares(id),
  foreign key (textless_run_id) references textless_runs(id)
);

create index if not exists courseware_task_links_page_idx
  on courseware_task_links(courseware_id, page_id);

create table if not exists image_job_results (
  image_id text primary key,
  job_id text not null,
  attempt_number integer not null,
  validation_status text not null,
  actual_width integer,
  actual_height integer,
  created_at text not null,
  foreign key (image_id) references generated_images(id) on delete cascade,
  foreign key (job_id) references generation_jobs(id) on delete cascade
);

create index if not exists image_job_results_job_idx
  on image_job_results(job_id, attempt_number);
```

- `pages_json` 由服务端验证后写入；ID 唯一、position 连续、最多为当前 `maxBatchSize` 页。
- 原始文本超过 2 MiB 或课件请求超过 8 MiB 时返回 413，不截断；只为新课件端点设置较大的 bodyLimit，不放大所有现有端点。
- `purpose` 限定为 `original`、`variation`、`textless`。
- `validation_status` 限定为 `valid`、`invalid`、`unverified`。旧图片没有新记录时按 unverified 对待，不凭空补成功记录。
- JSON 内指向已删除图片的 ID 不自动替换；读取或导出时报告具体缺图页面。
- 课件修改 SQL 必须带 `where id = ? and revision = ?`，成功后 revision 加一；零行更新返回 409。

## 端点清单

| 端点 | 请求／结果与约束 |
| --- | --- |
| `PUT /api/coursewares/:id` | 用客户端生成且本次操作复用的 ID 创建课件；原文、模式、页面。重复请求返回同一课件，已有 ID 的不同来源拒绝覆盖 |
| `GET /api/coursewares` | 返回名称、页数、保存时间、来源摘要，不把所有原文塞进列表 |
| `GET /api/coursewares/:id` | 返回课件和有效候选关联，rawImportText 可为空 |
| `PATCH /api/coursewares/:id` | `{ expectedRevision, name, globalReferenceImageId, pages }`；不接受更改 rawImportText；校验候选图片确实属于相应页面 |
| `POST /api/coursewares/from-history/:batchId` | 按旧任务与后代关系建立页面；legacyBatchId 保证重复打开不重复建课件；无原文如实返回 null |
| `POST /api/coursewares/:id/export-pptx` | `{ expectedRevision, pageIds }`；从服务端的定稿选择生成快照并下载 PPTX |
| `POST /api/coursewares/:id/textless-runs` | `{ requestId, expectedRevision, pageIds, model, regenerate }`；regenerate 必须由显式重新处理动作发出；服务端从默认提示词建立快照 |
| `GET /api/coursewares/:id/textless-runs` | 返回本课件处理记录摘要，支持打开以前匹配的处理清单 |
| `GET /api/textless-runs/:runId` | 按冻结页序返回任务状态、源图及对应结果；只返回脱敏 provider 信息 |
| `POST /api/textless-runs/:runId/export-pptx` | `{ variant: "final" | "textless" }`；两种导出均严格使用该 run 的同一份来源清单 |

所有可写请求使用已有 Zod 依赖验证字段。错误返回可定位页面与稳定 code：空清单 400；跨课件候选、保存冲突和缺图 409；大小超限 413；无法解码或比例不同 422。没有发单需求的文本复制／下载只操作前端已加载文本。

## Task 0：确认与规则记录

**Files:** `AGENTS.md`、`WORKLOG.md`。

- [ ] 用户确认设计与四张新增表的范围；记录允许的迁移目标，不把规划请求当作迁移授权。
- [ ] 执行 `git status --short --branch`、`git diff --stat`，确认本地修复和规划文件仍在。
- [ ] 为代码实施建立 `codex/courseware-production` 隔离工作区，基于包含 `92eaa1d` 的当前状态；妥善带入已确认文档，不覆盖任何已有分支或文件。
- [ ] 先在 AGENTS.md 记录 `web/src/components/courseware/` 的职责、英文命名及无自动清理约定，再创建目录。
- [ ] 第一轮只使用测试数据库和 mock provider；不读取真实 key，不运行收费生成。

## Task 1（A）：课件保存与原文保真

**Files:** 新增 `courseware-types.ts`、`coursewares-repository.ts`、`courseware-service.ts`、`courseware-routes.ts`；修改 `schema.sql`、`app.ts`、`batch-service.ts`；新增 `server/tests/courseware-persistence.test.ts`、`courseware-routes.test.ts`。

- [ ] 先写持久化测试：原文含总标题、CRLF、空行和中文，创建后关闭再打开库，rawImportText 必须逐字符相同；修改页面 prompt 后 rawImportText 仍相同。
- [ ] 加入重复 PUT、不同来源覆盖同 ID、revision 冲突、超长原文和旧记录 rawImportText=null 的路由测试。
- [ ] 运行 `npm run test -w server -- courseware-persistence.test.ts courseware-routes.test.ts`，先确认新行为未实现导致失败。
- [ ] 实现四张表和 repository，使用现有连接；原文只在首次创建时写入。草稿 PATCH 仅更新 name/global_reference_image_id/pages_json/revision/updated_at，不用客户端对象覆盖整行记录。
- [ ] 服务端创建空／手动课件时允许 rawImportText=null；有空 prompt 的页面仍可保存，生成时才验证是否有效。
- [ ] 新端点只负责本地记录；不得触发 `scheduler.enqueue` 或 provider 请求。
- [ ] 重跑定向测试，再运行 `npm test`、`npm run build`；阶段记录写明尚无图片生成功能变更。

## Task 2（A）：导入、打开与自动保存

**Files:** 新增 `courseware-api.ts`、`use-courseware.ts`、`courseware-list-modal.tsx`；修改 `bulk-prompt-import.ts`、`bulk-paste-modal.tsx`、`task-table.tsx`、`editor-session.ts`、`history-snapshot.ts`、`App.tsx`；新增 `web/src/tests/courseware-import.test.tsx`、`use-courseware.test.tsx`。

- [ ] 扩展成功导入值为 `{ rawText, mode, items }`；rawText 直接取 textarea value，解析仍只对内部副本做换行归一化。
- [ ] 结构化解析项增加独立 pageNumber/pageName，不从组合 note 字符串反推；保持现有三段 prompt 拼接和顺序规则。
- [ ] 首先测试：导入但尚未生成，重新载入也能找回；取消、解析错误和保存失败都不替换旧课件；连续导入两份可分别打开。
- [ ] 每次确认新导入生成一次 coursewareId 和 pageId，网络重试复用这些 ID；保存成功后才更新页面列表并关闭弹窗。
- [ ] 自动保存采用 500ms debounce 加单请求串行队列；上一保存未完成时只保留最新待保存草稿，不并发发送旧版本覆盖请求。
- [ ] 本地会话扩展保存 coursewareId、baseRevision 和未保存草稿；启动先读取服务器记录，相同 revision 可恢复待保存编辑，冲突则保留草稿并提示，不自动覆盖服务器。
- [ ] 随课件恢复 globalReferenceImageId；生成请求使用本课件的引用。新建／复制页面只复制 draft 参数并赋予新 pageId，不能带走原页的 selectedImageId 或 submittedTaskId。
- [ ] 保存错误与本地存储容量错误必须可见；旧会话缺新字段时继续按现有逻辑读取，建立一次新课件记录后保存稳定 ID。
- [ ] 验证 `npm run test -w web -- courseware-import.test.tsx use-courseware.test.tsx editor-session.test.ts app-history-restore.test.tsx bulk-prompt-import.test.ts task-table.test.tsx`。

## Task 3（A）：提示词复制与文本下载

**Files:** 新增 `prompt-export.ts`、`prompt-library-modal.tsx`、`courseware-toolbar.tsx`；修改 `task-row.tsx`、`App.tsx`、`styles.css`；新增 `web/src/tests/prompt-export.test.ts`、`prompt-library-modal.test.tsx`。

- [ ] 先写序列化测试：原文不变，当前文本顺序按 position，页面正文含换行、中文、反引号也完整保留，编辑后导出的确是最新正文。
- [ ] 定义并实现三个纯函数：`originalPromptText(raw: string): string` 返回 raw；`currentPromptsText(pages: CoursewarePage[]): string` 输出按页标题和原样正文；`currentPromptsMarkdown(pages: CoursewarePage[]): string` 输出按页 Markdown 与足够长的代码围栏。
- [ ] 单页复制传入 draft.prompt，不加入 note、模型或去字模板。全部复制包含所有当前页面；空 prompt 页面保留标题，避免改变页序对应关系。
- [ ] 原文文件直接使用 rawImportText；当前文件使用上述序列化函数。通过 `Blob`、`URL.createObjectURL` 和带 download 的链接下载 UTF-8 文本，释放 object URL。
- [ ] 点击复制时 await `navigator.clipboard.writeText(text)`；成功再显示“已复制”。异常时显示可选中文本，不调用读取剪贴板，也不记录用户全文。
- [ ] 弹窗的原文和当前内容采用只读预览；编辑继续在任务行中进行，不创建第二个独立编辑副本。
- [ ] 测试剪贴板成功／拒绝、原文缺失、复制全部不受 PPT 勾选影响，下载 MIME 与文件内容正确。
- [ ] 运行 `npm run test -w web -- prompt-export.test.ts prompt-library-modal.test.tsx`，然后 `npm test`、`npm run build`。阶段 A 完成后即可验收和单独交付。

核心可执行断言应类似：

```ts
import { expect, it } from "vitest";
import type { CoursewarePage } from "../lib/courseware-api";
import { currentPromptsText, originalPromptText } from "../lib/prompt-export";

it("preserves raw input and serializes current prompts in page order", () => {
  const raw = "标题\r\n\r\n  多行内容  ";
  const page1: CoursewarePage = {
    id: "page-1",
    position: 0,
    sourcePageNumber: "封面",
    sourcePageName: "开始",
    draft: {
      prompt: "ALPHA正文\n第二行",
      note: "封面 · 开始",
      model: "gpt-image-1",
      aspectRatio: "16:9",
      resolution: "standard",
      n: 1,
      referenceMode: "none",
      referenceImageId: null
    },
    included: true,
    selectedImageId: null
  };
  const page2: CoursewarePage = {
    ...page1,
    id: "page-2",
    position: 1,
    sourcePageNumber: "P1",
    sourcePageName: "练习",
    draft: { ...page1.draft, prompt: "BETA正文", note: "P1 · 练习" }
  };
  expect(originalPromptText(raw)).toBe(raw);
  const output = currentPromptsText([page2, page1]);
  expect(output).toContain(page1.draft.prompt);
  expect(output).toContain(page2.draft.prompt);
  expect(output.indexOf("ALPHA正文")).toBeLessThan(output.indexOf("BETA正文"));
});
```

## Task 4（B）：任务归属与可靠结果记录

**Files:** 新增两个关联仓库；修改 `batch-service.ts`、`batch-routes.ts`、`api.ts`、`types.ts`、`editor-results-cache.ts`；新增 `server/tests/courseware-generation-links.test.ts`、`image-job-results.test.ts`。

- [ ] 先测试同一页在两个批次重生成后仍为一页；子图及孙图通过父图片 task_id 的关联继承同一 pageId，不能被绑定到其他页面。
- [ ] 普通生成新增可选 coursewareId 和每条任务的 pageId；两者必须同时有效，旧 API 未传时完全兼容。
- [ ] 将批次、任务、作业及归属写入同一 SQLite 事务，提交后才 enqueue；结果极快返回时也必须已能找到正确页面。
- [ ] 不按 batchId 判定页面归属；新增候选来自 task links 查询，与当前上方正在轮询哪个批次无关。
- [ ] 每次 `generatedImagesRepository.create` 后，保存 imageId/jobId/attemptNumber/尺寸校验结论。尺寸不符记录 invalid；无法确认尺寸记录 unverified，不伪造 valid。
- [ ] 测试某次尺寸失败留下图片、随后重试成功时，旧图片仍保留但不会被自动选为定稿；多个 output_index 都是该页候选，不能增加页数。
- [ ] 历史打开仅关联能从 root task 与 parent_image_id 证明的后代关系；无法证明的跨批次归属不猜测、不批量回填。
- [ ] 运行 `npm run test -w server -- courseware-generation-links.test.ts image-job-results.test.ts generation-job-routing.test.ts generation-job-retry.test.ts provider-selection.test.ts`。

## Task 5（B）：每页定稿选择与恢复

**Files:** 新增 `page-selection-panel.tsx`；修改 `task-row.tsx`、`task-table.tsx`、`use-courseware.ts`、`App.tsx`、`styles.css`；新增 `web/src/tests/page-selection.test.tsx`、`courseware-restore.test.tsx`。

- [ ] 先测试一页有原图 A、子图 B、孙图 C 时只能单选一个，选 C 后页面数仍为 1，刷新后仍选 C。
- [ ] “参与导出”使用页面级复选框，“设为本页定稿”使用同页共享 radio group；不得复用一个多选图片集合实现两种语义。
- [ ] 页序用上移／下移调整 position，保存时重新编号为连续整数，不修改导入原文或 sourcePageNumber。
- [ ] 只有页面尚无定稿时才能默认采用首张 valid 原图；新子图和新批次结果不抢占当前定稿。
- [ ] 服务端验证被选图片通过 task links 属于该页面，且不是 textless 用途；客户端传入其他页或去字图应被拒绝。
- [ ] 候选图提供“复制该图提示词”，从该图片 task_id 对应的 tasks.prompt 读取，而不是从当前页面草稿读取；variation 候选明确提示需要配合参考图使用。
- [ ] 测试缺图占位、图片删除后选中项不可用、关闭再开、一次只生成部分页面，以及 `92eaa1d` 的子图显示回归。
- [ ] 运行 `npm run test -w web -- page-selection.test.tsx courseware-restore.test.tsx app-history-restore.test.tsx task-row-preview.test.tsx`，然后全量测试与构建。

## Task 6（C）：共用 PPTX 导出器

**Files:** 新增 `pptx-image.ts`、`pptx-service.ts`；修改新路由、`server/package.json`、`package-lock.json`；新增 `server/tests/pptx-service.test.ts`、`courseware-pptx-routes.test.ts`；前端工具栏接入下载。

- [ ] 安装项目依赖：`npm install -w server pptxgenjs sharp`，检查只改变 server 依赖与 lockfile；记录锁定版本，不改全局环境。
- [ ] 用测试自建 PNG/JPEG/WebP 小图验证 `normalizePptxImage(buffer)`：返回可嵌入 Buffer、MIME、实际宽高；执行完整解码验证，不能只靠 metadata 头判为文件完整。
- [ ] 方向正常的 PNG/JPEG保留原始 Buffer。WebP或需要 EXIF 方向归一化的图在内存转 PNG，不 resize、不裁切、不写回原图。
- [ ] `buildPptx(pages)` 接收已验证图片数组；先验证非空、共同宽高比、最多 100 页、源文件总字节不超过 200 MiB，然后逐页 addSlide/addImage。
- [ ] 比例比较用整数交叉乘积：`widthA * heightB === widthB * heightA`；存在差异时返回页面和尺寸，不静默使用 contain/cover。
- [ ] 从首图比例定义统一页面，宽度例如 13.333333 英寸、高度按比例计算；每图 x=0、y=0、w=页面宽、h=页面高。使用 `write({ outputType: "nodebuffer" })` 返回内嵌图片 PPTX。
- [ ] 请求开始时按服务端页面清单快照解析图片；将 ID 查询结果重新映射到请求的页序，不能直接使用 SQL IN 查询的返回顺序。
- [ ] 导出器串行处理，一次只允许一个 PPTX 打包；超出资源限制返回明确错误，不与生成队列共享“正在生成”的状态计数。
- [ ] 解压生成的 PPTX，验证 slide 数量、每页只有一张图片、图片关系对应正确、坐标覆盖页幅、不存在外部链接图片；用 Office/WPS 检查实际打开和显示。
- [ ] 测试相同比例不同分辨率、乱序完成、选中孙图、混合比例、空清单、文件损坏、文件被删除、重复点击导出。
- [ ] 运行 `npm run test -w server -- pptx-service.test.ts courseware-pptx-routes.test.ts`，然后全量测试与构建。

参考依据：PptxGenJS 的 [Node 输出](https://gitbrent.github.io/PptxGenJS/docs/usage-saving/)；sharp 的 [元数据不等于完整解码](https://sharp.pixelplumbing.com/api-input/) 与 [PNG 输出](https://sharp.pixelplumbing.com/api-output/#png)。

## Task 7（D）：去字快照与独立作业

**Files:** 新增 `textless-runs-repository.ts`、`textless-service.ts`、`textless-prompt.ts`；修改新路由和 `batch-service.ts`；新增 `server/tests/textless-runs.test.ts`、`textless-prompt.test.ts`。

- [ ] 先测试两页分别选原图 A 与子图 B，生成请求的参考图必须分别为 A、B，绝不都使用最早祖先图，也不组合两张参考图。
- [ ] 将用户完整提示词内置为常量；测试它与 `docs/textless-background-prompt.md` 内容一致，仅允许文档结尾换行差异，不增加原始文生图提示词。
- [ ] 预检所有源图存在、来源校验、模型与各页比例／分辨率；预检失败不创建部分发单。
- [ ] 创建 textless run、独立 batch、每页一个 n=1 的任务和 job、对应 task links；在同一事务内填完 manifest 的 taskId 后才入队。
- [ ] manifest 同时保存当时的 pageLabel；以后修改名称、移除页面或调整页序时，旧 run 仍能独立显示其来源清单。
- [ ] requestId 在同一次用户操作的重发中复用；同一课件相同 requestId 只创建一次。若不同请求已有同源图、同模板、同参数的在途处理，返回现有处理信息而非重复发单。
- [ ] 正常“生成无文字版”复用已有匹配的完成结果；显式“重新去字”才为所选页创建新的 run 和独立批次，不复用已完成 job 强行重跑，也不消耗原图批次的任务上限。
- [ ] 新去字任务通过现有 image role 分派，共享 provider 并发；切换 provider 后已提交任务保持其绑定，未提交任务按现行规则解析，不新增 fallback。
- [ ] run 结果从明确 task/job/image ledger 得出。正在看另一页、换定稿、旧 run 晚到都不会改写另一个源图的对应关系。
- [ ] 失败重试继续使用 `retryTasks` 的逐作业行为。重新处理成功但不满意的页时，输入仍为该 run 选择的定稿图，不使用上一张去字结果。
- [ ] 运行 `npm run test -w server -- textless-runs.test.ts textless-prompt.test.ts generation-job-routing.test.ts generation-job-retry.test.ts provider-job-scheduler.test.ts`。

## Task 8（D）：恢复、对照与无文字 PPT

**Files:** 新增 `textless-panel.tsx`；修改 `textless-service.ts`、新路由和课件工具栏；新增 `server/tests/textless-recovery.test.ts`、`textless-pptx.test.ts`、`web/src/tests/textless-panel.test.tsx`。

- [ ] 先写重启状态矩阵：queued 且从未提交可入队；有 remoteTaskId/remoteResultUrl 的任务只恢复远端结果；可能已提交但无远端引用的任务标为 unknown 并等待显式重试确认。
- [ ] 恢复远端结果前必须确认记录的 providerId/configRevision 仍可用且一致。失配或 provider 缺失时返回可定位的恢复错误，不能借现有 resolver 退回当前通道后调用 generate；对应测试断言新发单次数为零。
- [ ] 若保存结果 ledger 已存在当前 attempt 的 valid 图片，而进程在更新完成状态前退出，先用本地结果修复状态，不重复远端调用。
- [ ] 恢复只针对新 textless run 所绑定的作业，先检查同一进程是否已入队或运行，避免重复 enqueue；不借本功能重做所有旧任务的启动策略。
- [ ] 面板按 run manifest 显示源图、去字图、页序和状态；显示切换后的当前定稿与 run 源图不一致时，明确标记它属于旧定稿。
- [ ] 每页提供原图／去字图对照；失败项调用现有确认逻辑，效果重做调用显式新 run，不自动循环收费。
- [ ] 从 run 分别导出 final/textless 两套 PPT；都使用同一 manifest 页序与原图画布比例，缺少有效结果或去字尺寸比例不符时列出具体页面并拦截。
- [ ] 测试三页中一页失败：成功两页不重发，无文字 PPT 不偷偷少页或补带字图；第三页成功后输出正好三页且顺序一致。
- [ ] 测试将定稿 B 换成 C，再切回 B；B 的背景可恢复，C 不错误显示 B 的背景；任务中途修改页面 prompt 也不改 run 的快照。
- [ ] 运行 `npm run test -w server -- textless-recovery.test.ts textless-pptx.test.ts` 与 `npm run test -w web -- textless-panel.test.tsx courseware-restore.test.tsx`。

## Task 9：整体验收与交接

- [ ] `npm test`：所有 server/web 测试通过，不注释旧用例、不跳过失败项。
- [ ] `npm run build`：两个 workspace 构建通过，检查新模块与默认去字常量能进入构建产物。
- [ ] 导入一份含封面、普通页、多段提示词的测试文本；尚未生图时重启应用并打开课件，复制原文逐字符核对。
- [ ] 修改某页 prompt 并重新生成候选，选择子图；核对导入原文、当前提示词、图片实际生成提示词三者的来源分别正确。
- [ ] 用 mock provider 乱序完成多个页面并模拟一个失败，核对定稿页数、去字来源、失败重试次数和两套 PPT。
- [ ] 浏览器检查桌面及 390px 窄屏：弹窗焦点、Escape 关闭、单选键盘操作、复制失败提示、无横向溢出。
- [ ] 真实数据迁移仅在获准并完成一致性备份后执行；核对已有批次／任务／图片数量与文件路径保持，新增表可读。
- [ ] 另获真实调用授权后，使用文字密集、表格、插画各一页进行去字效果验收；逐页记录残字、图形变化和规格。收费状态不明时停止重复请求。
- [ ] 检查 `git diff --check`、暂存文件清单、完整 diff；不加入密钥、数据库、生成图片、依赖目录或构建产物。
- [ ] 更新 `WORKLOG.md`：完成阶段、修改文件原因、实际测试结果、未完成项、已获授权和下一步。按用户授权提交，不自动推送、部署或清理旧文件。

## 需求覆盖自检

| 需求 | 对应任务 |
| --- | --- |
| 导入原文不丢失，尚未生图也能保存 | 1、2 |
| 复制本页／全部，导出原文／当前 TXT 和 Markdown | 3 |
| 原图、子图、孙图每页互斥 | 4、5 |
| 稳定页序，一张定稿图一页铺满 PPT | 5、6 |
| 完整用户提示词逐张去字 | 7 |
| 原图／去字图精确对应，改选不串版本 | 7、8 |
| 部分失败只重试相应页，重启不重复发单 | 7、8 |
| 无文字 PPT 与定稿 PPT 匹配 | 8、9 |
| 旧记录兼容，不伪造导入原文 | 1、2、4 |
| 数据库、收费请求、发布边界 | 0、9 |

# Monitor Drawer And Compact History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task after the user requests implementation. Steps use checkbox (`- [ ]`) syntax for tracking. Review inline; do not dispatch agents unless authorized by the user or applicable instructions.

**Goal:** 将运行监控改为点击展开的右侧抽屉，将历史记录改为连续排列的批次条目，每批图片用同尺寸缩略图在一行横向浏览。

**Architecture:** 复用现有 `ModalDialog`、运行队列数据和历史接口，只调整前端呈现。`App` 继续持有当前批次及轮询；监控抽屉只控制可见性。历史以批次 ID 为条目身份，以图片 ID 为预览身份，长提示词和单图作业信息收进按需展开的详情。

**Tech Stack:** 现有 React、TypeScript、CSS、原生 `dialog` / `details`、Vitest、Testing Library；浏览器验收复用现有临时数据库与模拟 provider 环境。不新增生产依赖。

---

## 1. 文档状态与执行边界

- 日期：2026-09-09。
- 鹿鸣已确认交互方向并要求开始执行。Task 0–6 已完成：225 项测试、前后端构建、规格/质量审查和两套模拟浏览器验收通过，17 个相关文件已同步主目录；最终交接见 `WORKLOG.md`。
- 已确认：监控默认收起，点击后从右向左滑入；历史记录按批次连续向下排列；同批缩略图保持单行，超出宽度后左右滚动。
- 文档中的尺寸、窄屏适配、键盘操作和实施拆分是对已确认方向的具体化。实施时以这里的验收条件为准。
- 所有源码路径均相对项目根目录 `D:/codex_project/图片生成`，命令也从该根目录运行，另有说明的除外。
- 已有目录承担本次新增文件：`components/monitor/` 放监控组件，`components/history/` 放历史展示组件，`web/src/tests/` 放组件测试，`server/tests/` 放沿用现有方式的浏览器验收脚本。不新建组件目录，不自动清理任何文件或用户数据。

### 当前工作区需要保留的成果

当前主目录已经包含上一阶段的课件保存、提示词保留、原图/子图单选定稿、PPT 导出、无文字版本及四张数据表的实现。这些代码仍有未提交改动，不能把 Git `HEAD` 当成完整的功能基线。

最近一次已记录的验证结果是：`npm test` 共 208 项通过，其中 server 124 项、web 84 项；`npm run build` 通过。这是上一阶段的验证记录，不代表本计划已经实施或验收。

执行本计划时：

- 保留当前全部已完成改动，先读 `AGENTS.md`、`WORKLOG.md`、`git status` 和 `git diff`。
- 不从旧的远端 main 直接开展本次修改。若使用隔离工作区，起点必须包含当前工作区的已完成内容。
- 不使用 `reset`、`clean`、覆盖式检出或删除目录来制造“干净基线”。
- 不自动提交之前的课件功能，也不推送 GitHub 或发布。
- 本计划不需要数据库结构变更、数据迁移、密钥修改或真实生图调用。

## 2. 完成后的页面

### 2.1 监控收起时

```text
┌────────────────────────────────────────────────────────────────────┐
│ 课件生图工作台                                      中转站设置       │
├───────────────────────────────────────────────────────────┬────────┤
│ 默认参数、课件操作、提交栏、任务编辑器                       │ 运行   │
│                                                           │ 监控   │
│ 主工作区使用原先左右两栏释放出来的空间                       │ 运行 8 │
│                                                           │ 失败 1 │
├───────────────────────────────────────────────────────────┴────────┤
│ 历史记录                                         下载目录          │
│                                                                    │
│ 批次 A / 时间 / 统计  [图01][图02][图03][图04] →  [载入][详情][更多] │
│ 批次 B / 时间 / 统计  [图01][图02]                [载入][详情][更多] │
│ 批次 C / 时间 / 统计  [图01]                      [载入][详情][更多] │
└────────────────────────────────────────────────────────────────────┘
```

图示里的“载入”对应现有按钮文案“载入到上方任务行”；实际按钮可分成两行排布，批次图片仍保持一条横排。

### 2.2 监控展开时

```text
┌────────────────────────────────────────┬───────────────────────────┐
│                                        │ 运行监控             关闭 │
│ 编辑区保留原位置和原宽度               ├───────────────────────────┤
│                                        │ 当前批次队列              │
│ 后方显示淡遮罩                         │ 等待 / 运行 / 成功        │
│                                        │ 失败 / 状态未知           │
│                                        │ 暂停补位 / 继续调度       │
│                                        ├───────────────────────────┤
│                                        │ 当前批次                  │
│                                        │ 任务摘要 + 状态            │
│                                        │ 任务摘要 + 状态            │
│                                        │ 内容在抽屉内上下滚动       │
└────────────────────────────────────────┴───────────────────────────┘
```

### 2.3 历史详情展开时

```text
批次 A / 时间 / 统计   [图01][图02][图03] →   [载入][收起详情][更多]
└ 任务详情
  第 1 条任务：完整提示词、模型、状态、错误原因
  单图作业：中转站、协议、预期尺寸、实际尺寸、作业状态
  第 2 条任务：完整提示词、模型、状态、错误原因

批次 B / 时间 / 统计   [图01][图02]           [载入][详情][更多]
```

详情只增加当前条目的高度，下一条批次顺次下移。关闭详情后恢复紧凑高度。

## 3. 运行监控的交互规则

| 项目 | 明确行为 |
| --- | --- |
| 初始状态 | 每次打开或刷新页面默认收起；不将开关状态写入数据库或 localStorage |
| 桌面入口 | 页面右侧窄按钮，显示“运行监控”；有当前批次时显示运行数、失败数，状态未知大于 0 时单独显示 |
| 计数来源 | 复用 `activeBatch.activeBatch.scheduler`，沿用当前队列的统计口径，不拼接全部历史批次 |
| 无当前批次 | 显示入口；展开后显示现有“提交任务后可在这里暂停或继续队列”等空状态 |
| 展开 | 点击入口，抽屉从屏幕右边向左滑入，覆盖主页面右侧，主编辑区不缩放、不重新排版 |
| 宽度 | 桌面 420px；不超过视口宽度；720px 及以下占满屏幕宽度 |
| 高度 | 占满视口，优先 `100dvh`，保留 `100vh` 回退；标题和关闭按钮固定在抽屉顶部 |
| 关闭 | 关闭按钮、遮罩空白区域、Escape 均可关闭；关闭后焦点回到入口 |
| 动效 | 展开滑入 180ms；关闭直接收起。系统设置减少动态效果时关闭滑入动画 |
| 后台行为 | 打开、关闭、连续切换都不创建任务、不暂停任务、不重试任务、不清空结果 |
| 错误提醒 | 更新入口失败/未知计数；不因失败自动打开抽屉，不打断提示词输入 |
| 滚动 | 任务列表在抽屉内部滚动，到底后不继续带动后方页面滚动 |

### 入口与主内容的空间

- 桌面为入口保留约 88px 的窄停靠间距，避免悬浮按钮挡住任务操作。原来的大块监控列消失。
- 入口宽 72px，内部文字分行显示，点击区域不小于 44px 高。
- 720px 及以下，入口放到任务编辑区上方的正常文档流中并靠右，取消停靠间距，避免小屏被悬浮按钮遮挡。
- 入口和抽屉状态分离；移动端同样点击展开，保持同一组按钮、计数和队列能力。

### 抽屉内容与任务状态

1. 复用 `RunSummary`：等待、运行、成功、失败、状态未知，以及“暂停补位 / 继续调度”。
2. 复用当前批次名称、失败项重试入口、任务状态列表。
3. 任务提示词默认显示两行摘要，点击该任务的“查看完整提示词”展开全文。完整文本保留空格和换行，长词允许换行。
4. 抽屉内统计区固定两列，不能被当前 1500px 断点中的五列样式覆盖。
5. `useActiveBatch(activeBatchId)` 保持在 `App` 内。不得将它移进只有抽屉打开才挂载的组件。
6. 当前批次 ID、暂停状态、provider 选择、重试确认逻辑均沿用现有行为。

## 4. 历史记录的交互规则

### 4.1 一个批次对应一条记录

- 历史批次继续按创建时间从新到旧显示。后端现有查询已使用 `created_at desc`，前端保持接口返回顺序。
- 条目以分隔线连续向下排列，条目上下保留 16px 留白；不把每张图片再拆成一个纵向大卡片。
- 每条分为批次摘要、缩略图横排、操作区；只有点击详情后才出现长内容。
- 首次进入仍加载历史；生成过程仍由上方任务行展示结果，需要同步历史时使用现有“刷新历史记录”。本次不新增历史轮询、无限滚动或分页。
- 刷新时已有条目保持挂载，并使用稳定的 `batch.id` 作为 key，避免每次刷新都重置详情开关及横向滚动位置。

### 4.2 条目摘要与操作

| 区域 | 默认显示 | 点击后显示 / 执行 |
| --- | --- | --- |
| 批次摘要 | 批次名称最多两行、创建时间、任务数、已保存图片数、成功/失败任务数 | 长名称可通过完整可访问名称和 `title` 查看 |
| 缩略图区 | 全部已保存图片的同尺寸缩略图；无图时显示占位说明 | 点击图片打开大图预览 |
| 主要操作 | 载入到上方任务行、详情、更多 | 载入沿用现有确认和课件关联行为 |
| 更多操作 | 默认折叠 | 导出图片、重试失败项（仅存在失败任务时）、删除批次 |
| 详情 | 默认关闭 | 完整提示词、模型、任务错误及各单图作业信息 |

“已保存图片数”不能写成“成功页数”。一个任务可能生成多张图片，保存过的图片也不等同于当前 PPT 的定稿。

“更多”使用原生 `details/summary`，内部放普通按钮，采用靠右弹出的小面板。不要增加菜单依赖，也不要给不支持方向键菜单行为的容器强加 `role="menu"`。Escape 关闭面板并回到“更多”，Tab 按正常顺序访问其中按钮。

### 4.3 缩略图尺寸与排列

| 项目 | 规格 |
| --- | --- |
| 图片框 | 固定 160 × 90 CSS 像素，所有批次一致 |
| 填充 | `object-fit: contain`，完整显示图片；比例不同时使用中性底色留白 |
| 横排 | `display: flex`、`flex-wrap: nowrap`、间距 10px；子项 `flex: 0 0 160px` |
| 超宽 | 仅缩略图区域横向滚动；整个网页不能因此出现横向滚动条 |
| 单张图片 | 仍是 160 × 90，不铺满条目，不自动放大 |
| 多张图片 | 不挤小、不自动换行；23 张、100 张都沿同一横排继续 |
| 图片标识 | 下方使用“图 01”“图 02”等本批浏览序号；按钮可访问名称包含文件名 |
| 加载 | 沿用 `loading="lazy"`，预先保留固定图片框，避免加载完成后条目跳动 |
| 失效图片 | 固定图片框保留，显示加载失败和文件名，不让后续缩略图移位 |

桌面横向滚动支持可见滚动条、触控板和 Shift + 滚轮；触屏支持左右滑动。缩略图区可用 Tab 聚焦，键盘能访问末尾图片；不把普通鼠标纵向滚轮强行改成横向滚动。

### 4.4 图片顺序与原图、子图、无文字版本

- 缩略图沿用当前 `item.images` 顺序。后端现有查询按图片创建时间正序返回；这里的序号是浏览序号，不是 PPT 页码。
- 保留接口返回的所有已保存图片，不能因界面变紧凑而只取第一张、去掉子图或截断到前几张。
- 同批原图和子图都可浏览，它们仍属于同一页的候选版本；历史大图预览不改变“每页只能选一个定稿”的规则。
- 无文字版本按现有批次归属显示，不把它重新合并到另一批次，也不改变它与定稿原图的对应关系。
- 本次不在缩略图上推断“已定稿”“去字成功”等标签。现有 `ImageRecord` 不包含精确的作业尝试或课件选中状态，不能仅凭 `task_id` 或文件名生成这些结论。
- PPT 页序、定稿选择、导出包含页、无文字结果复用，继续由课件功能负责；历史浏览不写这些状态。

### 4.5 大图预览

- 点击缩略图，在居中模态框中查看完整图片。
- 显示批次内序号、总图片数、完整文件名；本地路径放在可展开的“文件信息”中。
- 提供“上一张 / 下一张 / 下载 / 删除 / 关闭”。只在当前批次内切换，首尾按钮禁用，不循环到别的批次。
- 支持左右方向键切换，Escape 关闭。预览使用 `contain`，不裁切、不拉伸。
- 用 `selectedImageId` 保存正在查看的图片，不保存易受刷新影响的数组下标。
- 删除前沿用现有文件名确认。取消不会请求删除；失败时停留在当前图片并显示错误；成功后关闭预览，焦点回到当前批次的缩略图区域。
- 图片删除过程中禁用重复删除和图片切换；关闭仍然可用。异步结果只能更新发起操作时的预览，不得关闭后来重新打开的另一张图片。
- 历史刷新移除了正在查看的图片时关闭预览，不自动跳到数组相同下标的另一张图片。
- 关闭普通预览后回到原缩略图按钮；如果该按钮已删除则回到当前批次区域，批次也不存在时回到历史记录标题。

### 4.6 详情与错误反馈

- 详情保留完整任务提示词、模型、已有参数、任务状态、错误消息；有单图作业时继续显示 provider 名称、协议、预期/实际尺寸、失败阶段。
- 旧批次没有 `jobs` 时仍能显示任务及其错误，不能出现空白详情或报错。
- 详情中的提示词用 `white-space: pre-wrap`；折叠是呈现方式，不截断保存的数据，也不覆盖提示词库原文。
- 批次摘要始终显示失败统计。点击导出、重试、删除后的操作错误在条目内直接显示，不能藏在关闭的详情或“更多”里面。
- 删除批次沿用包含批次名称、任务数和图片数的确认文案；取消时不调用删除接口。
- 详情默认不挂载长列表内容，点击时才渲染；重新关闭可以卸载详情内容，开关状态归该批次条目管理。

## 5. 响应式布局与可访问性

| 视口 | 批次布局 | 监控布局 |
| --- | --- | --- |
| 大于 1100px | 三列：摘要 200px、图片 `minmax(0, 1fr)`、操作 180px；图片在一行 | 右侧停靠入口 + 420px 覆盖抽屉 |
| 721–1100px | 第一行摘要和操作，第二行完整宽度的缩略图横排 | 同上 |
| 720px 及以下 | 摘要、紧凑操作、缩略图依次排列；同批图片仍不换行 | 入口进入正常文档流，抽屉全宽 |

- `workspace-grid`、历史条目及缩略图父容器均设置必要的 `min-width: 0`，防止 flex/grid 的最小内容宽度撑破页面。
- “一批一行”指一个紧凑的批次记录和其中一条图片横排。小屏上的摘要和按钮可上下排布，不能为追求一条物理水平线把文字、按钮挤坏。
- 保留现有中性工作台配色、圆角和按钮风格，避免顺带重做主题。
- 入口和详情按钮设置 `aria-expanded`、`aria-controls`；抽屉和大图有各自明确的可访问名称。
- 原生 `dialog.showModal()` 承担模态焦点约束；初始焦点放关闭按钮，避免一打开就滚到列表中部。
- 焦点框不能被缩略图滚动容器裁掉；至少保留 4px 内边距。
- 摘要和长文件名不能撑宽布局；宽度不足时截断展示，但可访问名称保留全文。
- 状态变化不在每次轮询时重复播报整份任务列表；错误使用现有 `role="alert"`，操作完成使用简短 `role="status"`。

## 6. 数据与性能范围

本次复用：

- `GET /api/history`：批次、任务、作业和图片。
- `GET /api/batches/:batchId`：当前批次及队列计数。
- 现有暂停、继续、重试、载入、图片下载、图片/批次删除回调。
- `GET /api/download/images/:imageId`：缩略图展示和大图预览的图片来源。

本次不新增表、不改 schema、不迁移数据、不创建新的 thumbnail API，不压缩或覆盖原图片。

固定缩略图首先解决页面尺寸和浏览密度问题。CSS 把图片显示为 160 × 90，并不代表网络只下载 160 × 90 的小文件；浏览器仍使用现有原图接口。懒加载与详情按需挂载可以减少提前加载和 DOM 内容，但不能宣称已经实现服务器缩略图缓存或大量历史数据的分页优化。

## 7. 文件职责与修改范围

### 新增

| 文件 | 职责 |
| --- | --- |
| `web/src/components/monitor/monitor-drawer.tsx` | 监控入口、计数摘要、抽屉外壳；不自行请求批次或调度任务 |
| `web/src/components/history/history-batch-details.tsx` | 仅在展开时渲染任务全文与作业信息；承接 `HistoryCard` 现有明细 |
| `web/src/components/history/history-image-viewer.tsx` | 按图片 ID 预览同批图片、导航、下载、带确认的删除和反馈 |
| `web/src/tests/monitor-drawer.test.tsx` | 默认关闭、入口计数、开关、Escape、背景关闭及回调边界 |
| `web/src/tests/history-image-viewer.test.tsx` | 同批导航、首尾、删除/刷新失效、错误和焦点返回 |
| `server/tests/workbench-layout-browser-check.cjs` | 复用模拟验收服务，检查真实浏览器的布局、横滚、抽屉及窄屏行为 |

### 修改

| 文件 | 修改原因 |
| --- | --- |
| `web/src/App.tsx` | 增加监控开关，将现有 `RunSummary` 和当前批次列表置入抽屉；保留轮询及业务回调位置 |
| `web/src/components/ui/modal-dialog.tsx` | 增加默认兼容的 `placement` 和可选 `id`，允许外层 dialog 使用右侧布局；已有居中弹窗保持默认值 |
| `web/src/components/history/history-card.tsx` | 批次摘要、图片横排、紧凑操作、详情开关与原有操作反馈 |
| `web/src/components/history/image-grid.tsx` | 保留现有组件文件和调用职责，内部改成固定缩略图横排，管理预览图片 ID |
| `web/src/components/history/history-list.tsx` | 历史标题的焦点回退锚点与必要容器语义；保留列表数据流和下载目录 |
| `web/src/styles.css` | 单列工作区、监控停靠入口/抽屉、历史条目、横排缩略图和响应式样式 |
| `web/src/tests/history-card.test.tsx` | 明细改为点击后验证，保留载入、失败项重试和删除确认覆盖 |
| `web/src/tests/image-grid.test.tsx` | 从缩略图进入预览，仍验证图片接口及删除确认路径 |
| `web/src/tests/history-list.test.tsx` | 保留加载、空态和错误态，补充稳定批次渲染 |
| `web/src/tests/app-history-restore.test.tsx` | 适配历史与编辑区都有预览按钮后的查询范围；补充关闭抽屉仍更新的集成检查 |
| `web/src/tests/mobile-layout.test.ts` | 更新原双列监控断言；窄屏真实布局由浏览器测量补足 |
| `WORKLOG.md` | 各阶段进度、文件原因、验证结果及最终交接 |

`RunSummary` 原有统计/暂停组件原则上原样复用；不改 `useActiveBatch`、`useHistory`、API/types、数据库或 provider 实现。若实施时发现相关代码存在无关问题，单独记录，不顺带扩张本计划。

## 8. 关键组件契约

实施对照：实际 `MonitorDrawer` 直接接收 `activeBatch`、`onOpenChange` 和暂停/继续/重试回调，承接原监控展示块，减少 App 中的展示代码；轮询和业务操作仍由 App 持有。实际样式类为 `.modal-dialog-right`，手机入口为正常文档流中的整行按钮。实际历史卡片直接承担行布局，使用分隔线连续排列；缩略图间距为 10px。下面的代码保留为规划参考，功能验收以已确认的交互行为和测试为准。

### 8.1 给现有弹窗增加布局选项

在 `modal-dialog.tsx` 的现有 props 中增加下面两项，其他 props 和焦点/Escape/遮罩逻辑保留：

```tsx
id?: string;
placement?: "center" | "right";
```

现有外层 `<dialog>` 的对应属性改为：

```tsx
id={props.id}
className={`modal-dialog${props.placement === "right" ? " modal-dialog--right" : ""}`}
```

`className` 仍用于内部 `.modal-card`，不能把它偷偷改成外层 class 的含义。未传 `placement` 的导入、提示词库、课件列表、任务预览和无文字弹窗继续居中。

### 8.2 监控外壳

`monitor-drawer.tsx` 的最小结构如下；统计始终来自 `App`，组件自身没有网络请求：

```tsx
import type { ReactNode } from "react";
import { ModalDialog } from "../ui/modal-dialog";

export function MonitorDrawer(props: {
  open: boolean;
  hasActiveBatch: boolean;
  running: number;
  failed: number;
  unknown: number;
  children: ReactNode;
  onOpen: () => void;
  onClose: () => void;
}) {
  return <>
    <button
      type="button"
      className="ghost-button monitor-launcher"
      aria-label="运行监控"
      aria-expanded={props.open}
      aria-controls="run-monitor-drawer"
      onClick={props.onOpen}
    >
      <strong>运行监控</strong>
      {props.hasActiveBatch ? <>
        <span>运行 {props.running}</span>
        <span className={props.failed > 0 ? "error-copy" : undefined}>失败 {props.failed}</span>
        {props.unknown > 0 ? <span>未知 {props.unknown}</span> : null}
      </> : null}
    </button>
    <ModalDialog
      id="run-monitor-drawer"
      open={props.open}
      label="运行监控"
      placement="right"
      className="monitor-drawer"
      onClose={props.onClose}
    >
      <div className="monitor-drawer-heading">
        <h2>运行监控</h2>
        <button type="button" className="ghost-button" data-modal-initial-focus onClick={props.onClose}>关闭</button>
      </div>
      <div className="monitor-drawer-body">{props.children}</div>
    </ModalDialog>
  </>;
}
```

`App` 新增 `const [monitorOpen, setMonitorOpen] = useState(false)`，把外壳放在工作区的第一个位置，方便窄屏入口位于编辑器上方。将目前第二个 `.column-stack` 中的两个监控区块放入外壳作为 `children`，取消原来的常驻监控列。对应传参：

```tsx
open={monitorOpen}
hasActiveBatch={Boolean(activeBatch.activeBatch)}
running={activeBatch.activeBatch?.scheduler.running ?? 0}
failed={activeBatch.activeBatch?.scheduler.failed ?? 0}
unknown={activeBatch.activeBatch?.scheduler.unknown ?? 0}
onOpen={() => setMonitorOpen(true)}
onClose={() => setMonitorOpen(false)}
```

现有任务列表里的完整 `<strong>{task.prompt}</strong>` 改为摘要加可展开全文：

```tsx
<p className="monitor-task-preview">{task.prompt}</p>
<details className="monitor-task-details">
  <summary>查看完整提示词</summary>
  <p className="history-prompt">{task.prompt}</p>
</details>
```

### 8.3 历史组件的状态边界

- `HistoryCard` props 保持现有签名；增加 `detailsOpen` 状态。导出/重试状态继续由卡片持有，更多菜单的开关不影响这些状态。
- `HistoryBatchDetails` 接收 `{ item: HistoryItem }`；将现有 `stageLabels`、`jobTitle`、`dimensionSummary` 及任务/作业明细移入该文件。完整处理 `item.jobs ?? []`，并渲染无作业记录的旧任务。
- `ImageGrid` 继续接收 `{ images: ImageRecord[]; onDeleteImage: (id: string) => Promise<void> }`；内部保存 `selectedImageId: string | null`，批次级数据无需再请求。
- `HistoryImageViewer` 使用下面的 props，不根据文件名或数组位置写入选择状态：

```tsx
type HistoryImageViewerProps = {
  images: ImageRecord[];
  selectedImageId: string | null;
  onSelect: (imageId: string) => void;
  onClose: () => void;
  onDeleteImage: (imageId: string) => Promise<void>;
};
```

其中 `ImageRecord` 从 `../../lib/types` 导入。导航索引仅在渲染时从 ID 派生：

```tsx
const index = props.images.findIndex((image) => image.id === props.selectedImageId);
const selected = index >= 0 ? props.images[index] : null;
const previousId = index > 0 ? props.images[index - 1].id : null;
const nextId = index >= 0 && index + 1 < props.images.length ? props.images[index + 1].id : null;
```

上一张按钮只有 `previousId` 存在时才调用 `onSelect(previousId)`；下一张对 `nextId` 做相同检查。删除确认中的文件名取 `selected.filename`，删除请求取 `selected.id`。

### 8.4 CSS 核心规则

以下是本次布局的核心规则，应与现有选择器整合，不能把全局 `.image-preview` 改为缩略图专属尺寸：

```css
.workspace-grid { grid-template-columns: minmax(0, 1fr); min-width: 0; padding-inline-end: 88px; }
.workspace-grid > .column-stack { min-width: 0; }
.monitor-launcher {
  position: fixed;
  inset-inline-end: max(12px, calc((100vw - 1680px) / 2 + 12px));
  top: 180px;
  z-index: 8;
  display: grid;
  gap: 4px;
  width: 72px;
  min-height: 44px;
  padding: 10px 4px;
  font-size: 0.75rem;
}
.modal-dialog--right { position: fixed; inset: 0; padding: 0; overflow: hidden; }
.modal-dialog--right[open] { place-items: stretch end; }
.monitor-drawer {
  width: min(420px, 100vw);
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  padding: 0;
  border-radius: 0;
  display: flex;
  flex-direction: column;
}
.monitor-drawer-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px; flex: none; }
.monitor-drawer-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: grid; align-content: start; gap: 12px; padding: 0 16px 16px; }
.monitor-drawer .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.monitor-task-preview { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.history-prompt { white-space: pre-wrap; overflow-wrap: anywhere; }
.history-batch-row { display: grid; grid-template-columns: 200px minmax(0, 1fr) 180px; gap: 16px; align-items: center; min-width: 0; }
.history-batch-row > * { min-width: 0; }
.history-batch-summary { grid-column: 1; grid-row: 1; }
.history-batch-media { grid-column: 2; grid-row: 1; }
.history-row-actions { grid-column: 3; grid-row: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.history-image-strip { min-width: 0; display: flex; flex-wrap: nowrap; gap: 12px; overflow-x: auto; padding: 4px; }
.history-thumbnail { flex: 0 0 160px; width: 160px; min-width: 0; }
.history-thumbnail-button { display: block; width: 160px; height: 90px; padding: 0; overflow: hidden; background: var(--color-bg-subtle); }
.history-thumbnail-button img { display: block; width: 100%; height: 100%; object-fit: contain; }
.history-thumbnail-label { display: block; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-actions-menu { position: relative; }
.history-actions-popover { position: absolute; inset-inline-end: 0; top: 100%; z-index: 9; display: grid; gap: 8px; width: 180px; padding: 10px; background: var(--color-bg-surface); border: 1px solid #e1e7eb; border-radius: var(--radius-card); }
.history-batch-details { min-width: 0; }
@media (prefers-reduced-motion: no-preference) {
  .modal-dialog--right[open] .monitor-drawer { animation: monitor-enter 180ms ease-out; }
  @keyframes monitor-enter { from { transform: translateX(100%); } to { transform: translateX(0); } }
}
@media (max-width: 1100px) {
  .history-batch-row { grid-template-columns: minmax(0, 1fr) 180px; }
  .history-row-actions { grid-column: 2; }
  .history-batch-media { grid-column: 1 / -1; grid-row: 2; }
}
@media (max-width: 720px) {
  .workspace-grid { padding-inline-end: 0; }
  .monitor-launcher { position: static; justify-self: end; display: flex; flex-wrap: wrap; width: auto; padding: 10px 12px; }
  .monitor-drawer { width: 100vw; }
  .history-batch-row { grid-template-columns: minmax(0, 1fr); }
  .history-batch-summary, .history-row-actions { grid-column: 1; grid-row: auto; }
  .history-batch-media { grid-column: 1; grid-row: auto; }
}
```

历史条目 DOM 顺序为摘要、操作、图片；桌面分别指定摘要第 1 列、图片第 2 列、操作第 3 列，721–1100px 操作第 2 列、图片下一行，手机按 DOM 顺序展示。这些定位应随对应断点明确重置，避免遗留 `grid-column: 3` 产生隐式列。

已有 `@media (max-width: 1500px)` 的工作区单列规则可以保留，但不能重新恢复右侧监控列。已有居中弹窗和任务图片预览的规则继续有效。仅给历史组件使用 `.history-*` 选择器，不影响上方编辑区的结果图。

## 9. 实施步骤与阶段验收

每个阶段结束后更新 `WORKLOG.md`；核心行为首次跑通、大改开始和完成时同步一份简短接力摘要。定向验证通过后进入下一阶段，除非出现新改动或失败，不反复运行相同检查。

### Task 0：固定本次实施基线

**读取：** `AGENTS.md`、`WORKLOG.md`、本文件、上一阶段课件计划。

- [x] 执行下面命令，记录当前分支和已存在的改动；把“前一阶段代码未提交”写入本次工作日志。

```powershell
git status --short --branch
git diff --stat
git diff -- web/src/App.tsx web/src/styles.css
```

- [x] 记录 `npm test` 208 项和 build 通过是既有日志中的基线；只有环境或源码在此后变化且结果不可复用时，才重新跑基线检查。
- [x] 确认本次源码范围在第 7 节以内，不涉及运行数据库或 provider 设置。
- [x] 开始大改前更新 `WORKLOG.md`，记录当前目标、已有成果、预计文件、验证命令和红线。

**完成条件：** 可以明确区分之前的课件功能与此次 UI 修改，且未丢失任何已有工作。

### Task 1：完成监控抽屉外壳

**新增：** `monitor-drawer.tsx`、`monitor-drawer.test.tsx`。

**修改：** `modal-dialog.tsx`、`styles.css` 中抽屉专属规则。

- [x] 加入第 8.1 节的兼容 props 和第 8.2 节外壳，按第 8.4 节增加专属样式。
- [x] 添加下面的交互测试；测试的是开关和任务回调边界，不测试 CSS 字符串是否复制成功。

```tsx
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MonitorDrawer } from "../components/monitor/monitor-drawer";

afterEach(cleanup);

it("opens and closes without operating the queue", () => {
  const pause = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    return <MonitorDrawer open={open} hasActiveBatch running={8} failed={1} unknown={0}
      onOpen={() => setOpen(true)} onClose={() => setOpen(false)}>
      <button onClick={pause}>暂停补位</button>
    </MonitorDrawer>;
  }
  render(<Harness />);
  const launcher = screen.getByRole("button", { name: "运行监控", exact: true });
  expect(screen.queryByRole("dialog", { name: "运行监控" })).not.toBeInTheDocument();
  expect(within(launcher).getByText("运行 8")).toBeInTheDocument();
  launcher.focus();
  fireEvent.click(launcher);
  const dialog = screen.getByRole("dialog", { name: "运行监控" });
  expect(within(dialog).getByRole("button", { name: "关闭" })).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "运行监控" })).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
  expect(pause).not.toHaveBeenCalled();
});
```

- [x] 补充无当前批次、计数更新、点击遮罩、点击抽屉内部不关闭的用例。关闭状态下通过 rerender 改成失败 2，入口应更新且抽屉仍关闭。
- [x] 运行定向检查。

```powershell
npm run test -w web -- monitor-drawer.test.tsx run-summary.test.tsx prompt-library-modal.test.tsx textless-panel.test.tsx
```

**预期：** 新抽屉交互通过，旧的居中弹窗及队列统计测试仍通过。

### Task 2：接入 App 并释放主编辑区空间

**修改：** `App.tsx`、`styles.css`、`app-history-restore.test.tsx`、`mobile-layout.test.ts`。

- [x] 按第 8.2 节增加 `monitorOpen`，将现有两块监控内容移入抽屉；沿用原 `RunSummary` 的全部参数和业务回调。
- [x] 将 `.workspace-grid` 改为单列；桌面入口固定，手机入口正常排版。
- [x] 把当前批次任务的长提示词改为两行摘要加全文展开，不改任务文本本身。
- [x] 在 App 集成测试中模拟有未完成任务的当前批次：先加载状态“运行 1”，关闭抽屉时让第二次轮询返回“成功 1”，再展开应显示新状态。
- [x] 同一用例记录 `createBatch`、`pauseBatch`、`resumeBatch`、`retryTasks` 的调用次数；只开关抽屉时这些调用次数必须保持不变。该测试应真实使用 `useActiveBatch`，不要把整个 hook mock 掉。
- [x] 在同一监控已接入的页面验证载入历史仍恢复原图和子图、课件页定稿选择仍能工作。
- [x] 如果历史预览增加了与任务编辑区同名的按钮，修改旧测试为在 `#task-editor` 内查找编辑区按钮，不通过删除断言解决重复匹配。

```powershell
npm run test -w web -- app-history-restore.test.tsx use-active-batch.test.tsx app-shell.test.tsx mobile-layout.test.ts
```

**预期：** 关闭抽屉时继续轮询；编辑会话、历史恢复与旧居中弹窗无回归。

**阶段接力记录：** 在 `WORKLOG.md` 写明监控首次跑通、修改文件、验证结果、历史区尚未改完。

### Task 3：把历史大卡片改成紧凑批次条目

**新增：** `history-batch-details.tsx`。

**修改：** `history-card.tsx`、`history-list.tsx`、`styles.css`、对应测试。

- [x] 以现有 `HistoryCard` 数据为基础渲染 `.history-batch-row`，划分摘要、操作、图片容器；保留外层 `article` 和批次 ID。
- [x] 添加 `detailsOpen`，详情按钮使用 `aria-expanded` 和 `aria-controls`；仅在打开时渲染 `HistoryBatchDetails`。
- [x] 将已有任务/作业明细及其格式函数移入新详情组件，保持错误阶段、provider、尺寸信息完整；旧任务无作业时也显示全文和状态。
- [x] 将“导出图片 / 重试失败项 / 删除批次”放入更多面板。原导出和重试函数沿用；错误反馈留在条目外层。
- [x] 保留批次删除的完整确认；补充删除请求失败的条目错误反馈和重复点击禁用，不能产生未处理 Promise。
- [x] 修改现有失败任务测试：默认全文不在 DOM，点击详情后再验证全文、429、provider、尺寸校验错误，然后从更多操作重试。应仍只向回调传入 `task-failed` 和原 batch ID。
- [x] 加入多任务、多图片计数测试，证明图片数没有被当作任务数或页数。

下面的完整用例可加入 `history-card.test.tsx`，验证旧批次的全文可找回：

```tsx
it("keeps legacy prompts behind an explicit details action", () => {
  const item = {
    batch: { id: "legacy", name: "旧批次", status: "completed", total_tasks: 1,
      success_count: 0, failed_count: 1, created_at: "2026-09-09T08:00:00.000Z" },
    tasks: [{ id: "legacy-task", prompt: "第一行\n第二行完整提示词", model: "gpt-image-2",
      size: "16:9", n: 1, status: "failed", error_message: "请求失败" }],
    jobs: [],
    images: []
  };
  render(<HistoryCard item={item} exportDirectory=""
    onRestoreBatch={() => undefined} onDeleteBatch={async () => undefined}
    onDeleteImage={async () => undefined} onExportBatch={async () => undefined}
    onRetryTasks={async () => undefined} />);
  expect(screen.queryByText(/第二行完整提示词/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "详情", exact: true }));
  expect(screen.getByText(/第二行完整提示词/).textContent).toBe("第一行\n第二行完整提示词");
  expect(screen.getByText("请求失败")).toBeInTheDocument();
});
```

```powershell
npm run test -w web -- history-card.test.tsx history-list.test.tsx use-history.test.tsx
```

**预期：** 默认批次条目紧凑；详情信息未丢；载入、导出、重试、删除取消和确认仍走原有回调。

### Task 4：固定缩略图横排并加入同批大图预览

**新增：** `history-image-viewer.tsx`、`history-image-viewer.test.tsx`。

**修改：** `image-grid.tsx`、`image-grid.test.tsx`、`styles.css`。

- [x] `ImageGrid` 不再使用自适应铺满图片网格。使用第 8.4 节 `.history-image-strip` 和固定图片框，保持每个 `image.id` 的 key。
- [x] 每张图使用原 `<img>` URL、完整 `alt={image.filename}`，外层按钮标注 `aria-label={\`查看 ${image.filename} 大图\`}`，点击仅设置预览 ID。
- [x] 空批次保留原说明；加载失败时保留 160 × 90 框，给出可见文件名和失败提示。
- [x] 按第 8.3 节预览契约完成上一张/下一张、首尾禁用、键盘导航、下载和关闭，使用现有 `ModalDialog` 的居中模式。
- [x] 将单图删除从原缩略图按钮迁入大图预览，保留原确认文案；删除成功/失败、重复操作和稍后返回的异步结果遵循第 4.5 节。
- [x] `ImageGrid` 持有缩略图区域及原触发按钮引用，普通关闭返回触发按钮，删除或刷新失效时返回批次区域，最后退到历史标题。
- [x] 更新旧 `image-grid.test.tsx` 删除测试：先点击缩略图，再在“历史图片预览”内点击删除；确认取消时回调仍为 0 次。
- [x] 新增图片列表刷新和顺序变化用例，确保根据图片 ID 继续定位；正在预览图被移除时关闭。

下面的测试验证“没有因为紧凑布局而丢图”，CSS 尺寸交给真实浏览器验证：

```tsx
it("keeps all 23 images available and opens the last image", () => {
  const images = Array.from({ length: 23 }, (_, index) => ({
    id: `image-${index + 1}`,
    filename: `page-${index + 1}.png`,
    local_path: `batch/page-${index + 1}.png`
  }));
  render(<ImageGrid images={images} onDeleteImage={async () => undefined} />);
  expect(screen.getAllByRole("img")).toHaveLength(23);
  fireEvent.click(screen.getByRole("button", { name: "查看 page-23.png 大图", exact: true }));
  const dialog = screen.getByRole("dialog", { name: "历史图片预览" });
  expect(within(dialog).getByRole("img", { name: "page-23.png" })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "下一张" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "上一张" }));
  expect(within(dialog).getByRole("img", { name: "page-22.png" })).toBeInTheDocument();
});
```

在该测试文件现有 Testing Library 导入中增加 `within`。

```powershell
npm run test -w web -- image-grid.test.tsx history-image-viewer.test.tsx history-card.test.tsx task-row-preview.test.tsx
```

**预期：** 23 张图均可到达；同批导航正确；任务行原有预览未受影响；删除确认和异步反馈通过。

### Task 5：在真实浏览器中完成布局验收

**新增：** `server/tests/workbench-layout-browser-check.cjs`。

**复用：** `server/tests/courseware-browser-server.ts`，只使用其临时 SQLite 和 mock provider。

- [x] 浏览器脚本沿用现有 `COURSEWARE_PLAYWRIGHT_MODULE` 解析方式与 Windows Edge 通道；模块不可用时先查询 Codex 已配置运行时，不安装全局依赖。
- [x] 固定验收入口 `http://127.0.0.1:3019`。不要把真实的 5173 页面或实际数据库用作导出、重试和删除测试。
- [x] 使用 `page.route` 为该模拟服务的 `/api/history` 提供 0、1、23、100 张图片批次，为虚拟图片下载 URL 提供横版、竖版、方图和一张失败响应。fixture 使用真实 `HistoryItem` 字段名，图片 ID 在全部批次中唯一。文件名按批区分：单张用 `single-1.png`，23 张用 `page-1.png` 至 `page-23.png`，100 张用 `large-1.png` 至 `large-100.png`，避免浏览器查找按钮时重名。
- [x] 队列场景使用模拟批次和可控的轮询响应；开关抽屉前后记录 POST 请求，证明没有额外提交、暂停或重试。
- [x] 依次检查 1920×1080、1365×900、1024×768、390×844。每个宽度验证主页面无横向溢出，只有图片条可横滚。
- [x] 检查抽屉展开前后编辑区的 x 坐标和宽度误差不超过 1px，且抽屉右边缘与视口右边缘相同。
- [x] 23 张图中包含横版、竖版、方图，全部框尺寸仍为 160 × 90，同批图片框顶部坐标一致；只有一张图的批次也保持此尺寸。
- [x] 横滚到末尾后能点击第 23/100 张，预览身份与文件名对应；切换下一批次时互不串图。
- [x] 测试长批次名、超长提示词、失败批次无图片、旧批次无 `jobs`、图片加载失败、详情和更多面板展开。
- [x] 测试 Tab、Shift + Tab、Escape、左右方向键及减少动态效果模式；打开抽屉后焦点不能进入后方编辑器。
- [x] 验收截图保存在现有被忽略的 `app-data/courseware-acceptance/` 下，名称使用 `workbench-<viewport>-<state>.png`，保留记录不自动清理。

浏览器尺寸断言的核心代码如下，放入验收脚本已创建的 `page` / `assert` 环境中；该脚本的依赖导入及启动方式沿用 `courseware-browser-check.cjs`：

```js
const strip = page.locator('.history-image-strip').filter({
  has: page.getByRole('button', { name: '查看 page-23.png 大图', exact: true })
}).first();
const boxes = await strip.locator('.history-thumbnail-button').evaluateAll((nodes) =>
  nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height, top: rect.top };
  })
);
assert.equal(boxes.length, 23);
for (const box of boxes) {
  assert.ok(Math.abs(box.width - 160) <= 1);
  assert.ok(Math.abs(box.height - 90) <= 1);
  assert.ok(Math.abs(box.top - boxes[0].top) <= 1);
}
assert.equal(await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth
), true);
assert.equal(await strip.evaluate((node) => node.scrollWidth > node.clientWidth), true);
await strip.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
await page.getByRole('button', { name: '查看 page-23.png 大图', exact: true }).click();
assert.equal(await page.getByRole('dialog', { name: '历史图片预览' }).isVisible(), true);
```

验收启动命令：

```powershell
npm run build
node --import tsx server/tests/courseware-browser-server.ts
```

第二条保持运行，在另一工具会话执行：

```powershell
node server/tests/workbench-layout-browser-check.cjs
node server/tests/courseware-browser-check.cjs
```

若本项目无法直接解析 `playwright`，用 `load_workspace_dependencies` 查询已配置模块路径，并仅给当前验收进程设置 `COURSEWARE_PLAYWRIGHT_MODULE`，不改 `.env`。模拟服务和截图工具都使用隐藏工具会话，不弹出额外终端窗口。

**预期：** 布局验收通过；原课件浏览器验收中的提示词保留、子图单选、两种 PPT 导出及无文字结果复用继续通过；真实 provider 调用为 0。完成后停止自己启动的 3019 模拟服务，保留用户正在使用的本地服务。

### Task 6：全量验证与交付记录

- [x] 运行项目要求的完整测试与构建，任一失败均先定位原因，不能注释断言或增加跳过标记。

```powershell
npm test
npm run build
git diff --check
```

- [x] 将实际测试数、通过/失败、浏览器视口、截图位置和未覆盖项目写入 `WORKLOG.md`。不要直接复制“208 项”作为改动后的结果。
- [x] 对照第 10 节逐项验收，并检查每个改动都能追溯到本计划。
- [x] 检查未改动数据库结构、provider、API 计费/重试规则、原始图片、提示词原文和 PPT 页选择；不新增依赖。
- [x] 完成阶段接力摘要：目标、已完成项、修改文件及原因、验证命令及结果、剩余事项、下一步和风险。
- [x] 向鹿鸣交付本地页面和验证结果；本次 UI 的本地提交按届时明确的提交范围处理，不自动把其他未提交工作混入，不自动推送或部署。

## 10. 最终验收清单

| 编号 | 用户能观察到的结果 | 验证方式 |
| --- | --- | --- |
| M1 | 进入页面时没有常驻右侧大监控栏 | 浏览器截图 |
| M2 | 点入口后从右侧滑出，关闭/Escape/遮罩可收起 | 组件 + 浏览器 |
| M3 | 展开不会挤窄或移动编辑区 | 浏览器矩形测量 |
| M4 | 收起仍能看到计数变化，任务继续执行 | App 实际轮询 + mock 请求记录 |
| M5 | 暂停、继续、失败重试仍由用户明确点击触发 | 组件 + 模拟接口 |
| M6 | 长任务列表在抽屉内滚动，入口和关闭键可操作 | 浏览器 + 键盘 |
| H1 | 每批为一条连续记录，新批次在上面 | 多批 fixture |
| H2 | 单图、23 图、100 图的图片框大小相同 | 160 × 90 测量 |
| H3 | 同批图片不换行，末尾图片可横滚访问 | 浏览器测量 + 点击 |
| H4 | 横版、竖版、方图均完整显示，不裁切或变形 | 多比例 fixture + `object-fit` 检查 |
| H5 | 默认看不到大段提示词和作业明细，详情中能看全文 | DOM 挂载 + 展开测试 |
| H6 | 大图只在当前批次导航，不改变课件定稿 | 导航测试 + 课件回归 |
| H7 | 图片/批次删除仍先确认，取消不删除，失败有反馈 | mock 回调测试 |
| H8 | 载入、目录导出和只重试失败项均保留 | 既有回归 + 更多操作测试 |
| H9 | 无图、旧记录、长文、失效图与刷新中状态可读 | 边界 fixture |
| R1 | 390px 下网页无横向溢出；图片条可单独滑动 | 浏览器测量 |
| R2 | 提示词原文、原图/子图单选、PPT 与无文字流程通过 | 课件单元 + 模拟浏览器验收 |
| R3 | 业务数据、真实图片、数据库结构和密钥未被改动 | 差异审查 + 模拟环境记录 |

## 11. 不纳入本次实现的事项

- 历史搜索、日期筛选、收藏、重命名批次、拖拽排序、跨批次合并。
- 用历史缩略图直接改变 PPT 页序或选中定稿。
- 在历史卡片新增生成无文字图或导出 PPT 的另一套流程。
- 服务器缩略图生成、缓存回收、数据库优化、分页或虚拟列表。
- 全站设计改版、主题重做、provider 管理改造。

这些事项不影响本次目标完成，也不应成为执行当前计划的前置条件。

## 12. 文档交付与接力状态

- 当前已完成：规划及 Task 0–6 的产品实现、测试、独立审查、浏览器验收和主目录同步。
- 实施文件：第 7 节所列组件、样式、测试及浏览器脚本，共 17 个源码/测试文件；`WORKLOG.md` 和本计划记录最终交接。
- 实际验证：`npm test` 225 项通过（server 124、web 101）；隔离目录和主目录 `npm run build` 均通过；四种视口的历史/监控浏览器验收及原课件浏览器回归通过。
- 当前未完成：本计划范围内无待实施事项。代码仍未提交或推送，保留原有未提交的课件成果。
- 下一步：刷新 `http://127.0.0.1:5173/` 使用新界面；需要 Git 提交时另按明确范围处理。
- 主要注意事项：保留 `codex/monitor-history` 工作区和本地验收材料；CSS 缩略图仍取原图文件；真实数据、删除、密钥、系统、迁移和发布红线继续适用。

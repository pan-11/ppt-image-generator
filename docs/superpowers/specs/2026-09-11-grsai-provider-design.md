# GrsAI 与沧元算力中转站接入设计

日期：2026-09-11。状态：两个中转站已完成接入并同步主目录；全量测试、构建、独立审查和本地页面检查通过。真实生图和参考图上传尚未进行。

## 1. 目标与边界

在正式「中转站设置」中加入 `GrsAI GPT Image` 和 `沧元算力图片` 协议，使两个中转站均可分别被选作文生图、图生图服务，接入已有页面生成、基于图片修改和无文字版本流程。沧元的具体契约见第9节。

用户明确指定：

- 控制台：<https://k.grsai.com/>
- 文档：<https://grsai.ai/dashboard/documents/gpt-image>
- Base URL：`https://grsai.dakka.com.cn`
- 生成接口：`POST /v1/draw/completions`
- 每次生成 payload 必须包含布尔值 `shutProgress: true`。

首期覆盖项目已有 GPT Image 工作流：`gpt-image-2`、`gpt-image-2-vip`，16:9 页面。其他模型、任意比例、透明背景、蒙版编辑和公网回调服务不属于本次范围。保留当前课件数据、提示词、定稿单选、导出及原有其他中转站行为。

只开发协议支持和设置入口。真实 Key 由用户在网页本机表单中填写；不代写 `.env`，不填虚构 Key，不自动切换当前中转站。真实生图验收另行确认，默认使用模拟响应和临时测试数据。

## 2. 已核对的依据

- 当前源码基线：主目录 `main`，`3652443`。本机未提交的安装提示词和工作日志需要保留。
- 已展开官方旧接口页面，读取请求头、参数、任务 ID、查询结果示例；原始只读快照保存在忽略目录 `app-data/grsai-gpt-image-docs-2026-09-11.txt` 和 `app-data/grsai-gpt-image-examples-2026-09-11.json`。
- 旧文档明确链接到[官方新文档](https://qmy27nhsd9.apifox.cn/452409160e0)，并说明其中的像素尺寸适用于旧接口。新文档的 OpenAPI 描述已读取，快照为 `app-data/grsai-gpt-image-schema-2026-09-11.md`。
- 新文档另有 `/v1/api/generate`、`images`、`replyType` 等字段。本次遵从用户指定的旧端点，不混用新旧接口的路径或字段。
- 现有 `generation_jobs` 已有 `protocol_type`、`remote_task_id`、`remote_result_url`、provider ID/revision；协议列为文本。新增协议不需要数据库 schema 变更或迁移。

## 3. 方案选择

| 方案 | 结论 |
| --- | --- |
| 新增独立 `grsai-draw` adapter，取任务 ID 后轮询 | 推荐。隔离协议差异，并复用当前任务持久化、并发控制和恢复机制。 |
| 在现有 ToAPIs/YM2/云飞 adapter 内根据域名分支 | 不采用。现有请求、轮询路径和返回格式均不同，且项目要求显式指定协议。 |
| 改用 GrsAI 新版 `/v1/api/generate` | 不采用。超出用户明确指定的接口要求，也无法照搬 `shutProgress` 要求。 |

## 4. 请求和响应契约

### 4.1 地址与鉴权

新协议内部标识：`grsai-draw`，显示名称：`GrsAI GPT Image`。

设置页提示填写站点根地址。适配器接受根地址及结尾 `/v1`，统一规范为 origin 后拼接明确接口路径；其他路径、URL 内用户名密码、query/hash 应提示修正，避免生成 `/v1/v1/...` 或把控制台地址作为接口地址。

生成和查询均使用 JSON，认证头为 `Authorization: Bearer <用户本机保存的 Key>`。Key 只发给配置的 API 节点，不随结果图片下载请求发送到 CDN。保存和报错沿用掩码规则；错误内容不得回显 Key 或参考图 Base64。

### 4.2 生成

向 `https://grsai.dakka.com.cn/v1/draw/completions` 发送下列结构。例如普通版16:9页面：

```json
{
  "model": "gpt-image-2",
  "prompt": "用户当前页面或改图提示词",
  "aspectRatio": "1672x941",
  "quality": "auto",
  "shutProgress": true,
  "webHook": "-1"
}
```

- `shutProgress` 固定为 boolean `true`，不作为可关闭的页面选项。
- `webHook` 使用字符串 `"-1"`，这是文档约定的任务 ID 模式，不是实际回调地址；不开放公网回调端口。
- 无参考图时省略 `urls`；有参考图时用 `urls: ["data:<mime>;base64,..."]`，从本机读取实际选中的参考图并编码。文档支持 Base64；以模拟请求验证使用正确图片字节，首次真实图生图仍须核对提供方实际接受情况。不发送 `127.0.0.1` 文件地址给远程服务，不额外套用 ToAPIs 上传接口。
- 每个 image job 只发起一次独立生成，保留成功兄弟图片。接口文档没有 `n` 字段，不杜撰批量输出参数；页面张数由现有作业拆分处理。
- 不传新版接口的 `images`、`replyType`，也不传 OpenAI Images 的 `size`、`response_format`。

创建任务成功的已记录结构为 `code: 0`，任务 ID 在 `data.id`。收到 ID 后立即通过 `onRemoteReference({ taskId })` 写入现有作业记录，再开始等待结果。

### 4.3 查询和下载

使用同一个中转站及配置 revision，调用：

```http
POST /v1/draw/result
Content-Type: application/json
Authorization: Bearer <本机 Key>
```

```json
{ "id": "已保存的远程任务 ID" }
```

外层 `code: 0` 表示查询成功，内层 `data.status` 区分 `running`、`succeeded`、`failed`。成功时从 `data.results[0].url` 取结果，同时兼容旧文档仍保留的 `data.url`；失败保留经过脱敏的 `failure_reason`/`error`。查询 `code: -22` 明确显示任务不存在，不当成成功，也不自动重新收费生成。

沿用项目轮询节奏：正常间隔8秒、限流等待15秒，最多400次；网络请求单独设置超时，注入 fetch/sleep/次数以支持无等待的模拟测试。查询属于取已有结果，可对暂时性网络错误、429和5xx有限重试；不改造全部旧中转站轮询代码。

远程图片 URL 有时效，成功后立即记录结果地址并下载到现有本机存储，之后使用本机图片显示和导出。重试优先下载已有结果；地址失效且仍有任务 ID 时可重新查询同一任务。查询仍失败时显示错误，不偷偷发起新的生成。

### 4.4 提交不确定与恢复

- 生成请求网络中断、超时、5xx、响应无法解析或缺少可恢复信息时，使用现有 `UnknownSubmissionError` 表示提交状态未知。不得自动重发生成请求以碰运气。
- 401/403、明确参数错误或服务明确拒绝，显示可读错误。对未明确证明未被接收的情况保持保守分类。
- 已保存 ID 后重启或恢复，只调用结果查询接口；`recover` 不调用生成接口。
- 已提交作业始终使用原 provider/revision；尚未提交的任务使用当时启用的文生图/图生图中转站，沿用当前切换规则。

## 5. 模型和尺寸

首期只开放16:9，尺寸依据官方模型说明，禁止把其他中转站的能力无条件复制过来。

| 模型 | 页面分辨率 | 请求 aspectRatio | quality |
| --- | --- | --- | --- |
| gpt-image-2 | 1K | 1672x941 | auto |
| gpt-image-2-vip | 1K | 1280x720 | medium |
| gpt-image-2-vip | 2K | 2048x1152 | medium |
| gpt-image-2-vip | 4K | 3840x2160 | medium |

这些是文档给出的尺寸配置，不是本次实际生图测量结果。适配器的 `resolveRequest` 明确记录请求尺寸和期望尺寸，现有流水线记录实际返回尺寸。异常结果保留供检查并标记校验失败，不拉伸图片、不静默降级模型、不自动重生成。

两种模型均用于文生图和图生图。UI 切换模型后仅显示该模型支持的分辨率；旧页面含不支持的选项时显示现有参数校验提示，不擅自改写用户草稿。每页张数上限沿用现有适配器的10张，每张独立调用；单中转站最大并发继续由用户设置，文生图和图生图共享同一 provider 限额。

无文字结果继续遵守现有源图比例校验。来源图规格不同造成校验失败时要明确提示，不能为了显示成功而放松当前去字和导出规则。

## 6. 文件职责和改动范围

沿用现有目录和英文 kebab-case 命名，不新增数据目录约定。

| 文件 | 改动职责 |
| --- | --- |
| `server/src/providers/grsai-draw-adapter.ts`（新增） | 模型能力、尺寸映射、Base64参考图、提交、查询、下载和恢复。 |
| `server/src/providers/provider-adapter.ts` | ProtocolType 和显式协议判定加入新值。 |
| `server/src/services/batch-service.ts` | 在既有 registry 组装位置注册新 adapter。其余调度原则保持。 |
| `server/src/routes/provider-settings-routes.ts` | 设置接口的协议枚举接受新值。 |
| `server/src/services/provider-settings-service-v2.ts` | 检查新协议持久化往返及配置 revision 保护；仅在现有通用流程无法满足时作最小改动。 |
| `web/src/lib/provider-settings-api.ts`、`web/src/lib/types.ts` | 新协议类型及角色能力兼容。 |
| `web/src/settings-page.tsx` | 新协议选项、站点根地址说明、列表中的正确协议名称；不显示云飞密钥类型。 |
| `server/tests/grsai-draw-adapter.test.ts`（新增） | 精确请求契约、错误分类、轮询、结果下载、恢复测试。 |
| 现有 registry/settings/routing/retry 测试 | 新协议注册、保存/重读、脱敏、角色路由和部分重试回归。 |
| `web/src/tests/settings-page.test.tsx`、`web/src/tests/settings-defaults.test.ts` | 表单保存、新协议名称和模型/分辨率选项。 |

测试实验室有独立的 ToAPIs 接口逻辑，本次不让 GrsAI 误进入实验室的旧接口测试，也不扩展为全协议实验平台。正式工作台适配完成后，用户仍通过现有中转站页面保存和选择。

不新增依赖、不改 `.env`、不改数据库 schema；不修改已配置的中转站或其 Key。不自动提交、推送或重新生成源码 ZIP，交付后按用户后续指示处理。

## 7. 验收标准

1. 断言最终 URL、POST 方法、JSON/鉴权头，以及每次生成都有 `shutProgress === true` 和 `webHook === "-1"`。
2. 文生图无 `urls`；图生图准确包含点击的父图字节；无文字提示词不被适配器改写。
3. 普通/VIP模型及尺寸/质量映射正确，普通版不能选择2K/4K。
4. 提交成功后先保存任务 ID，再轮询；包含 running→succeeded、远端 failed、code非零、-22、缺结果、无效JSON、429、5xx、超时等可区分用例。
5. 提交不确定不自动再生成；恢复已有任务、下载重试均不会多发生成请求；结果下载不附带 provider Key。
6. 三张图片中一张失败时，仅处理失败作业；文生图和图生图正确使用各自角色 provider，同一 provider 共用并发上限。
7. 设置可保存、重读和分别启用角色，Key仅显示掩码；旧三种协议保持可用。
8. 本地运行 `npm test`、`npm run build`，必要的浏览器设置页和课件回归使用模拟服务，不花真实额度。
9. 实现后核对主目录和实际服务目录一致，避免从 `.worktrees/codex-image-generator` 启动旧版。日志记录测试结果及未完成的真实接口验收。

## 8. 交接

已完成两个适配器、前后端协议枚举和设置入口、默认注册，以及模拟网络下的原图生成、子图定稿、无文字版本、分别导出 PPT、旧任务恢复和失败图片单独重试。主目录全量测试362项通过（后端240、前端122），构建和差异检查通过；功能对照及代码质量复审均通过。

GrsAI 错误提示在替换链接之前先过滤原始 Key、完整提示词和参考图内容；提交网络异常、HTTP408/5xx以及无法确认任务 ID 的响应进入现有“提交状态未知”流程，不自动再次计费生成。重试已有任务不发起新的生成。

沧元下载使用现有 sharp 完整解码像素，拒绝错误网页、空响应、伪图片及图片头有效但内容截断的结果，返回原始图片字节而不重新编码。失败时保留远程任务和结果地址，用户重试继续获取原结果。

主目录168个源码基线哈希核对无冲突后同步14个源码/测试文件和2份文档；当前 `http://127.0.0.1:5173/settings` 已显示5种协议，后端验证已接受两个新协议。既有 provider 配置文件哈希未改变。模拟浏览器在1440、390、320像素宽度下无横向溢出，创建、编辑和角色切换通过，真实页面只读检查无报错。

实施计划为 `docs/superpowers/plans/2026-09-11-grsai-cangyuan-providers.md`，最终交付状态和验证记录以主目录 `WORKLOG.md` 最新条目为准。用户在本机网页填写各站 Key 并选择角色；账号权限、实际尺寸、额度、真实生成和参考图上传效果仍需实际使用验证。

## 9. 沧元算力接入契约（2026-09-11，已授权实施）

官方文档与公开部署客户端已核对；以下为本次实现采用的契约。只进行了公开只读请求和一次不含图片的匿名上传元数据请求，未消耗生图额度。

### 9.1 判断

现有三种适配器不能直接完整覆盖该站的文生图、参考图修改及无文字版本。因此新增独立 `cangyuan-images` 选项，页面名称为“沧元算力图片”。与前面的 `grsai-draw` 分开注册，复用已有任务持久化和队列，不新增数据表。

判断依据是具体请求差异，而不是站点品牌不同：

| 对比项目 | 沧元官方契约 | 当前实现及影响 |
| --- | --- | --- |
| 鉴权与提交 | Bearer；JSON；文生图与编辑有各自入口 | 鉴权方式可复用，但不能据此认定完整兼容。 |
| 异步开关 | `async: true`；省略或 false 为同步兼容；官方推荐新接入使用异步 | YM2/云飞 GPT 分支只读取同步图片结果；ToAPIs 不发送此开关。 |
| 参考图 | 编辑入口接收 `images` HTTPS URL 数组 | YM2/云飞发送 multipart 文件；ToAPIs 先走其专用上传，再发 `image_urls`，均不相同。 |
| 查询入口 | 按生成/编辑的原创建路径分别查询任务 | ToAPIs 固定查询 generations；GrsAI 使用 POST draw/result，不能直接套用。 |
| 结果 | 任务对象位于根级或外层 `data`；终态图片取任务对象的 `data[0].url`，原样下载 | 公开客户端的解包逻辑已核对；不套用 ToAPIs 的 `result.data`。 |
| 模型尺寸 | 普通公共名使用比例；多档模型将 1K/2K/4K 写进模型名 | 不沿用 YM2 的固定像素映射，也不把普通 gpt-image-2 当成支持所有分辨率。 |

来源：[图像 API](https://ai.cangyuansuanli.cn/docs/api/image)、[任务与轮询](https://ai.cangyuansuanli.cn/docs/tasks)。

### 9.2 最小接入边界

- 文生图使用 `/v1/images/generations`，有参考图时使用 `/v1/images/edits`；查询使用相应路径加任务 ID。提交后先持久化 ID，恢复时不重新生成。
- 每个作业仍只请求一张图片。仅提交所选模型文档明确允许的字段；不把 GrsAI 的 `shutProgress`、`webHook`、`urls` 传给沧元。
- 普通 `gpt-image-2` 在 UI 显示默认尺寸（内部 `standard`）；分档模型分别为 `gpt-image-2-1k`、`gpt-image-2-2k`、`gpt-image-2-4k`，各自只提供对应分辨率。首期均为16:9，提交 `size: "16:9"`，不自行推导返回像素。
- 每次提交的固定字段为 `n: 1`、`response_format: "url"`、`async: true`；参考图通过 `images` 数组传入。任务 ID 接受 `id` 或 `task_id`。识别 `queued` / `in_progress`，成功状态 `completed` / `succeeded` / `success`，失败状态 `failed` / `cancelled` / `error`。
- 文档还列出了 Nano Banana 系列，本轮不将它们纳入模型列表。
- 账号可用模型、实际并发、实际返回尺寸与结果有效期均未实测；不把公开目录等同于当前 Key 的权限。

来源：[普通 GPT Image 2](https://ai.cangyuansuanli.cn/docs/models/gpt-image-2)、[1K](https://ai.cangyuansuanli.cn/docs/models/gpt-image-2-1k)、[2K](https://ai.cangyuansuanli.cn/docs/models/gpt-image-2-2k)、[4K](https://ai.cangyuansuanli.cn/docs/models/gpt-image-2-4k)、[Nano Banana 2](https://ai.cangyuansuanli.cn/docs/models/nano-banana2-1k)。

### 9.3 本机参考图上传与 HTTPS 地址

当前工具的参考图和定稿图保存在本机。沧元模型文档只接受可读取的 HTTPS 参考图地址，未承诺接受本地文件或 Base64；其 `/v1/files` 明确未实现。无文字版本属于图生图，受同一限制。

上传方式已从[官方画布部署客户端](https://canvas.cangyuansuanli.cn/_next/static/chunks/0yfd8o.5jeqqk.js)和[公开上传策略](https://canvas.cangyuansuanli.cn/api/media/references)补齐：

1. `POST https://canvas.cangyuansuanli.cn/api/media/references`，JSON 为 `{mimeType, bytes}`，不发送 API Key、Cookie 或图片内容。公开客户端和匿名元数据探测均证实该方式。
2. 读取顶层 `uploadUrl`、`url`、`contentType`、`expiresAt`。向预签名 `uploadUrl` 发起原始图片字节 `PUT`，仅带 `Content-Type`，不添加 provider Key 或返回的 token。
3. 将结果 `url` 原样放入图片编辑请求的 `images`。上传和结果地址要求 HTTPS；创建和查询 API 不跟随重定向。
4. 单图上限100 MiB，最多9张参考图。公开策略保留2小时；缓存以 provider ID、revision 和本地图 ID 隔离，合并同图并发上传，在到期前60秒失效。恢复远程任务时不重新上传。
5. 上传失败发生在正式生成提交之前；预签名地址或 token 不进入日志。测试覆盖上传请求、失败、缓存隔离、并发和过期，实际 PUT 和真实生成尚未执行。

此上传端点属于官方画布部署实现，并非已承诺版本兼容的 `/v1` API。未来如平台改变上传方式，应对照公开客户端更新适配器，不引入未经确认的第三方图床。

Base URL 使用 `https://ai.cangyuansuanli.cn`。官方公开 `/api/status` 声明此地址，匿名 `/v1/models` 正常返回401鉴权响应；账号认证和付费生成尚未实测。设置中也接受以 `/v1` 结尾的地址，不能填 `/docs`。

来源：[账户与素材](https://ai.cangyuansuanli.cn/docs/assets)、[FAQ](https://ai.cangyuansuanli.cn/docs/faq)。

### 9.4 本轮交接

新增 `server/src/providers/cangyuan-images-adapter.ts` 和对应测试；两种协议共用的课件模拟验收位于 `server/tests/new-provider-workflow.test.ts`。设置保存、重读、掩码和前端选项使用已有测试文件补充验证。

公开证据保存在主目录忽略的 `app-data/cangyuan-research-findings-2026-09-11.json`、`cangyuan-research-summary-2026-09-11.json`、`cangyuan-research-presign-metadata-probe-2026-09-11.json`；只记录安全字段和主机名，不记录签名参数或 token。下一步以 `WORKLOG.md` 最新交付记录为准；不修改实际中转站配置，不自动切换角色，不提交 GitHub。

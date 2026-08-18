# Provider Protocol Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every image output through the currently selected text-to-image or image-to-image provider, support both ToAPIs and YM2 protocols, and track/retry each output image independently without duplicate billing.

**Architecture:** Add one persistent `generation_jobs` row per requested output and dispatch those rows through a provider-aware scheduler. A protocol-adapter registry owns capabilities, payloads, remote recovery, and size conversion; provider settings select independent text/image roles and expose the `.env` ToAPIs configuration as an explicit read-only provider. Tasks remain editor-row aggregates, while generation jobs carry provider affinity after submission and drive job-level monitoring and partial retries.

**Tech Stack:** Node.js 24, TypeScript, Fastify, better-sqlite3, Zod, Vitest, React 19, Testing Library, Vite.

---

## File and Responsibility Map

### New backend files

- `server/src/db/repositories/generation-jobs-repository.ts`: generation-job creation, state transitions, retry queries, provider dependency checks, and batch/task aggregation inputs.
- `server/src/providers/provider-adapter.ts`: shared protocol, provider, request, result, recovery, and error types.
- `server/src/providers/provider-adapter-registry.ts`: explicit `protocolType` to adapter lookup; no URL inference.
- `server/src/providers/toapis-async-adapter.ts`: existing ToAPIs upload/create/poll/download behavior, constrained to one output per job.
- `server/src/providers/ym2-openai-images-adapter.ts`: YM2 JSON generation, multipart edit, 429 retry, and synchronous response normalization.
- `server/src/lib/image-dimensions.ts`: dependency-free PNG/JPEG dimension inspection.
- `server/src/services/provider-job-scheduler.ts`: queue with a shared concurrency lane per provider ID.

### Modified backend files

- `server/src/db/schema.sql`, `server/src/db/database.ts`: additive `generation_jobs` table and startup migration verification.
- `server/src/services/provider-settings-service.ts`, `server/src/routes/provider-settings-routes.ts`: protocols, concurrency, two roles, explicit environment provider, safe revision edits.
- `server/src/services/reference-image-service.ts`: provide local reference bytes and retain ToAPIs provider-scoped upload caching.
- `server/src/services/batch-service.ts`: create/dispatch/aggregate jobs, role routing, remote recovery, partial retry, and job-level API data.
- `server/src/routes/batch-routes.ts`, `server/src/routes/settings-routes.ts`: unknown-charge confirmation and role-specific capabilities.
- `server/src/lib/file-storage.ts`: deterministic output-index writes for independently completing jobs.

### Modified frontend files

- `web/src/lib/provider-settings-api.ts`, `web/src/settings-page.tsx`: protocol/concurrency fields and text/image role selectors.
- `web/src/lib/types.ts`, `web/src/lib/model-options.ts`: job records and role-specific model capabilities.
- `web/src/App.tsx`, `web/src/components/tasks/defaults-bar.tsx`, `web/src/components/tasks/task-row.tsx`, `web/src/components/tasks/task-table.tsx`: provider-aware choices and unsupported-selection blocking.
- `web/src/components/history/history-card.tsx`, `web/src/components/monitor/run-summary.tsx`: per-image provider/status/error display and job counts.
- `web/src/lib/api.ts`: retry confirmation flag and expanded settings/batch response types.
- `web/src/styles.css`: minimal role/provider/job status styling.

The feature is one plan rather than separate backend/frontend plans because the settings schema, adapter capabilities, queue identity, and editor validation form one versioned API contract. No intermediate commit should route production work through the new scheduler until its persistent job and provider-setting dependencies already pass tests.

---

### Task 1: Add Persistent Per-Image Generation Jobs

**Files:**
- Modify: `server/src/db/schema.sql`
- Modify: `server/src/db/database.ts`
- Create: `server/src/db/repositories/generation-jobs-repository.ts`
- Create: `server/tests/generation-jobs-repository.test.ts`
- Modify: `server/tests/database-migration-concurrency.test.ts`

- [ ] **Step 1: Write failing repository and migration tests**

Create a test that opens an in-memory database, inserts one batch and task through existing repositories, creates three jobs, and checks uniqueness, ordering, state updates, and dependency detection:

```ts
const jobs = repository.createForTask({
  taskId: task.id,
  count: 3,
  mode: "text"
});

expect(jobs.map((job) => job.output_index)).toEqual([1, 2, 3]);
expect(() => repository.createForTask({ taskId: task.id, count: 1, mode: "text" }))
  .toThrow(/unique/i);

repository.bindProvider(jobs[0].id, {
  providerId: "provider-a",
  providerRevision: "revision-a",
  protocolType: "toapis-async",
  requestedSize: "1280x720"
});
repository.updateState(jobs[0].id, {
  status: "remote_queued",
  remoteTaskId: "remote-1"
});

expect(repository.hasProviderRevisionDependency("provider-a", "revision-a")).toBe(true);
expect(repository.listByTaskId(task.id)[0]).toMatchObject({
  provider_id: "provider-a",
  remote_task_id: "remote-1",
  status: "remote_queued"
});
```

Extend the legacy migration test to create a database containing only the existing four tables, call `createDatabase(filename)` from two concurrent app instances, then assert `generation_jobs` exists once and the old task/image row counts are unchanged.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npm run test -w server -- generation-jobs-repository.test.ts database-migration-concurrency.test.ts
```

Expected: FAIL because the table and repository do not exist.

- [ ] **Step 3: Add the additive table and indexes**

Append this schema without changing existing rows or columns:

```sql
create table if not exists generation_jobs (
  id text primary key,
  task_id text not null,
  output_index integer not null,
  mode text not null,
  status text not null,
  provider_id text,
  provider_revision text,
  protocol_type text,
  remote_task_id text,
  remote_result_url text,
  requested_size text,
  attempt_count integer not null default 0,
  actual_width integer,
  actual_height integer,
  error_stage text,
  error_message text,
  created_at text not null,
  updated_at text not null,
  unique (task_id, output_index),
  foreign key (task_id) references tasks(id) on delete cascade
);

create index if not exists generation_jobs_task_status_idx
  on generation_jobs(task_id, status);

create index if not exists generation_jobs_provider_revision_idx
  on generation_jobs(provider_id, provider_revision, status);
```

`schema.sql` already runs before `ensureTaskColumns`, so legacy databases receive this table through the existing exclusive startup path; do not rebuild or copy old tables.

- [ ] **Step 4: Implement the repository with explicit patches**

Export these types and methods:

```ts
export type GenerationJobStatus =
  | "queued"
  | "submitting"
  | "remote_queued"
  | "downloading"
  | "completed"
  | "failed"
  | "unknown";

export type GenerationJobPatch = {
  status?: GenerationJobStatus;
  remoteTaskId?: string | null;
  remoteResultUrl?: string | null;
  actualWidth?: number | null;
  actualHeight?: number | null;
  errorStage?: string | null;
  errorMessage?: string | null;
};

export type GenerationJobRecord = {
  id: string;
  task_id: string;
  output_index: number;
  mode: "text" | "image";
  status: GenerationJobStatus;
  provider_id: string | null;
  provider_revision: string | null;
  protocol_type: string | null;
  remote_task_id: string | null;
  remote_result_url: string | null;
  requested_size: string | null;
  attempt_count: number;
  actual_width: number | null;
  actual_height: number | null;
  error_stage: string | null;
  error_message: string | null;
};
```

Implement `createForTask`, `createMissingForLegacyTask`, `getById`, `listByTaskId`, `listByBatchId` (join through `tasks`), `listByTaskIds`, `bindProvider`, `clearProviderBinding`, `startAttempt`, `updateState`, and `hasProviderRevisionDependency`. `startAttempt` atomically increments `attempt_count` and returns the new value. Dependency statuses are exactly `submitting`, `remote_queued`, `downloading`, and `unknown`, plus `failed` rows that still contain a `remote_task_id` or `remote_result_url`.

Use `Object.prototype.hasOwnProperty.call(patch, key)` for nullable patch fields so clearing a remote reference is different from leaving it unchanged. `createForTask` must insert all requested indexes in one database transaction.

- [ ] **Step 5: Run the tests and verify GREEN**

Run:

```powershell
npm run test -w server -- generation-jobs-repository.test.ts database-migration-concurrency.test.ts repositories.test.ts
```

Expected: all three test files pass and legacy rows remain intact.

- [ ] **Step 6: Commit the job persistence layer**

```powershell
git add server/src/db/schema.sql server/src/db/database.ts server/src/db/repositories/generation-jobs-repository.ts server/tests/generation-jobs-repository.test.ts server/tests/database-migration-concurrency.test.ts
git commit -m "feat: persist per-image generation jobs"
```

---

### Task 2: Define the Adapter Contract and Image Validation

**Files:**
- Create: `server/src/providers/provider-adapter.ts`
- Create: `server/src/providers/provider-adapter-registry.ts`
- Create: `server/src/lib/image-dimensions.ts`
- Create: `server/tests/provider-adapter-registry.test.ts`
- Create: `server/tests/image-dimensions.test.ts`

- [ ] **Step 1: Write failing contract-level tests**

Test that registry lookup is explicit and unknown protocols fail without consulting a URL:

```ts
const registry = new ProviderAdapterRegistry([toApisAdapter, ym2Adapter]);

expect(registry.require("toapis-async")).toBe(toApisAdapter);
expect(registry.require("ym2-openai-images")).toBe(ym2Adapter);
expect(() => registry.require("https://relay.example.com/v1"))
  .toThrow("不支持的中转站协议");
```

Use small generated PNG and JPEG fixtures to verify `readImageDimensions` returns the dimensions and rejects arbitrary bytes.

- [ ] **Step 2: Run the tests and verify RED**

```powershell
npm run test -w server -- provider-adapter-registry.test.ts image-dimensions.test.ts
```

Expected: FAIL because the contract, registry, and parser do not exist.

- [ ] **Step 3: Create the shared protocol types**

Use this public boundary; adapters must not import repositories or Fastify types:

```ts
export type ProtocolType = "toapis-async" | "ym2-openai-images";
export type GenerationMode = "text" | "image";

export type ProviderRuntimeConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocolType: ProtocolType;
  configRevision: string;
  maxConcurrency: number;
};

export type ReferenceAsset = {
  id: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

export type AdapterGenerationRequest = {
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  references: ReferenceAsset[];
};

export type AdapterRemoteReference = {
  taskId?: string;
  resultUrl?: string;
};

export type AdapterGeneratedImage = {
  buffer: Buffer;
  mimeType: string;
};

export type AdapterResolvedRequest = {
  requestSize: string;
  expectedDimensions?: { width: number; height: number };
};

export type AdapterModelCapability = {
  value: string;
  label: string;
  aspectRatios: string[];
  resolutions: string[];
  supportedResolutionsByAspectRatio?: Record<string, string[]>;
  maxN: number;
  supportsReferenceImages: boolean;
};

export interface ProviderAdapter {
  readonly protocolType: ProtocolType;
  capabilities(mode: GenerationMode): AdapterModelCapability[];
  resolveRequest(request: AdapterGenerationRequest): AdapterResolvedRequest;
  generate(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage>;
  recover(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    remote: AdapterRemoteReference,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage>;
}

export class UnknownSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownSubmissionError";
  }
}
```

The registry stores adapters in a `Map<ProtocolType, ProviderAdapter>` and throws `不支持的中转站协议：${value}` when lookup fails.

- [ ] **Step 4: Implement PNG/JPEG inspection**

Use deterministic header parsing and no new dependency:

```ts
export function readImageDimensions(buffer: Buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }

  throw new Error("无法识别返回图片尺寸");
}
```

- [ ] **Step 5: Run tests and commit the contract**

```powershell
npm run test -w server -- provider-adapter-registry.test.ts image-dimensions.test.ts
git add server/src/providers/provider-adapter.ts server/src/providers/provider-adapter-registry.ts server/src/lib/image-dimensions.ts server/tests/provider-adapter-registry.test.ts server/tests/image-dimensions.test.ts
git commit -m "feat: define image provider adapter contract"
```

Expected: both test files pass.

---

### Task 3: Upgrade Provider Settings to Protocols, Roles, and Revisions

**Files:**
- Modify: `server/src/services/provider-settings-service.ts`
- Modify: `server/src/routes/provider-settings-routes.ts`
- Modify: `server/src/services/batch-service.ts`
- Modify: `server/tests/provider-settings-service.test.ts`
- Modify: `server/tests/provider-settings-routes.test.ts`

- [ ] **Step 1: Replace old activation tests with failing role tests**

Cover these exact behaviors:

```ts
const created = service.saveProvider({
  name: "YM2",
  baseUrl: "https://relay.example.com/v1",
  apiKey: "secret-key",
  protocolType: "ym2-openai-images",
  maxConcurrency: 100,
  notes: ""
});

service.setRoleProvider("text", created.id);
service.setRoleProvider("image", "env:toapis");

expect(service.getPublicState()).toMatchObject({
  activeTextProviderId: created.id,
  activeImageProviderId: "env:toapis",
  providers: expect.arrayContaining([
    expect.objectContaining({ id: created.id, protocolType: "ym2-openai-images", maxConcurrency: 100 }),
    expect.objectContaining({ id: "env:toapis", readonly: true, protocolType: "toapis-async" })
  ])
});
```

Also assert:

- switching either role succeeds while jobs are busy;
- changing only name, notes, or `maxConcurrency` preserves `configRevision`;
- changing Base URL, key, or protocol rotates `configRevision`;
- a callback-reported dependency blocks only the unsafe revision-changing edit with HTTP 409;
- persisted legacy `{ activeProviderId, providers }` normalizes to two roles; legacy providers become `protocolType: "unconfigured"` until edited;
- a legacy null active ID normalizes both roles to `env:toapis`;
- public JSON never contains the environment or stored full key.

- [ ] **Step 2: Run provider-setting tests and verify RED**

```powershell
npm run test -w server -- provider-settings-service.test.ts provider-settings-routes.test.ts
```

Expected: FAIL on missing protocol, concurrency, roles, and environment provider.

- [ ] **Step 3: Implement the normalized storage model**

Use these stored fields:

```ts
export type StoredProviderSettings = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocolType: ProtocolType | "unconfigured";
  maxConcurrency: number;
  configRevision: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type ProviderSettingsFile = {
  activeTextProviderId: string;
  activeImageProviderId: string;
  providers: StoredProviderSettings[];
};
```

Construct the service with explicit environment and dependency inputs:

```ts
new ProviderSettingsService(appDataDir, {
  environment: {
    id: "env:toapis",
    name: "环境默认 ToAPIs",
    baseUrl: "https://toapis.com/v1",
    apiKey: env.toapisApiKey,
    protocolType: "toapis-async",
    maxConcurrency: env.maxConcurrency,
    configRevision: `env:toapis:${createHash("sha256").update(env.toapisApiKey).digest("hex").slice(0, 16)}`
  },
  hasRevisionDependency: (providerId, revision) =>
    generationJobsRepository.hasProviderRevisionDependency(providerId, revision),
  protocolCapabilities: (protocolType) => {
    if (protocolType === "unconfigured") return { text: false, image: false };
    const adapter = adapterRegistry.require(protocolType);
    return {
      text: adapter.capabilities("text").length > 0,
      image: adapter.capabilities("image").length > 0
    };
  }
});
```

The environment provider is returned by `getConfiguredProvider`, participates in both role selectors, and is never written to `provider-settings.json`. Its revision is a one-way key fingerprint so a later local key change cannot reuse old remote work; no provider revision is returned to the browser. Generate a new stored-provider `configRevision` with `randomUUID()` only when Base URL, effective API key, or protocol changes. `getConfiguredProvider` rejects `unconfigured` records before dispatch.

- [ ] **Step 4: Replace activation with role-selection routes**

Extend create/update validation with:

```ts
protocolType: z.enum(["toapis-async", "ym2-openai-images"]),
maxConcurrency: z.coerce.number().int().min(1).max(100)
```

Register:

```ts
app.post("/api/provider-settings/roles/:role", async (request, reply) => {
  try {
    const { role } = z.object({ role: z.enum(["text", "image"]) }).parse(request.params);
    const { providerId } = z.object({ providerId: z.string().min(1) }).parse(request.body);
    return providerSettingsService.setRoleProvider(role, providerId);
  } catch (error) {
    return handleError(reply, error);
  }
});
```

Remove the old `/:providerId/activate` route after its tests and frontend callers are replaced in the same feature branch.

- [ ] **Step 5: Run tests and commit settings v2**

```powershell
npm run test -w server -- provider-settings-service.test.ts provider-settings-routes.test.ts
git add server/src/services/provider-settings-service.ts server/src/routes/provider-settings-routes.ts server/src/services/batch-service.ts server/tests/provider-settings-service.test.ts server/tests/provider-settings-routes.test.ts
git commit -m "feat: add provider protocols and generation roles"
```

Expected: role switching works during activity, unsafe edits return 409, and keys remain masked.

---

### Task 4: Wrap the Existing ToAPIs Protocol in an Adapter

**Files:**
- Create: `server/src/providers/toapis-async-adapter.ts`
- Modify: `server/src/services/reference-image-service.ts`
- Modify: `server/src/services/toapis-client.ts`
- Create: `server/tests/toapis-async-adapter.test.ts`
- Modify: `server/tests/reference-image-provider-cache.test.ts`

- [ ] **Step 1: Write failing one-output and recovery tests**

With a fake `ToApisClient`, verify a text request sends `n: 1` even when its parent task requested three images, and verify the remote ID callback occurs before polling:

```ts
expect(client.createImageTask).toHaveBeenCalledWith(expect.objectContaining({
  prompt: "wide slide",
  model: "gpt-image-2",
  size: "16:9",
  n: 1
}));
expect(events).toEqual(["remote:task-1", "poll:task-1", "download"]);
```

Add cases for:

- reference upload using provider/revision-scoped cache and `image_urls`;
- direct `data[].url` recording `resultUrl` before download;
- `data[].b64_json` returning bytes without polling;
- `recover({ taskId })` polling without creation;
- `recover({ resultUrl })` downloading without creation.

- [ ] **Step 2: Run adapter tests and verify RED**

```powershell
npm run test -w server -- toapis-async-adapter.test.ts reference-image-provider-cache.test.ts
```

Expected: FAIL because ToAPIs is still called directly by `BatchService`.

- [ ] **Step 3: Make local references available to adapters**

Add this method without changing upload persistence:

```ts
getLocalAsset(referenceImageId: string): ReferenceAsset {
  const record = this.requireReference(referenceImageId);
  return {
    id: record.id,
    filename: record.filename || basename(record.local_path),
    mimeType: record.mime_type,
    buffer: this.fileStorage.readFile(record.local_path)
  };
}
```

Keep `ensureRemoteUrl`, but type its uploader structurally instead of importing `ToApisClient`:

```ts
type ReferenceUploader = {
  uploadReferenceImage(input: { filename: string; mimeType: string; buffer: Buffer }): Promise<string>;
};
```

- [ ] **Step 4: Implement `ToApisAsyncAdapter`**

Inject a client factory and `ReferenceImageService`. Reuse `resolveTaskRequest`, `extractImageTaskId`, `extractFirstImageUrl`, and `pollRemoteImageTask`. The creation payload must always use `n: 1`.

Before any poll or download, persist the recoverable reference through the callback. Prefer a direct image result over a simultaneously returned task ID, matching the current production behavior:

```ts
const directUrl = extractFirstImageUrl(created);
if (directUrl) {
  if (directUrl.startsWith("http")) onRemoteReference({ resultUrl: directUrl });
  return this.downloadSource(client, directUrl);
}

const remoteTaskId = extractImageTaskId(created);
if (!remoteTaskId) throw new Error("创建任务响应缺少任务 ID 或图片结果");
onRemoteReference({ taskId: remoteTaskId });
return this.pollAndDownload(client, remoteTaskId);
```

For data URLs, decode locally and do not store them as `remote_result_url`. `resolveRequest()` returns the existing ToAPIs request `size` as `requestSize` and leaves `expectedDimensions` undefined because the ratio/metadata protocol does not promise one exact pixel result. `capabilities()` returns current `modelCapabilities`, with `maxN` retained as the editor row count limit; per-call count stays one.

- [ ] **Step 5: Run tests and commit the adapter**

```powershell
npm run test -w server -- toapis-async-adapter.test.ts reference-image-provider-cache.test.ts model-capabilities.test.ts polling.test.ts
git add server/src/providers/toapis-async-adapter.ts server/src/services/reference-image-service.ts server/src/services/toapis-client.ts server/tests/toapis-async-adapter.test.ts server/tests/reference-image-provider-cache.test.ts
git commit -m "refactor: isolate ToAPIs generation protocol"
```

Expected: existing ToAPIs request mapping and recovery tests pass with one output per call.

---

### Task 5: Implement the YM2 OpenAI Images Adapter

**Files:**
- Create: `server/src/providers/ym2-openai-images-adapter.ts`
- Create: `server/tests/ym2-openai-images-adapter.test.ts`
- Modify: `server/src/providers/provider-adapter-registry.ts`

- [ ] **Step 1: Write exact failing request/response tests**

Mock `fetch` and assert text-to-image sends:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  "https://yyds.example/v1/images/generations",
  expect.objectContaining({
    method: "POST",
    headers: expect.objectContaining({
      "Content-Type": "application/json",
      Authorization: "Bearer ym2-secret"
    })
  })
);
expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
  model: "gpt-image-2",
  prompt: "16:9 classroom slide",
  size: "2048x1152",
  n: 1,
  response_format: "b64_json"
});
```

For image-to-image, inspect the `FormData` entries and assert `/images/edits`, repeated `image` fields, `size=2048x1152`, and no `/uploads/images` request. Add tests for 16:9 mappings `1280x720`, `2048x1152`, and `3840x2160`; unsupported ratios must throw before fetch.

Response/error tests must cover:

- decoding `data[0].b64_json`;
- downloading `data[0].url` after calling `onRemoteReference({ resultUrl })`;
- two 429 responses followed by success, respecting `Retry-After: 0` in tests;
- a 400 response producing an ordinary failure without retry;
- timeout, network rejection, ambiguous 500, and malformed 2xx response producing `UnknownSubmissionError` without resubmission.

- [ ] **Step 2: Run the YM2 tests and verify RED**

```powershell
npm run test -w server -- ym2-openai-images-adapter.test.ts
```

Expected: FAIL because the YM2 adapter does not exist.

- [ ] **Step 3: Implement explicit YM2 capabilities and sizes**

Initially expose the verified PPT combinations only:

```ts
const ym2Sizes = {
  "16:9": {
    "1K": "1280x720",
    "2K": "2048x1152",
    "4K": "3840x2160"
  }
} as const;
```

Return one `gpt-image-2` capability for both modes with `aspectRatios: ["16:9"]`, `resolutions: ["1K", "2K", "4K"]`, `maxN: 10`, and reference support. The existing row-count ceiling remains 10; provider concurrency may be 100. Every HTTP payload still uses `n: 1`.

`resolveRequest()` returns both the pixel string and parsed expected dimensions, for example `{ requestSize: "2048x1152", expectedDimensions: { width: 2048, height: 1152 } }`.

- [ ] **Step 4: Implement request and billing-safe error handling**

Use `new URL("images/generations", ensureTrailingSlash(provider.baseUrl))` and the equivalent `images/edits` path so a configured `/v1` base remains intact. Use an injected `fetchImpl` and a 300-second `AbortSignal.timeout` in production.

429 retry is exactly three total attempts with `Retry-After` when present, otherwise 1s then 2s. Never retry other statuses automatically. Wrap network errors, aborts, HTTP 5xx, and unparseable successful responses as `UnknownSubmissionError`; wrap deterministic 4xx errors as ordinary `Error` with status and a response excerpt capped at 500 characters.

Build edit forms as:

```ts
const form = new FormData();
form.append("model", request.model);
form.append("prompt", request.prompt);
form.append("size", size);
form.append("n", "1");
form.append("response_format", "b64_json");
for (const reference of request.references) {
  form.append("image", new Blob([new Uint8Array(reference.buffer)], { type: reference.mimeType }), reference.filename);
}
```

Do not set a multipart `Content-Type` header manually.

- [ ] **Step 5: Register YM2 and run tests**

```powershell
npm run test -w server -- ym2-openai-images-adapter.test.ts provider-adapter-registry.test.ts
git add server/src/providers/ym2-openai-images-adapter.ts server/src/providers/provider-adapter-registry.ts server/tests/ym2-openai-images-adapter.test.ts
git commit -m "feat: add YM2 image protocol adapter"
```

Expected: all payload, mapping, retry, and unknown-state tests pass without network access.

---

### Task 6: Replace Global Concurrency with Provider Lanes

**Files:**
- Create: `server/src/services/provider-job-scheduler.ts`
- Create: `server/tests/provider-job-scheduler.test.ts`

- [ ] **Step 1: Write failing provider-lane tests**

Use deferred promises to prove:

```ts
// provider-a limit 2, provider-b limit 1
scheduler.enqueue("a-1");
scheduler.enqueue("a-2");
scheduler.enqueue("a-3");
scheduler.enqueue("b-1");
scheduler.enqueue("b-2");

expect(started).toEqual(expect.arrayContaining(["a-1", "a-2", "b-1"]));
expect(started).not.toContain("a-3");
expect(started).not.toContain("b-2");
```

Add tests that:

- both roles mapped to the same provider share one lane;
- different providers run independently;
- a queued job's lane is resolved only when it is about to start, so changing its role selection changes its provider;
- an old remote recovery job resolves its recorded provider lane;
- a blocked queue head does not prevent a later job for another provider from starting;
- pause stops new starts but does not interrupt running work;
- stats and `onIdle` retain current behavior.

- [ ] **Step 2: Run scheduler tests and verify RED**

```powershell
npm run test -w server -- provider-job-scheduler.test.ts
```

Expected: new tests fail because the current scheduler has one fixed global limit.

- [ ] **Step 3: Implement provider-aware scanning**

Use this boundary:

```ts
type ProviderLane = { providerId: string; maxConcurrency: number };

type ProviderJobSchedulerOptions = {
  resolveLane: (jobId: string) => ProviderLane;
  runJob: (jobId: string, lane: ProviderLane) => Promise<{ outcome: "completed" | "failed" }>;
};
```

Track `runningJobs: Map<string, string>` and `runningByProvider: Map<string, number>`. In `fillSlots`, scan the full queued array and start the first runnable job; restart scanning after each start and stop only when one full pass starts nothing. Validate `maxConcurrency` as an integer from 1 through 100.

Do not change `queue-scheduler.ts` in this task. `BatchService` switches to the new class in Task 7, after the new scheduler passes in isolation.

- [ ] **Step 4: Run tests and commit scheduler lanes**

```powershell
npm run test -w server -- provider-job-scheduler.test.ts queue-scheduler.test.ts
git add server/src/services/provider-job-scheduler.ts server/tests/provider-job-scheduler.test.ts
git commit -m "feat: schedule generation jobs per provider"
```

Expected: lane limits, fairness, pause, stats, and idle behavior pass.

---

### Task 7: Route and Execute Jobs in `BatchService`

**Files:**
- Modify: `server/src/services/batch-service.ts`
- Modify: `server/src/db/repositories/tasks-repository.ts`
- Modify: `server/src/lib/file-storage.ts`
- Modify: `server/src/routes/batch-routes.ts`
- Replace assertions in: `server/tests/provider-selection.test.ts`
- Create: `server/tests/generation-job-routing.test.ts`
- Create: `server/tests/generation-job-retry.test.ts`
- Modify: `server/tests/batch-routes.test.ts`
- Modify: `server/tests/timeout-retry.test.ts`

- [ ] **Step 1: Write failing role-routing and per-image tests**

Build fake adapters through `BatchServiceOptions.adapterRegistry` and assert:

- a task with no reference creates `n` text jobs and uses the active text provider;
- row/global/root references and child tasks create image jobs and use the active image provider;
- switching text or image providers after enqueue but before dispatch changes unsent jobs only;
- three requested images execute three one-output adapter calls and persist three images;
- text and image roles using the same provider share its scheduler limit;
- 16:9 2K YM2 binds `requested_size: "2048x1152"`;
- a returned 1024x1536 image is saved locally but its job is failed at `validation` with actual dimensions;
- an adapter `UnknownSubmissionError` produces job status `unknown` and no automatic second call;
- a ToAPIs remote ID is persisted before polling and is reused after restart/retry through its original provider revision.

Use a valid in-memory 1x1/size-specific PNG helper rather than arbitrary bytes so dimension validation is exercised.

- [ ] **Step 2: Write failing partial and legacy retry tests**

Create three jobs, mark two completed and one failed, call `retryTasks([taskId])`, and assert only the failed job is queued. For an unknown job, assert the first retry response throws `BatchServiceError(409, "UNKNOWN_CHARGE_RISK", message)`; then call with `{ confirmUnknown: true }` and assert one new generation is queued with provider/remote fields cleared.

Create a legacy failed task with `n=3`, two existing images, and no job rows. Retry it and assert exactly output index 3 is created. For a legacy async `remote_task_id`, copy the original batch snapshot provider/revision into that one missing job so recovery does not bill a second request.

- [ ] **Step 3: Run the focused tests and verify RED**

```powershell
npm run test -w server -- generation-job-routing.test.ts generation-job-retry.test.ts provider-selection.test.ts timeout-retry.test.ts
```

Expected: FAIL because production execution is still task- and batch-bound.

- [ ] **Step 4: Create jobs transactionally with tasks**

After `tasksRepository.createMany`, create exactly `task.n` jobs for each task and enqueue job IDs, not task IDs. Determine mode with `Boolean(referenceImageId)`. Apply the same logic to child creation, forcing `mode: "image"` and returning the batch to `running` while those jobs are active.

Keep task `n` as the requested aggregate count. Remove provider ID/revision from new batch snapshots; retain old snapshot parsing only in `createMissingLegacyJobs`.

- [ ] **Step 5: Bind a provider at actual dispatch**

Import and construct `ProviderJobScheduler`, leaving the old scheduler file untouched. Implement one synchronous resolver used by both scheduler lane selection and execution:

```ts
private resolveDispatch(job: GenerationJobRecord) {
  if ((job.remote_task_id || job.remote_result_url) && job.provider_id && job.provider_revision) {
    const recorded = this.providerSettingsService.getConfiguredProvider(job.provider_id);
    if (recorded.configRevision === job.provider_revision) return recorded;
  }

  return this.providerSettingsService.getRoleProvider(job.mode);
}
```

Before the adapter call, validate its capability, call `adapter.resolveRequest`, increment `attempt_count`, and persist provider ID, `configRevision`, protocol, and `resolved.requestSize` in one job update. If the job is a genuine new request, clear stale remote references before binding. Do not read provider selection from the parent batch.

- [ ] **Step 6: Execute, validate, and aggregate one job**

Replace `runTask` with `runGenerationJob`. Pass a callback that immediately stores task ID/result URL. On success:

1. inspect dimensions when possible;
2. write the image using `output_index` and `attempt_count`;
3. create the existing `generated_images` row;
4. record actual dimensions;
5. when `resolved.expectedDimensions` exists, fail validation if dimensions cannot be read or do not equal it; otherwise record readable actual dimensions and accept the adapter result.

Change `FileStorage.writeGeneratedImage` to honor a unique filename instead of always deriving the path from task/index:

```ts
const extension = image.mimeType === "image/jpeg"
  ? ".jpg"
  : image.mimeType === "image/webp"
    ? ".webp"
    : ".png";
const filename = `${task.id}-${job.output_index}-attempt-${attemptCount}${extension}`;
const localPath = this.fileStorage.writeGeneratedImage(task.batch_id, filename, image.buffer);
```

The storage method resolves that filename only inside the batch image directory. This keeps a dimension-mismatched result available after a later manual retry rather than overwriting it.

If dimensions differ, retain the image and set:

```ts
{
  status: "failed",
  actualWidth: dimensions.width,
  actualHeight: dimensions.height,
  errorStage: "validation",
  errorMessage: `返回尺寸 ${dimensions.width}x${dimensions.height}，预期 ${expected.width}x${expected.height}`
}
```

Catch `UnknownSubmissionError` as `unknown`; all other exceptions become `failed` with stage `submission`, `polling`, `download`, or `validation` assigned at the call site.

Derive task state after every job transition: any active job keeps the task active; all completed means completed; terminal jobs containing failed/unknown mean failed. Batch task totals remain task-level, while `getBatch().scheduler` returns job-level queued/running/completed/failed/unknown counts for that batch.

- [ ] **Step 7: Implement missing-only retry and warning contract**

Add a route-safe error type and change the method signature to:

```ts
export class BatchServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "BatchServiceError";
  }
}

retryTasks(taskIds: string[], options: { confirmUnknown?: boolean } = {})
```

Completed jobs are never reset. Recoverable async jobs retain provider binding and remote references. Ordinary failed jobs clear bindings and use the current role provider. Unknown jobs require confirmation, then clear bindings and remote references because the user has accepted the duplicate-charge risk.

Update the route body to `{ taskIds: string[]; confirmUnknown?: boolean }`. Catch `BatchServiceError` and return `{ code, message }` with its status; other errors retain the existing error path. Return `{ retriedJobs, affectedTasks }` on success.

- [ ] **Step 8: Run backend integration tests and commit execution**

```powershell
npm run test -w server -- generation-job-routing.test.ts generation-job-retry.test.ts provider-selection.test.ts batch-routes.test.ts timeout-retry.test.ts polling.test.ts reference-image-provider-cache.test.ts
git add server/src/services/batch-service.ts server/src/db/repositories/tasks-repository.ts server/src/lib/file-storage.ts server/src/routes/batch-routes.ts server/tests/generation-job-routing.test.ts server/tests/generation-job-retry.test.ts server/tests/provider-selection.test.ts server/tests/batch-routes.test.ts server/tests/timeout-retry.test.ts
git commit -m "feat: route and retry per-image generation jobs"
```

Expected: all production routing, partial retry, unknown-state, reference, timeout, and polling tests pass with no real provider calls.

---

### Task 8: Return Role Capabilities and Enforce Them in the Editor

**Files:**
- Modify: `server/src/services/batch-service.ts`
- Modify: `server/src/routes/settings-routes.ts`
- Modify: `server/tests/settings-routes.test.ts`
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/model-options.ts`
- Modify: `web/src/hooks/use-settings.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/tasks/defaults-bar.tsx`
- Modify: `web/src/components/tasks/task-row.tsx`
- Modify: `web/src/components/tasks/task-table.tsx`
- Modify: `web/src/tests/settings-defaults.test.ts`
- Modify: `web/src/tests/task-table.test.tsx`
- Modify: `web/src/tests/task-row-preview.test.tsx`

- [ ] **Step 1: Write failing API and editor tests**

Expect `/api/settings` to return:

```ts
{
  maxBatchSize: 100,
  roles: {
    text: { providerId: "ym2", providerName: "YM2", protocolType: "ym2-openai-images", models: [...] },
    image: { providerId: "env:toapis", providerName: "环境默认 ToAPIs", protocolType: "toapis-async", models: [...] }
  }
}
```

Frontend tests must verify:

- a no-reference row displays `文生图 · YM2` and YM2's 16:9 sizes;
- selecting row/global reference switches the displayed role to `图生图 · 环境默认 ToAPIs`;
- child drafts always use image-role models;
- switching role does not silently replace an unsupported current model/ratio/resolution;
- unsupported values display a specific reason and disable “生成这张图”/batch submission;
- explicitly selecting a supported model normalizes ratio and resolution using existing helpers;
- the count remains a row count up to adapter `maxN`, not a remote `n` value.

- [ ] **Step 2: Run settings/editor tests and verify RED**

```powershell
npm run test -w server -- settings-routes.test.ts
npm run test -w web -- settings-defaults.test.ts task-table.test.tsx task-row-preview.test.tsx
```

Expected: FAIL because settings expose one global model list.

- [ ] **Step 3: Publish role-specific settings**

Return this shape from `getSettings()`:

```ts
type RoleSettings = {
  providerId: string;
  providerName: string;
  protocolType: ProtocolType;
  models: AdapterModelCapability[];
};

return {
  maxBatchSize: this.env.maxBatchSize,
  roles: {
    text: this.getRoleSettings("text"),
    image: this.getRoleSettings("image")
  }
};
```

If a selected legacy provider is `unconfigured`, return HTTP 409 with `请先为“${name}”选择协议类型`; never substitute the environment provider.

- [ ] **Step 4: Add explicit frontend role helpers**

Define:

```ts
export type GenerationRole = "text" | "image";

export function roleForDraft(draft: TaskDraft, globalReferenceImageId: string | null): GenerationRole {
  const hasReference = draft.referenceMode === "row"
    ? Boolean(draft.referenceImageId)
    : draft.referenceMode === "global"
      ? Boolean(globalReferenceImageId)
      : false;
  return hasReference ? "image" : "text";
}

export function validateDraftForRole(draft: TaskDraft, role: RoleSettings) {
  const model = role.models.find((item) => item.value === draft.model);
  if (!model) return `当前${role.providerName}不支持模型 ${draft.model}`;
  if (!model.aspectRatios.includes(draft.aspectRatio)) return `当前${role.providerName}不支持比例 ${draft.aspectRatio}`;
  const resolutions = getResolutionsForAspectRatio(model, draft.aspectRatio);
  if (!resolutions.includes(draft.resolution)) return `当前${role.providerName}不支持 ${draft.aspectRatio} · ${draft.resolution}`;
  return null;
}
```

Show the current unsupported value as a disabled first option so the editor never hides or silently changes it. Only explicit model/ratio user changes may call normalization helpers.

- [ ] **Step 5: Run tests and commit role-aware editing**

```powershell
npm run test -w server -- settings-routes.test.ts
npm run test -w web -- settings-defaults.test.ts task-table.test.tsx task-row-preview.test.tsx submit-bar.test.tsx
git add server/src/services/batch-service.ts server/src/routes/settings-routes.ts server/tests/settings-routes.test.ts web/src/lib/types.ts web/src/lib/model-options.ts web/src/hooks/use-settings.ts web/src/App.tsx web/src/components/tasks/defaults-bar.tsx web/src/components/tasks/task-row.tsx web/src/components/tasks/task-table.tsx web/src/tests/settings-defaults.test.ts web/src/tests/task-table.test.tsx web/src/tests/task-row-preview.test.tsx
git commit -m "feat: apply provider capabilities in the editor"
```

Expected: role labels, option changes, and unsupported blocking pass.

---

### Task 9: Build the Two-Role Provider Settings UI

**Files:**
- Modify: `web/src/lib/provider-settings-api.ts`
- Modify: `web/src/settings-page.tsx`
- Modify: `web/src/tests/settings-page.test.tsx`
- Modify: `web/src/styles.css`

- [ ] **Step 1: Rewrite settings tests for the new public contract**

Use providers containing:

```ts
{
  id: "ym2",
  name: "YM2",
  baseUrl: "https://relay.example.com/v1",
  protocolType: "ym2-openai-images",
  maxConcurrency: 100,
  readonly: false,
  apiKeyMask: "****1234",
  hasApiKey: true,
  capabilities: { text: true, image: true }
}
```

Verify protocol and maximum-concurrency fields are submitted, keys remain masked, the environment provider cannot be edited, and each role selector posts independently to `/api/provider-settings/roles/text` or `/image`. Simulate queued/running work and confirm role switching still succeeds. Simulate an unsafe edit 409 and display its exact message.

- [ ] **Step 2: Run the page tests and verify RED**

```powershell
npm run test -w web -- settings-page.test.tsx
```

Expected: FAIL because the page still has one active-provider button.

- [ ] **Step 3: Update API types and calls**

Replace `activeProviderId`/`usingEnvFallback` with:

```ts
export type ProviderSettingsState = {
  activeTextProviderId: string;
  activeImageProviderId: string;
  providers: ProviderSetting[];
};

export function setRoleProvider(role: "text" | "image", providerId: string) {
  return providerFetch<ProviderSettingsState>(`/api/provider-settings/roles/${role}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId })
  });
}
```

Provider create/edit payloads include `protocolType` and numeric `maxConcurrency`.

- [ ] **Step 4: Render roles, protocol, concurrency, and capabilities**

At the top of the page render two labeled selects: `文生图中转站` and `图生图中转站`. Each provider card shows protocol label, shared concurrency, Base URL, masked key, and text/image capabilities. The form protocol options are exactly `ToAPIs 异步任务` and `YM2 OpenAI Images`; maximum concurrency uses `min=1`, `max=100`.

For `readonly: true`, hide edit controls and label it `来自 .env（只读）`. Remove all copy that describes `.env` as an automatic fallback.

- [ ] **Step 5: Run tests and commit settings UI**

```powershell
npm run test -w web -- settings-page.test.tsx lab-page.test.tsx
git add web/src/lib/provider-settings-api.ts web/src/settings-page.tsx web/src/tests/settings-page.test.tsx web/src/styles.css
git commit -m "feat: configure text and image relay roles"
```

Expected: both role selectors and provider form behavior pass without exposing keys.

---

### Task 10: Show Job-Level History, Monitoring, and Unknown-Retry Warning

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/components/history/history-card.tsx`
- Modify: `web/src/components/monitor/run-summary.tsx`
- Modify: `web/src/tests/history-card.test.tsx`
- Modify: `web/src/tests/run-summary.test.tsx`
- Modify: `web/src/tests/use-active-batch.test.tsx`

- [ ] **Step 1: Write failing display and warning tests**

Extend fixtures with `jobs` and assert history renders:

```tsx
expect(screen.getByText("图 2 · YM2 · ym2-openai-images")).toBeInTheDocument();
expect(screen.getByText("预期 2048x1152 · 返回 1024x1536")).toBeInTheDocument();
expect(screen.getByText("尺寸校验失败")).toBeInTheDocument();
```

Monitor tests include `unknown` and prove current-batch job counts replace scheduler lifetime totals. Retry tests mock a 409 body `{ code: "UNKNOWN_CHARGE_RISK", message: "..." }`, make `window.confirm` return true, and assert the second POST includes `confirmUnknown: true`. If confirmation is false, no second request is made.

- [ ] **Step 2: Run frontend tests and verify RED**

```powershell
npm run test -w web -- history-card.test.tsx run-summary.test.tsx use-active-batch.test.tsx
```

Expected: FAIL because job records and unknown status are not represented.

- [ ] **Step 3: Add job response types and retry negotiation**

Define:

```ts
export type GenerationJobRecord = {
  id: string;
  task_id: string;
  output_index: number;
  mode: "text" | "image";
  status: "queued" | "submitting" | "remote_queued" | "downloading" | "completed" | "failed" | "unknown";
  provider_id?: string | null;
  provider_name?: string | null;
  protocol_type?: string | null;
  requested_size?: string | null;
  actual_width?: number | null;
  actual_height?: number | null;
  error_stage?: string | null;
  error_message?: string | null;
};
```

Add `jobs` to active/history responses and `unknown` to scheduler counts. In `retryTasks`, parse structured error JSON; on `UNKNOWN_CHARGE_RISK`, confirm with `该请求状态未知，中转站可能已经扣费。仍要重新生成吗？` and repeat once with confirmation.

- [ ] **Step 4: Render concise per-image status**

Group jobs under their task. Translate stages as `提交失败`, `轮询失败`, `下载失败`, and `尺寸校验失败`. Show `尚未提交` for queued jobs without a provider. Show unknown separately from failed in the monitor:

```tsx
<strong>等待中 {props.queued}</strong>
<strong>运行中 {props.running}</strong>
<strong>成功 {props.completed}</strong>
<strong>失败 {props.failed}</strong>
<strong>状态未知 {props.unknown}</strong>
```

- [ ] **Step 5: Run tests and commit visibility/safety**

```powershell
npm run test -w web -- history-card.test.tsx run-summary.test.tsx use-active-batch.test.tsx app-history-restore.test.tsx
git add web/src/lib/types.ts web/src/lib/api.ts web/src/components/history/history-card.tsx web/src/components/monitor/run-summary.tsx web/src/tests/history-card.test.tsx web/src/tests/run-summary.test.tsx web/src/tests/use-active-batch.test.tsx
git commit -m "feat: expose image-job status and retry risk"
```

Expected: history, monitor, restore, and charge-warning flows pass.

---

### Task 11: Full Verification and Handoff

**Files:**
- Modify: `WORKLOG.md`

- [ ] **Step 1: Run the focused backend protocol/routing suite**

```powershell
npm run test -w server -- generation-jobs-repository.test.ts provider-adapter-registry.test.ts image-dimensions.test.ts toapis-async-adapter.test.ts ym2-openai-images-adapter.test.ts provider-job-scheduler.test.ts provider-settings-service.test.ts provider-settings-routes.test.ts generation-job-routing.test.ts generation-job-retry.test.ts timeout-retry.test.ts polling.test.ts
```

Expected: all protocol, persistence, routing, concurrency, retry, and billing-safety tests pass with fake clients only.

- [ ] **Step 2: Run the focused frontend suite**

```powershell
npm run test -w web -- settings-page.test.tsx settings-defaults.test.ts task-table.test.tsx task-row-preview.test.tsx history-card.test.tsx run-summary.test.tsx use-active-batch.test.tsx app-history-restore.test.tsx
```

Expected: role settings, editor constraints, monitor, history, retry warning, and restore tests pass.

- [ ] **Step 3: Run complete project verification**

```powershell
npm test
npm run build
git diff --check
```

Expected: every backend/frontend test passes, TypeScript and Vite builds succeed, and no whitespace errors are reported.

- [ ] **Step 4: Perform a local browser smoke test without submitting images**

Use the `webapp-testing` skill. Open `/settings` and `/` at 1440x900 and 390x844. Verify both role selectors, protocol/concurrency controls, read-only environment provider, role/provider row labels, and disabled unsupported selections. Confirm `document.documentElement.scrollWidth === window.innerWidth` on both pages. Do not click a generation button.

- [ ] **Step 5: Update the worklog with exact evidence**

Record the new table, adapter files, provider-role semantics, environment pseudo-provider, YM2 16:9 mapping, per-provider concurrency, partial retry, unknown-charge warning, exact test/build counts, and the fact that no real provider call was made. Include the remaining optional real-provider test as a separately approved action: one YM2 text request plus one YM2 image request.

- [ ] **Step 6: Commit verification documentation**

```powershell
git add WORKLOG.md
git commit -m "docs: record provider routing verification"
```

- [ ] **Step 7: Final repository audit**

```powershell
git status --short --branch
git log -12 --oneline --decorate
```

Expected: all feature and verification changes are committed. `.env`, `app-data/`, API keys, JWTs, databases, generated images, `node_modules`, and build output are absent from the diff. Do not push, deploy, modify `.env`, or run the two real YM2 requests without separate authorization.

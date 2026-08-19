# Yunfei Hybrid Image Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `img.yunfei.best` as a production provider for GPT Image 2, Nano Banana 2, and Nano Banana Pro, with provider-tier-aware 16:9 resolution choices, both text/image generation paths, safe synchronous retry semantics, and eight live compatibility checks after the user saves both keys locally.

**Architecture:** Add one `yunfei-hybrid-images` adapter that selects OpenAI Images endpoints for `gpt-image-2` and Gemini native `generateContent` endpoints for the two Banana models. Extend provider runtime settings with an optional tier that is mandatory only for Yunfei, make adapter capability and request resolution depend on the full provider configuration, and validate batch rows through the active role adapter instead of the global ToAPIs model table. Preserve the current one-output-per-job scheduler, local image persistence, dimension validation, role routing, and unknown-charge retry warning.

**Tech Stack:** Node.js 24, TypeScript, Fastify, Zod, native Fetch/FormData, better-sqlite3, Vitest, React 19, Testing Library, Vite.

---

## File and Responsibility Map

### New files

- `server/src/providers/yunfei-hybrid-images-adapter.ts`: Yunfei URL normalization, tier capabilities, GPT/Gemini request construction, synchronous response normalization, bounded 429 retry, and recovery of short-lived URL results.
- `server/tests/yunfei-hybrid-images-adapter.test.ts`: field-by-field protocol, size, response, and failure-semantics coverage.

### Modified backend files

- `server/src/providers/provider-adapter.ts`: new protocol/tier types and provider-aware capability/request-resolution signatures.
- `server/src/providers/toapis-async-adapter.ts`: accept the provider argument without changing ToAPIs behavior.
- `server/src/providers/ym2-openai-images-adapter.ts`: accept the provider argument without changing YM2 behavior.
- `server/src/services/provider-settings-service-v2.ts`: persist, normalize, mask, and revision-track Yunfei tier metadata; resolve capability booleans from runtime provider configuration.
- `server/src/routes/provider-settings-routes.ts`: validate `yunfei-hybrid-images` and require a `1K` or `4K` tier only for that protocol.
- `server/src/services/batch-service.ts`: register the Yunfei adapter and validate root/child rows through the provider selected for their generation role.
- `server/tests/provider-adapter-registry.test.ts`: cover the third explicit protocol and updated adapter contract.
- `server/tests/provider-settings-v2.test.ts`: cover tier storage, legacy providers, key masking, and revision changes.
- `server/tests/provider-settings-v2-routes.test.ts`: cover protocol/tier request validation and masked responses.
- `server/tests/settings-routes.test.ts`: cover tier-filtered model capabilities for both roles.
- `server/tests/generation-job-routing.test.ts`: cover direct Banana model acceptance, provider-aware request resolution, and one-output-per-job routing.
- `server/tests/ym2-openai-images-adapter.test.ts`: mechanically update provider-aware calls while retaining the existing YM2 assertions.

### Modified frontend files

- `web/src/lib/provider-settings-api.ts`: add the protocol and optional tier to public/save types.
- `web/src/lib/types.ts`: add the protocol to role settings.
- `web/src/settings-page.tsx`: show the tier selector only for Yunfei and include tier metadata in saved-provider rows.
- `web/src/tests/settings-page.test.tsx`: cover create/edit visibility, payloads, and secret masking.
- `web/src/tests/settings-defaults.test.ts`: cover 1K-tier blocking without silent normalization.
- `web/src/tests/task-table.test.tsx`: cover all three Yunfei model labels and role switching behavior.

No Veo support, `quality=high`, database schema change, `.env` edit, key migration, automatic provider/protocol detection, silent fallback, or production deployment belongs in this plan.

---

### Task 0: Prepare the Dedicated Worktree

**Files:**
- Read only: `AGENTS.md`
- Read only: `WORKLOG.md`
- Read only: `package-lock.json`

- [ ] **Step 1: Verify the isolated branch and existing user state**

Run from `D:\codex_project\图片生成\.worktrees\yunfei-image-provider`:

```powershell
git status --short --branch
git diff --check
```

Expected: branch `codex/yunfei-image-provider`; only the already committed plan/spec history is present before implementation starts. Stop if unrelated user edits appear.

- [ ] **Step 2: Install workspace-local dependencies without changing the lockfile**

```powershell
npm ci
git status --short package-lock.json
```

Expected: installation succeeds and the second command prints nothing. `node_modules` remains ignored; do not install any global package.

---

### Task 1: Make Adapter Capabilities Provider-Aware

**Files:**
- Modify: `server/src/providers/provider-adapter.ts`
- Modify: `server/src/providers/toapis-async-adapter.ts`
- Modify: `server/src/providers/ym2-openai-images-adapter.ts`
- Modify: `server/tests/provider-adapter-registry.test.ts`
- Modify: `server/tests/ym2-openai-images-adapter.test.ts`

- [ ] **Step 1: Update contract tests first**

Change the fake adapter and add the explicit third protocol assertion:

```ts
function fakeAdapter(protocolType: ProviderAdapter["protocolType"]): ProviderAdapter {
  return {
    protocolType,
    capabilities: () => [],
    resolveRequest: (_provider, _request) => ({ requestSize: "1:1" }),
    generate: async () => ({ buffer: Buffer.from("image"), mimeType: "image/png" }),
    recover: async () => ({ buffer: Buffer.from("image"), mimeType: "image/png" })
  };
}

const yunfei = fakeAdapter("yunfei-hybrid-images");
const registry = new ProviderAdapterRegistry([toApis, ym2, yunfei]);
expect(registry.require("yunfei-hybrid-images")).toBe(yunfei);
```

Update every direct YM2 `resolveRequest` call to pass `provider` first. Do not alter its expected 1280x720, 2048x1152, or 3840x2160 mappings.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
npm run test -w server -- provider-adapter-registry.test.ts ym2-openai-images-adapter.test.ts
```

Expected: TypeScript/test collection fails because the third protocol and provider-aware method signatures do not exist.

- [ ] **Step 3: Extend the shared types**

Use these exact public shapes:

```ts
export type ProtocolType =
  | "toapis-async"
  | "ym2-openai-images"
  | "yunfei-hybrid-images";

export type ProviderResolutionTier = "1K" | "4K";

export type ProviderRuntimeConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocolType: ProtocolType;
  resolutionTier?: ProviderResolutionTier;
  configRevision: string;
  maxConcurrency: number;
};

export interface ProviderAdapter {
  readonly protocolType: ProtocolType;
  capabilities(
    provider: ProviderRuntimeConfig,
    mode: GenerationMode
  ): AdapterModelCapability[];
  resolveRequest(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest
  ): AdapterResolvedRequest;
}
```

Leave the existing `generate` and `recover` declarations byte-for-byte unchanged below these two declarations.

Extend `isProtocolType` with `yunfei-hybrid-images`.

- [ ] **Step 4: Update the existing adapters mechanically**

For ToAPIs, ignore the new provider argument in capabilities and continue using it in generation:

```ts
capabilities(_provider: ProviderRuntimeConfig, mode: GenerationMode): AdapterModelCapability[] {
  return Object.entries(modelCapabilities)
    .filter(([, capability]) => mode === "text" || capability.supportsReferenceImages)
    .map(([value, capability]) => ({
      value,
      label: capability.label,
      aspectRatios: capability.aspectRatios,
      resolutions: capability.resolutions,
      supportedResolutionsByAspectRatio: resolutionsByRatio(capability.sizeMap),
      maxN: capability.maxN,
      supportsReferenceImages: capability.supportsReferenceImages
    }));
}

resolveRequest(_provider: ProviderRuntimeConfig, request: AdapterGenerationRequest) {
  const resolved = resolveTaskRequest({
    model: request.model,
    aspectRatio: request.aspectRatio,
    resolution: request.resolution,
    n: 1,
    hasReferenceImage: request.references.length > 0
  });
  return { requestSize: resolved.size };
}
```

For YM2, use the same signature and existing body:

```ts
capabilities(_provider: ProviderRuntimeConfig, _mode: GenerationMode) {
  return [{
    value: "gpt-image-2",
    label: "gpt-image-2（YM2）",
    aspectRatios: ["16:9"],
    resolutions: ["1K", "2K", "4K"],
    supportedResolutionsByAspectRatio: { "16:9": ["1K", "2K", "4K"] },
    maxN: 10,
    supportsReferenceImages: true
  }];
}

resolveRequest(_provider: ProviderRuntimeConfig, request: AdapterGenerationRequest) {
  const ratioSizes = ym2Sizes[request.aspectRatio as keyof typeof ym2Sizes];
  const requestSize = ratioSizes?.[request.resolution as keyof typeof ratioSizes];
  if (!requestSize) {
    throw new Error(`YM2 不支持 ${request.aspectRatio} · ${request.resolution}`);
  }
  return {
    requestSize,
    expectedDimensions: parseSize(requestSize)
  };
}
```

Update internal calls inside each adapter to pass `provider` to `resolveRequest`.

- [ ] **Step 5: Run the focused tests and verify GREEN**

```powershell
npm run test -w server -- provider-adapter-registry.test.ts ym2-openai-images-adapter.test.ts
```

Expected: both files pass with unchanged YM2 payload and failure assertions.

- [ ] **Step 6: Commit the contract change**

```powershell
git add server/src/providers/provider-adapter.ts server/src/providers/toapis-async-adapter.ts server/src/providers/ym2-openai-images-adapter.ts server/tests/provider-adapter-registry.test.ts server/tests/ym2-openai-images-adapter.test.ts
git commit -m "refactor: make provider capabilities configuration aware"
```

---

### Task 2: Persist and Validate Yunfei Provider Tiers

**Files:**
- Modify: `server/src/services/provider-settings-service-v2.ts`
- Modify: `server/src/routes/provider-settings-routes.ts`
- Modify: `server/tests/provider-settings-v2.test.ts`
- Modify: `server/tests/provider-settings-v2-routes.test.ts`

- [ ] **Step 1: Write failing service tests**

Add a test that saves a Yunfei provider and checks local/public/runtime forms without exposing the key:

```ts
const saved = service.saveProvider({
  name: "云飞 4K",
  baseUrl: "https://img.yunfei.best/v1/",
  apiKey: "yunfei-secret-4321",
  protocolType: "yunfei-hybrid-images",
  resolutionTier: "4K",
  maxConcurrency: 100,
  notes: "4K key"
});

expect(saved).toMatchObject({
  protocolType: "yunfei-hybrid-images",
  resolutionTier: "4K",
  apiKeyMask: "****4321"
});
expect(JSON.stringify(saved)).not.toContain("yunfei-secret-4321");
expect(service.getConfiguredProvider(saved.id)).toMatchObject({
  protocolType: "yunfei-hybrid-images",
  resolutionTier: "4K"
});
```

Also assert:

- a Yunfei save without `resolutionTier` throws `请选择云飞密钥规格`;
- editing `resolutionTier` from `1K` to `4K` creates a new `configRevision` and obeys the existing revision-dependency 409 guard;
- a legacy ToAPIs/YM2 stored object with no tier still loads unchanged;
- non-Yunfei saves discard any supplied tier rather than persisting irrelevant metadata.

- [ ] **Step 2: Write failing route tests**

POST one valid Yunfei payload, one missing-tier payload, and one invalid-tier payload. Assert 201, 400, and 400 respectively, and assert response bodies contain only `apiKeyMask` rather than the key.

- [ ] **Step 3: Run the tests and verify RED**

```powershell
npm run test -w server -- provider-settings-v2.test.ts provider-settings-v2-routes.test.ts
```

Expected: FAIL because protocol/tier types and validation are absent.

- [ ] **Step 4: Extend stored and runtime settings**

Add `resolutionTier?: ProviderResolutionTier` to `StoredProviderSettings`, `saveProvider`, runtime conversion, and public conversion. Normalize only valid values:

```ts
const resolutionTier = provider.resolutionTier === "1K" || provider.resolutionTier === "4K"
  ? provider.resolutionTier
  : undefined;
```

Require it only when `protocolType === "yunfei-hybrid-images"`. Store `undefined` for the other two protocols. Include a tier change in `remoteConfigurationChanged` so a remote reference can never be recovered through a different entitlement.

Change `ProviderSettingsOptions.protocolCapabilities` to receive a `ProviderRuntimeConfig`, not only a protocol string. Build the runtime object before invoking that callback. An `unconfigured` legacy provider still reports both capabilities false and still produces the existing 409 when selected.

- [ ] **Step 5: Extend route validation defensively**

Define shared fields, then build separate create/update schemas before applying cross-field validation. This avoids calling `.extend()` on the `ZodEffects` returned by `superRefine`:

```ts
const providerFields = {
  name: z.string().trim().min(1, "请填写中转站名称"),
  baseUrl: z.string().trim().url("请填写有效的 Base URL"),
  protocolType: z.enum([
    "toapis-async",
    "ym2-openai-images",
    "yunfei-hybrid-images"
  ]).default("toapis-async"),
  resolutionTier: z.enum(["1K", "4K"]).optional(),
  maxConcurrency: z.coerce.number().int().min(1).max(100).default(30),
  notes: z.string().max(2000, "备注不能超过 2000 个字符").optional()
};

function validateTier<T extends typeof providerFields & { apiKey: z.ZodTypeAny }>(fields: T) {
  return z.object(fields).superRefine((value, context) => {
    if (value.protocolType === "yunfei-hybrid-images" && !value.resolutionTier) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resolutionTier"],
        message: "请选择云飞密钥规格"
      });
    }
  });
}

const createProviderSchema = validateTier({
  ...providerFields,
  apiKey: z.string().trim().min(1, "请填写 API Key")
});
const updateProviderSchema = validateTier({
  ...providerFields,
  apiKey: z.string().optional()
});
```

Use `createProviderSchema` in POST and `updateProviderSchema` in PUT. Keep service-level validation too, because tests and internal code call the service without passing through Fastify.

- [ ] **Step 6: Run the settings tests and verify GREEN**

```powershell
npm run test -w server -- provider-settings-v2.test.ts provider-settings-v2-routes.test.ts
```

Expected: all settings tests pass; stored keys remain masked in every API-shaped object.

- [ ] **Step 7: Commit the settings contract**

```powershell
git add server/src/services/provider-settings-service-v2.ts server/src/routes/provider-settings-routes.ts server/tests/provider-settings-v2.test.ts server/tests/provider-settings-v2-routes.test.ts
git commit -m "feat: add Yunfei provider tiers"
```

---

### Task 3: Add the Tier Field to the Formal Settings Page

**Files:**
- Modify: `web/src/lib/provider-settings-api.ts`
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/settings-page.tsx`
- Modify: `web/src/tests/settings-page.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Extend the provider fixture with `resolutionTier: undefined`. Add these interactions:

```ts
expect(screen.queryByLabelText("云飞密钥规格")).not.toBeInTheDocument();
await user.selectOptions(screen.getByLabelText("协议类型"), "yunfei-hybrid-images");
expect(screen.getByLabelText("云飞密钥规格")).toHaveValue("1K");
await user.selectOptions(screen.getByLabelText("云飞密钥规格"), "4K");
```

After submission, assert the JSON payload includes:

```ts
expect(body).toMatchObject({
  protocolType: "yunfei-hybrid-images",
  resolutionTier: "4K"
});
```

Add an edit test that opens a saved `4K` Yunfei provider, renders `4K`, leaves the key input blank, and sends `resolutionTier: "4K"` without ever rendering the stored key.

- [ ] **Step 2: Run the test and verify RED**

```powershell
npm run test -w web -- settings-page.test.tsx
```

Expected: FAIL because the protocol option, tier type, and conditional control do not exist.

- [ ] **Step 3: Extend frontend API types**

Use the same union as the server:

```ts
export type ProviderProtocolType =
  | "toapis-async"
  | "ym2-openai-images"
  | "yunfei-hybrid-images";

export type ProviderResolutionTier = "1K" | "4K";
```

Set `ProviderSetting.protocolType` to `ProviderProtocolType`, add `resolutionTier?: ProviderResolutionTier`, and add the optional tier to `saveProviderSetting`. Extend `RoleSettings.protocolType` in `web/src/lib/types.ts` with the new literal.

- [ ] **Step 4: Implement the conditional field**

Add `resolutionTier: "1K" | "4K"` to the draft and default it to `1K`. When editing, use `provider.resolutionTier ?? "1K"`. Render:

```tsx
{draft.protocolType === "yunfei-hybrid-images" ? (
  <label>
    <span>云飞密钥规格</span>
    <select
      value={draft.resolutionTier}
      onChange={(event) => updateDraft("resolutionTier", event.target.value)}
    >
      <option value="1K">1K 密钥（仅 1K）</option>
      <option value="4K">4K 密钥（支持 1K / 2K / 4K）</option>
    </select>
  </label>
) : null}
```

Submit `resolutionTier` only for Yunfei. Add `云飞混合图像` to protocol labels and show `密钥规格 1K/4K` in the saved row only when present. Reuse the existing form layout; do not add unrelated CSS.

- [ ] **Step 5: Run the UI test and verify GREEN**

```powershell
npm run test -w web -- settings-page.test.tsx
```

Expected: settings tests pass, including masked-key and independent-role behavior.

- [ ] **Step 6: Commit the settings UI**

```powershell
git add web/src/lib/provider-settings-api.ts web/src/lib/types.ts web/src/settings-page.tsx web/src/tests/settings-page.test.tsx
git commit -m "feat: configure Yunfei key tiers"
```

---

### Task 4: Implement Yunfei Capabilities and GPT Image Requests

**Files:**
- Create: `server/src/providers/yunfei-hybrid-images-adapter.ts`
- Create: `server/tests/yunfei-hybrid-images-adapter.test.ts`

- [ ] **Step 1: Write failing tier and size tests**

Define two test providers with the same fake key and different tiers. Assert exact model IDs, labels, and resolution lists:

```ts
expect(adapter.capabilities(provider1K, "text")).toEqual([
  expect.objectContaining({ value: "gpt-image-2", resolutions: ["1K"] }),
  expect.objectContaining({
    value: "gemini-3.1-flash-image-preview",
    label: "Nano Banana 2",
    resolutions: ["1K"]
  }),
  expect.objectContaining({
    value: "gemini-3-pro-image-preview",
    label: "Nano Banana Pro",
    resolutions: ["1K"]
  })
]);

expect(adapter.capabilities(provider4K, "image")[0].resolutions)
  .toEqual(["1K", "2K", "4K"]);
```

All capabilities must have only `16:9`, `maxN: 10`, and `supportsReferenceImages: true`. Assert missing tiers and unsupported ratios/resolutions throw before `fetch`.

Assert exact resolved GPT candidates:

```ts
expect(adapter.resolveRequest(provider4K, { ...request, resolution: "1K" }))
  .toEqual({ requestSize: "1280x720", expectedDimensions: { width: 1280, height: 720 } });
expect(adapter.resolveRequest(provider4K, { ...request, resolution: "2K" }))
  .toEqual({ requestSize: "2048x1152", expectedDimensions: { width: 2048, height: 1152 } });
expect(adapter.resolveRequest(provider4K, { ...request, resolution: "4K" }))
  .toEqual({ requestSize: "3840x2160", expectedDimensions: { width: 3840, height: 2160 } });
```

- [ ] **Step 2: Write failing GPT protocol tests**

Cover both accepted Base URL forms and exact endpoint construction:

- `https://img.yunfei.best` -> `https://img.yunfei.best/v1/images/generations`;
- `https://img.yunfei.best/v1/` -> the same endpoint, never `/v1/v1/`.

For text generation, assert bearer auth, JSON content type, model, prompt, mapped pixel size, `n: 1`, and `response_format: "b64_json"` field by field.

For image edits, assert `/v1/images/edits`, bearer auth, no manually supplied multipart content type, and repeated `image[]` fields in input order:

```ts
expect(form.getAll("image[]")).toHaveLength(2);
expect(form.getAll("image")).toHaveLength(0);
expect(form.get("model")).toBe("gpt-image-2");
expect(form.get("size")).toBe("2048x1152");
expect(form.get("n")).toBe("1");
expect(form.get("response_format")).toBe("b64_json");
```

- [ ] **Step 3: Run the new test and verify RED**

```powershell
npm run test -w server -- yunfei-hybrid-images-adapter.test.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Implement URL, capability, and size helpers**

Use explicit maps:

```ts
const gptSizes = {
  "1K": { requestSize: "1280x720", width: 1280, height: 720 },
  "2K": { requestSize: "2048x1152", width: 2048, height: 1152 },
  "4K": { requestSize: "3840x2160", width: 3840, height: 2160 }
} as const;

const bananaSizes = {
  "1K": { requestSize: "1K", width: 1376, height: 768 },
  "2K": { requestSize: "2K", width: 2752, height: 1536 },
  "4K": { requestSize: "4K", width: 5504, height: 3072 }
} as const;
```

Normalize only origin or a path ending exactly in `/v1`; reject other non-root paths with `云飞 Base URL 仅支持站点根地址或 /v1`. Build `/v1/...` and `/v1beta/...` explicitly from the normalized origin.

- [ ] **Step 5: Implement GPT submission and normalization**

Route only `gpt-image-2` to GPT helpers. Prefer the first non-empty `data[].b64_json`; otherwise accept the first non-empty `data[].url`, call `onRemoteReference({ resultUrl })` before download, and immediately download it. Decode base64 to `{ buffer, mimeType: "image/png" }`.

Implement `recover` only for `remote.resultUrl`; it immediately redownloads that URL. A synchronous response without a recoverable URL must not invent a task ID.

- [ ] **Step 6: Run the GPT tests and verify GREEN**

```powershell
npm run test -w server -- yunfei-hybrid-images-adapter.test.ts
```

Expected: tier, URL, payload, multipart, base64, and URL download cases pass.

- [ ] **Step 7: Commit the GPT half of the adapter**

```powershell
git add server/src/providers/yunfei-hybrid-images-adapter.ts server/tests/yunfei-hybrid-images-adapter.test.ts
git commit -m "feat: add Yunfei GPT image adapter"
```

---

### Task 5: Add Gemini Native Requests and Synchronous Failure Safety

**Files:**
- Modify: `server/src/providers/yunfei-hybrid-images-adapter.ts`
- Modify: `server/tests/yunfei-hybrid-images-adapter.test.ts`

- [ ] **Step 1: Write failing Gemini request tests**

For each Banana model, assert the endpoint preserves the exact model ID:

```ts
expect(url).toBe(
  "https://img.yunfei.best/v1beta/models/gemini-3.1-flash-image-preview:generateContent"
);
```

Assert headers are exactly JSON plus `x-goog-api-key`, with no bearer header. For text-only 2K, assert:

```ts
expect(JSON.parse(String(init.body))).toEqual({
  contents: [{
    role: "user",
    parts: [{ text: "16:9 product photo without text" }]
  }],
  generationConfig: {
    responseModalities: ["IMAGE"],
    imageConfig: { aspectRatio: "16:9", imageSize: "2K" }
  }
});
```

For two reference images, assert the prompt is first and both `inline_data` parts preserve MIME type, base64 bytes, and order.

- [ ] **Step 2: Write failing response-scanning tests**

Return a response where candidate zero contains text and candidate one contains an image in its second part. Assert the adapter finds:

```ts
{
  inline_data: {
    mime_type: "image/webp",
    data: Buffer.from("banana-image").toString("base64")
  }
}
```

Add a `file_data.file_uri` response and assert immediate download plus `onRemoteReference({ resultUrl: fileUri })`. Do not assume candidate or part index zero.

- [ ] **Step 3: Write failing failure-semantics tests**

Use separate fetch mocks to assert:

- HTTP 400 throws a normal `Error` containing only a 500-character response excerpt;
- HTTP 429 retries at most two times, honors numeric `Retry-After`, and succeeds on the third response;
- an exhausted HTTP 429 throws a normal safe-to-retry error;
- HTTP 500, network rejection, invalid success JSON, and success JSON without an image throw `UnknownSubmissionError` after one ambiguous submission;
- a failed short-lived result download throws a normal download error and keeps the previously recorded `resultUrl` recoverable.

- [ ] **Step 4: Run the test and verify RED**

```powershell
npm run test -w server -- yunfei-hybrid-images-adapter.test.ts
```

Expected: new Gemini and failure cases fail.

- [ ] **Step 5: Implement Gemini routing and response scanning**

Route only these model IDs to Gemini:

```ts
const bananaModels = new Set([
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview"
]);
```

Build `contents[0].parts` as prompt first followed by all inline references. Scan every candidate and every part for snake-case `inline_data` and `file_data`. Return the first valid image. Reject any other model before fetch with `云飞不支持模型 <model>`.

- [ ] **Step 6: Implement the shared submission guard**

Use the existing YM2 safety pattern with Yunfei-specific messages and a 300-second timeout:

1. Retry only explicit HTTP 429 rejection, at most three total attempts.
2. Treat all other 4xx responses as deterministic failures.
3. Treat network/timeout, 5xx, malformed 2xx JSON, and image-less 2xx as unknown.
4. Never resubmit an ambiguous response inside the adapter.
5. Never include the API key, authorization header, base64 body, or full provider response in an error.

- [ ] **Step 7: Run the complete adapter tests and verify GREEN**

```powershell
npm run test -w server -- yunfei-hybrid-images-adapter.test.ts ym2-openai-images-adapter.test.ts
```

Expected: all Yunfei cases pass and YM2 remains unchanged.

- [ ] **Step 8: Commit Gemini and failure handling**

```powershell
git add server/src/providers/yunfei-hybrid-images-adapter.ts server/tests/yunfei-hybrid-images-adapter.test.ts
git commit -m "feat: support Yunfei Banana image models"
```

---

### Task 6: Wire Yunfei into Role Settings and Job Dispatch

**Files:**
- Modify: `server/src/services/batch-service.ts`
- Modify: `server/tests/settings-routes.test.ts`
- Modify: `server/tests/generation-job-routing.test.ts`
- Modify: `server/tests/provider-adapter-registry.test.ts`

- [ ] **Step 1: Write failing settings-route coverage**

Create one `1K` and one `4K` Yunfei provider through the API. Select each for the text role and assert `/api/settings` returns all three models for both, with exactly these resolution arrays:

```ts
const oneKModels = response.json().roles.text.models;
expect(oneKModels.map((model: { value: string }) => model.value)).toEqual([
  "gpt-image-2",
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview"
]);
expect(oneKModels.every((model: { resolutions: string[] }) => (
  JSON.stringify(model.resolutions) === JSON.stringify(["1K"])
))).toBe(true);

expect(fourKModels.every((model: { resolutions: string[] }) => (
  JSON.stringify(model.resolutions) === JSON.stringify(["1K", "2K", "4K"])
))).toBe(true);
```

Select the provider for the image role too and assert the same model list is exposed there.

- [ ] **Step 2: Write failing job-routing coverage**

Extend the fake adapter contract to accept provider-aware calls and add a Yunfei adapter fixture. Create a root task with model `gemini-3-pro-image-preview`, `16:9`, `1K`, and `n: 2`. Assert:

- batch creation succeeds even though that exact model is not in the global ToAPIs table;
- two independent jobs are created;
- both calls receive the selected Yunfei runtime provider including `resolutionTier`;
- `resolveRequest` receives the same provider;
- both output images retain separate job records.

Add a referenced root task and a child-image task to assert both use the current image role and the same adapter capabilities.

- [ ] **Step 3: Run the tests and verify RED**

```powershell
npm run test -w server -- settings-routes.test.ts generation-job-routing.test.ts provider-adapter-registry.test.ts
```

Expected: FAIL because Yunfei is not registered and batch creation still validates against `modelCapabilities`.

- [ ] **Step 4: Register the adapter and pass runtime providers everywhere**

Import and add `new YunfeiHybridImagesAdapter()` to the default registry. Replace protocol-only capability callbacks with provider-aware calls:

```ts
protocolCapabilities: (provider) => {
  const adapter = this.adapterRegistry.require(provider.protocolType);
  return {
    text: adapter.capabilities(provider, "text").length > 0,
    image: adapter.capabilities(provider, "image").length > 0
  };
}
```

In `getRoleSettings`, call `adapter.capabilities(provider, mode)`. In job execution, call both `adapter.capabilities(provider, job.mode)` and `adapter.resolveRequest(provider, request)`.

- [ ] **Step 5: Replace global creation-time validation with role-adapter validation**

Add one private helper that receives a `BatchTaskInput` and explicit mode. It must:

1. resolve the current role provider;
2. require its adapter;
3. find the exact model capability;
4. reject unsupported ratio, resolution, reference usage, or `n` with the same clear provider-name context used by the frontend;
5. build the validation request with `referenceImageService.getLocalAsset(referenceImageId)` when a reference exists, so adapters see the same reference count and bytes that dispatch will use;
6. call `adapter.resolveRequest(provider, request)` as the final protocol-specific validation;
7. return the task with `size: resolved.requestSize` for legacy task persistence.

Use the helper in both `createBatch` and `createChildTasksFromImage`. Root rows with an actual reference use `image`; ordinary rows use `text`; child tasks always use `image`. Keep dispatch-time validation too because an unsent job intentionally follows a provider role changed after batch creation.

Do not add the Pro model to global `modelCapabilities`: doing so would incorrectly advertise it through every ToAPIs provider.

- [ ] **Step 6: Run routing and settings tests and verify GREEN**

```powershell
npm run test -w server -- settings-routes.test.ts generation-job-routing.test.ts provider-adapter-registry.test.ts provider-settings-v2.test.ts
```

Expected: all files pass; no production request is sent because all adapters are mocked.

- [ ] **Step 7: Commit production wiring**

```powershell
git add server/src/services/batch-service.ts server/tests/settings-routes.test.ts server/tests/generation-job-routing.test.ts server/tests/provider-adapter-registry.test.ts
git commit -m "feat: route Yunfei production image jobs"
```

---

### Task 7: Verify Editor Capability Behavior

**Files:**
- Modify: `web/src/tests/settings-defaults.test.ts`
- Modify: `web/src/tests/task-table.test.tsx`

- [ ] **Step 1: Add a 1K-tier validation regression test**

Build a Yunfei `RoleSettings` value whose three models expose only `1K`. Pass an existing `gpt-image-2`, `16:9`, `4K` draft to `validateDraftForRole` and assert:

```ts
expect(validateDraftForRole(draft, role))
  .toBe("当前云飞 1K不支持分辨率 4K");
expect(draft.resolution).toBe("4K");
```

This proves unsupported restored values are blocked and not silently rewritten.

- [ ] **Step 2: Add a role/model rendering test**

Render `TaskTable` with text-role Yunfei capabilities and a separate image role. Assert the text row model select displays values in this order:

```ts
[
  "gpt-image-2",
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview"
]
```

Then attach/select a reference and assert the row switches to the image-role models. Keep the existing unsupported-value option and error-message assertions.

- [ ] **Step 3: Run tests before changing production UI code**

```powershell
npm run test -w web -- settings-defaults.test.ts task-table.test.tsx
```

Expected: tests should pass using the existing generic role-capability UI after only the protocol union was extended. If they fail, make only the smallest change in `web/src/lib/model-options.ts` or the task components needed to preserve the already approved generic behavior, add that exact file to this task's commit, and rerun the same command.

- [ ] **Step 4: Commit the regression coverage**

```powershell
git add web/src/tests/settings-defaults.test.ts web/src/tests/task-table.test.tsx
git commit -m "test: cover Yunfei editor capabilities"
```

If the regression test exposes a production defect, stage only the exact changed production file in addition to the two tests. Before committing, inspect `git status --short`; do not modify or stage task components when the test-only change passes.

---

### Task 8: Run Automated and Browser Verification

**Files:**
- Modify: `WORKLOG.md`

- [ ] **Step 1: Run all targeted suites together**

```powershell
npm run test -w server -- provider-adapter-registry.test.ts provider-settings-v2.test.ts provider-settings-v2-routes.test.ts ym2-openai-images-adapter.test.ts yunfei-hybrid-images-adapter.test.ts settings-routes.test.ts generation-job-routing.test.ts
npm run test -w web -- settings-page.test.tsx settings-defaults.test.ts task-table.test.tsx
```

Expected: all named test files pass.

- [ ] **Step 2: Run repository-required verification**

```powershell
npm test
npm run build
git diff --check
```

Expected: all backend/frontend tests pass, both production builds succeed, and `git diff --check` prints no errors.

- [ ] **Step 3: Run a no-generation browser smoke test**

Start the worktree app without creating `.env` by setting a non-secret environment-only fallback and a worktree-local ignored data directory in that PowerShell session:

```powershell
$env:TOAPIS_API_KEY = "browser-smoke-placeholder"
$env:APP_DATA_DIR = (Join-Path (Get-Location) "app-data")
$env:PORT = "3017"
npm run dev
```

Inspect `/settings` and `/` at 1440x900 and 390x844. Verify:

- Yunfei protocol reveals the tier selector and other protocols hide it;
- saved rows show only masked keys;
- both role selectors can list a saved Yunfei provider;
- a mocked/locally configured 1K role shows exactly 1K and all three model labels;
- no console error or horizontal overflow occurs;
- no batch is submitted during this smoke test.

- [ ] **Step 4: Update the worklog with the implementation-stage handoff**

Record changed files, red/green commands, full test/build results, browser results, and the remaining live-test checkpoint. State explicitly that no key or paid request has been touched yet.

- [ ] **Step 5: Commit verified implementation documentation**

```powershell
git add WORKLOG.md
git commit -m "docs: record Yunfei provider implementation"
```

---

### Task 9: User Checkpoint and Eight-Image Live Compatibility Gate

**Files:**
- Modify when evidence requires it: `server/src/providers/yunfei-hybrid-images-adapter.ts`
- Modify when evidence requires it: `server/tests/yunfei-hybrid-images-adapter.test.ts`
- Modify: `WORKLOG.md`

- [ ] **Step 1: Pause for the user's local key configuration**

Ask the user to create these two formal settings entries through `/settings`; never ask them to paste keys into chat:

- name `云飞 1K`, Base URL `https://img.yunfei.best`, protocol `云飞混合图像`, tier `1K`, their 1K key;
- name `云飞 4K`, the same Base URL/protocol, tier `4K`, their 4K key.

Do not edit `app-data/provider-settings.json` or `.env`. Continue only after the user confirms both masked entries are saved.

- [ ] **Step 2: Query model IDs without exposing secrets**

With the app stopped or provider settings idle, read the two local entries only inside the command process, call `GET https://img.yunfei.best/v1/models` with bearer auth when supported, and print only provider name, HTTP status, and returned model IDs. Do not print the provider object, key, headers, raw response, or exception request options.

Run from the repository root:

```powershell
$settingsPath = Join-Path (Get-Location) "app-data/provider-settings.json"
$storedSettings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
foreach ($providerName in @("云飞 1K", "云飞 4K")) {
  $storedProvider = $storedSettings.providers | Where-Object name -eq $providerName | Select-Object -First 1
  if (-not $storedProvider) { throw "缺少中转站配置：$providerName" }
  try {
    $modelResponse = Invoke-RestMethod -Method Get `
      -Uri "https://img.yunfei.best/v1/models" `
      -Headers @{ Authorization = "Bearer $($storedProvider.apiKey)" }
    [pscustomobject]@{
      Provider = $providerName
      HttpStatus = 200
      ModelIds = (($modelResponse.data | ForEach-Object id | Sort-Object) -join ", ")
    }
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "network-error" }
    [pscustomobject]@{ Provider = $providerName; HttpStatus = $status; ModelIds = "unavailable" }
  }
}
```

Expected evidence: the available model IDs are recorded in `WORKLOG.md`; a missing/unsupported model-list endpoint is recorded as such and does not replace generation testing.

- [ ] **Step 3: Submit the exact approved 1K matrix**

Set the text role to `云飞 1K`, then submit one three-row batch through the normal `/api/batches` path using this prompt for every row:

```text
16:9横版简洁产品摄影，一只白色陶瓷杯放在浅木桌面，柔和自然光，无文字，无标志
```

Rows:

1. `gpt-image-2`, `16:9`, `1K`, `n=1`;
2. `gemini-3.1-flash-image-preview`, `16:9`, `1K`, `n=1`;
3. `gemini-3-pro-image-preview`, `16:9`, `1K`, `n=1`.

Wait until this batch has zero queued/running jobs before changing the role provider.

With the normal local app running, execute this in one PowerShell session. It uses only the masked settings API to resolve provider IDs and prints only sanitized job evidence:

```powershell
$apiRoot = "http://127.0.0.1:3017"
$livePrompt = "16:9横版简洁产品摄影，一只白色陶瓷杯放在浅木桌面，柔和自然光，无文字，无标志"

function New-LiveTask([string]$model, [string]$resolution) {
  return @{
    prompt = $livePrompt
    note = ""
    model = $model
    aspectRatio = "16:9"
    resolution = $resolution
    size = "16:9"
    n = 1
    referenceMode = "none"
    referenceImageId = $null
  }
}

function Set-LiveTextProvider([string]$providerName) {
  $publicSettings = Invoke-RestMethod -Method Get -Uri "$apiRoot/api/provider-settings"
  $provider = $publicSettings.providers | Where-Object name -eq $providerName | Select-Object -First 1
  if (-not $provider) { throw "缺少中转站配置：$providerName" }
  $roleBody = @{ providerId = $provider.id } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$apiRoot/api/provider-settings/roles/text" `
    -ContentType "application/json" -Body $roleBody | Out-Null
}

function Invoke-LiveBatch([string]$batchName, [array]$tasks) {
  $batchBody = @{ name = $batchName; tasks = $tasks } | ConvertTo-Json -Depth 6
  $created = Invoke-RestMethod -Method Post -Uri "$apiRoot/api/batches" `
    -ContentType "application/json" -Body $batchBody
  do {
    Start-Sleep -Seconds 2
    $batchResult = Invoke-RestMethod -Method Get -Uri "$apiRoot/api/batches/$($created.batch.id)"
  } while (($batchResult.scheduler.queued + $batchResult.scheduler.running) -gt 0)
  return $batchResult
}

function Show-LiveEvidence($batchResult) {
  foreach ($job in $batchResult.jobs) {
    $task = $batchResult.tasks | Where-Object id -eq $job.task_id | Select-Object -First 1
    $hasImage = [bool]($batchResult.images | Where-Object task_id -eq $task.id | Select-Object -First 1)
    $elapsed = if ($job.created_at -and $job.updated_at) {
      [math]::Round(((Get-Date $job.updated_at) - (Get-Date $job.created_at)).TotalSeconds, 1)
    } else { $null }
    $safeError = if ($job.error_message) { [string]$job.error_message } else { "" }
    if ($safeError.Length -gt 500) { $safeError = $safeError.Substring(0, 500) }
    [pscustomobject]@{
      Provider = $job.provider_name
      Model = $task.model
      Resolution = $task.resolution
      Status = $job.status
      ElapsedSeconds = $elapsed
      ResponseForm = if ($job.remote_result_url) { "url" } else { "inline/base64" }
      ActualSize = "$($job.actual_width)x$($job.actual_height)"
      SavedLocally = $hasImage
      ErrorStage = $job.error_stage
      Error = $safeError
    }
  }
}

Set-LiveTextProvider "云飞 1K"
$oneKResult = Invoke-LiveBatch "Yunfei live gate - 1K" @(
  (New-LiveTask "gpt-image-2" "1K"),
  (New-LiveTask "gemini-3.1-flash-image-preview" "1K"),
  (New-LiveTask "gemini-3-pro-image-preview" "1K")
)
Show-LiveEvidence $oneKResult
```

- [ ] **Step 4: Submit the exact approved 4K matrix**

Set the text role to `云飞 4K`, then submit one five-row batch through the same production path:

1. `gpt-image-2`, `16:9`, `1K`, `n=1`;
2. `gpt-image-2`, `16:9`, `2K`, `n=1`;
3. `gpt-image-2`, `16:9`, `4K`, `n=1`;
4. `gemini-3.1-flash-image-preview`, `16:9`, `1K`, `n=1`;
5. `gemini-3-pro-image-preview`, `16:9`, `1K`, `n=1`.

Do not retry an `unknown` job without showing the existing duplicate-charge warning and receiving a new explicit confirmation.

In the same PowerShell session, after the 1K batch has settled:

```powershell
Set-LiveTextProvider "云飞 4K"
$fourKResult = Invoke-LiveBatch "Yunfei live gate - 4K" @(
  (New-LiveTask "gpt-image-2" "1K"),
  (New-LiveTask "gpt-image-2" "2K"),
  (New-LiveTask "gpt-image-2" "4K"),
  (New-LiveTask "gemini-3.1-flash-image-preview" "1K"),
  (New-LiveTask "gemini-3-pro-image-preview" "1K")
)
Show-LiveEvidence $fourKResult
```

- [ ] **Step 5: Record sanitized evidence for every job**

For each of the eight jobs, record only:

- provider entry name, model, and requested resolution;
- completed/failed/unknown status;
- elapsed time calculated from job timestamps;
- response form classified as inline/base64 or URL from the presence of a remote result URL;
- actual width and height;
- whether a local image record exists;
- sanitized failure stage/message when applicable.

Expected documented dimensions are:

| Model | 1K | 2K | 4K |
| --- | --- | --- | --- |
| GPT Image 2 | 1280x720 | 2048x1152 | 3840x2160 |
| Both Banana models | 1376x768 | 2752x1536 | 5504x3072 |

The approved matrix tests Banana only at 1K, so no paid Banana 2K/4K request is added.

- [ ] **Step 6: Apply the release-gate decision rule**

For every successful exact-dimension combination, retain its mapping. For any rejected or wrong-dimension GPT candidate, use only the provider's sanitized error/result dimensions to correct the explicit mapping; rerun only that failed GPT combination once after an evidence-based correction. If there is no proven exact 16:9 mapping, remove that resolution from Yunfei capabilities and its test expectations before delivery.

For a Banana failure, do not invent a different model name or endpoint. Remove only the unsupported model/resolution combination from capabilities unless the provider response gives an exact documented correction. Any source change must begin with a failing regression test and be followed by the targeted adapter/settings tests.

- [ ] **Step 7: Re-run final verification after live evidence**

```powershell
npm run test -w server -- yunfei-hybrid-images-adapter.test.ts settings-routes.test.ts generation-job-routing.test.ts
npm test
npm run build
git diff --check
```

Expected: all tests/builds pass and every exposed Yunfei combination has matching live evidence.

- [ ] **Step 8: Finish the worklog and commit only source documentation**

Update `WORKLOG.md` with sanitized matrix results, retained/removed mappings, verification output, and the absolute paths of evidence images stored outside the repository. Verify that no `app-data/`, key, response payload, generated image, `.env`, or build output is staged.

```powershell
git status --short
git add server/src/providers/yunfei-hybrid-images-adapter.ts server/tests/yunfei-hybrid-images-adapter.test.ts WORKLOG.md
git diff --cached --check
git commit -m "test: verify Yunfei image compatibility"
```

If live evidence requires no adapter/test change, stage and commit only `WORKLOG.md`.

---

## Completion Checklist

- [ ] `yunfei-hybrid-images` is an explicit protocol; no URL inference selects it.
- [ ] 1K and 4K entries persist separately, remain masked, and expose only their allowed resolutions.
- [ ] GPT uses `/v1/images/generations` or `/v1/images/edits`; Banana uses `/v1beta/models/{model}:generateContent`.
- [ ] GPT references use repeated `image[]`; Gemini references are ordered inline data after the prompt.
- [ ] Base64 and short-lived URL results are saved locally.
- [ ] 4xx and ambiguous failures keep the existing safe/unknown distinction.
- [ ] Root and child jobs use the currently selected text/image role and remain one remote output per generation job.
- [ ] Unsupported restored values remain visible and block submission until the user changes them.
- [ ] The eight approved live tests have sanitized evidence, or failed combinations are not exposed.
- [ ] `npm test`, `npm run build`, and `git diff --check` pass.
- [ ] No key, generated image, local provider settings, `.env`, or build output is committed.

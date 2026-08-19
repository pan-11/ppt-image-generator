# Yunfei Key Product Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Yunfei's incorrect generic 1K/4K tier with four explicit key products so each saved key exposes only its authorized model and resolutions.

**Architecture:** Keep one `yunfei-hybrid-images` adapter because GPT and Gemini requests share provider configuration but use different endpoints. Add `yunfeiKeyType` to runtime, persistence, API, and UI; the adapter resolves exactly one capability from that key product and rejects cross-model requests before any fetch.

**Tech Stack:** TypeScript, Node.js, Fastify, Zod, React, Vite, Vitest, Testing Library, Playwright browser smoke.

---

## File Structure

- `server/src/providers/provider-adapter.ts`: owns the shared `ProviderYunfeiKeyType` union and runtime provider field.
- `server/src/providers/yunfei-hybrid-images-adapter.ts`: maps each key product to one model and its allowed resolutions.
- `server/src/services/provider-settings-service-v2.ts`: normalizes, persists, masks, revisions, and returns `yunfeiKeyType`.
- `server/src/routes/provider-settings-routes.ts`: validates the four accepted API values and requires one for Yunfei only.
- `server/tests/provider-settings-v2.test.ts`: service persistence, masking, non-Yunfei discard, and revision coverage.
- `server/tests/provider-settings-v2-routes.test.ts`: create/update HTTP validation and public response coverage.
- `server/tests/yunfei-hybrid-images-adapter.test.ts`: exact capability isolation and pre-fetch model/size rejection.
- `server/tests/settings-routes.test.ts`: `/api/settings` role capabilities for all four Yunfei key products.
- `server/tests/generation-job-routing.test.ts`: root and reference-child dispatch retain the selected key product.
- `web/src/lib/provider-settings-api.ts`: browser-facing `ProviderYunfeiKeyType` type and payload field.
- `web/src/settings-page.tsx`: conditional key-product selector and saved metadata label.
- `web/src/tests/settings-page.test.tsx`: create/edit/masked display coverage for four key products.
- `web/src/tests/settings-defaults.test.ts`: restored unsupported values remain blocked under exact provider capabilities.
- `web/src/tests/task-table.test.tsx`: editor shows only the active key product's model and switches roles correctly.
- `WORKLOG.md`: implementation and verification handoff.

### Task 1: Replace The Shared Tier Type And Persisted Field

**Files:**
- Modify: `server/src/providers/provider-adapter.ts`
- Modify: `server/src/services/provider-settings-service-v2.ts`
- Modify: `server/src/routes/provider-settings-routes.ts`
- Test: `server/tests/provider-settings-v2.test.ts`
- Test: `server/tests/provider-settings-v2-routes.test.ts`

- [ ] **Step 1: Write failing service and route tests**

Replace the Yunfei tier service test with assertions for all accepted products, a missing-product rejection, and non-Yunfei discard:

```ts
const products = [
  "gpt-image-2-1k",
  "gpt-image-2-4k",
  "banana-2",
  "banana-pro"
] as const;

for (const yunfeiKeyType of products) {
  const saved = service.saveProvider({
    name: yunfeiKeyType,
    baseUrl: "https://img.yunfei.best",
    apiKey: `secret-${yunfeiKeyType}`,
    protocolType: "yunfei-hybrid-images",
    yunfeiKeyType,
    maxConcurrency: 100
  });
  expect(saved).toMatchObject({ protocolType: "yunfei-hybrid-images", yunfeiKeyType });
  expect(service.getConfiguredProvider(saved.id)).toMatchObject({ yunfeiKeyType });
}

expect(() => service.saveProvider({
  name: "missing product",
  baseUrl: "https://img.yunfei.best",
  apiKey: "missing-product",
  protocolType: "yunfei-hybrid-images",
  maxConcurrency: 1
})).toThrow("请选择云飞密钥类型");
```

In the route test, post `yunfeiKeyType: "banana-2"` and expect it in the masked response. Post the legacy field or an invalid value and expect HTTP 400 with `请选择云飞密钥类型` or the Zod enum error.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npm run test -w server -- provider-settings-v2.test.ts provider-settings-v2-routes.test.ts
```

Expected: FAIL because `yunfeiKeyType` is not part of the input/runtime types and the route still requires `resolutionTier`.

- [ ] **Step 3: Replace the shared type**

In `provider-adapter.ts`, replace `ProviderResolutionTier` with:

```ts
export type ProviderYunfeiKeyType =
  | "gpt-image-2-1k"
  | "gpt-image-2-4k"
  | "banana-2"
  | "banana-pro";

export type ProviderRuntimeConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocolType: ProtocolType;
  yunfeiKeyType?: ProviderYunfeiKeyType;
  configRevision: string;
  maxConcurrency: number;
};
```

- [ ] **Step 4: Persist and validate only the new field**

In `provider-settings-service-v2.ts`, add a type guard:

```ts
function isYunfeiKeyType(value: unknown): value is ProviderYunfeiKeyType {
  return value === "gpt-image-2-1k"
    || value === "gpt-image-2-4k"
    || value === "banana-2"
    || value === "banana-pro";
}
```

Normalize and retain `yunfeiKeyType` only for `yunfei-hybrid-images`. In `saveProvider`, require it with `请选择云飞密钥类型`, include it in remote-configuration revision comparison, and omit it from ToAPIs/YM2 providers. Do not map the obsolete `resolutionTier` field because no Yunfei credential was saved before this correction.

In `provider-settings-routes.ts`, replace the schema field and refinement:

```ts
yunfeiKeyType: z.enum([
  "gpt-image-2-1k",
  "gpt-image-2-4k",
  "banana-2",
  "banana-pro"
]).optional()
```

```ts
if (value.protocolType === "yunfei-hybrid-images" && !value.yunfeiKeyType) {
  context.addIssue({
    code: "custom",
    path: ["yunfeiKeyType"],
    message: "请选择云飞密钥类型"
  });
}
```

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
npm run test -w server -- provider-settings-v2.test.ts provider-settings-v2-routes.test.ts
```

Expected: both files PASS; masked responses contain the key product but never the raw key.

- [ ] **Step 6: Commit**

```powershell
git add server/src/providers/provider-adapter.ts server/src/services/provider-settings-service-v2.ts server/src/routes/provider-settings-routes.ts server/tests/provider-settings-v2.test.ts server/tests/provider-settings-v2-routes.test.ts
git commit -m "fix: model Yunfei key products explicitly"
```

### Task 2: Isolate Adapter Capabilities By Key Product

**Files:**
- Modify: `server/src/providers/yunfei-hybrid-images-adapter.ts`
- Test: `server/tests/yunfei-hybrid-images-adapter.test.ts`

- [ ] **Step 1: Write failing capability tests**

Define four providers and assert exact model isolation:

```ts
const cases = [
  ["gpt-image-2-1k", "gpt-image-2", ["1K"]],
  ["gpt-image-2-4k", "gpt-image-2", ["1K", "2K", "4K"]],
  ["banana-2", "gemini-3.1-flash-image-preview", ["1K", "2K", "4K"]],
  ["banana-pro", "gemini-3-pro-image-preview", ["1K", "2K", "4K"]]
] as const;

for (const [yunfeiKeyType, model, resolutions] of cases) {
  const capabilities = adapter.capabilities({ ...provider, yunfeiKeyType }, "text");
  expect(capabilities).toHaveLength(1);
  expect(capabilities[0]).toMatchObject({ value: model, resolutions: [...resolutions] });
}
```

Add pre-fetch rejection assertions:

```ts
expect(() => adapter.resolveRequest(
  { ...provider, yunfeiKeyType: "banana-2" },
  { ...textRequest, model: "gemini-3-pro-image-preview", resolution: "1K" }
)).toThrow("云飞香蕉2密钥不支持模型 gemini-3-pro-image-preview");

expect(() => adapter.resolveRequest(
  { ...provider, yunfeiKeyType: "gpt-image-2-1k" },
  { ...textRequest, resolution: "2K" }
)).toThrow("云飞 GPT Image 2 · 1K 密钥不支持 2K");

expect(fetchMock).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run:

```powershell
npm run test -w server -- yunfei-hybrid-images-adapter.test.ts
```

Expected: FAIL because every current Yunfei entry exposes all three models and Banana is incorrectly limited by the generic tier.

- [ ] **Step 3: Implement a single key-product map**

Replace `requireTier`, `availableResolutions`, and the three-model capability array with:

```ts
const keyProducts = {
  "gpt-image-2-1k": {
    label: "GPT Image 2 · 1K",
    model: "gpt-image-2",
    modelLabel: "gpt-image-2（云飞）",
    resolutions: ["1K"]
  },
  "gpt-image-2-4k": {
    label: "GPT Image 2 · 4K",
    model: "gpt-image-2",
    modelLabel: "gpt-image-2（云飞）",
    resolutions: ["1K", "2K", "4K"]
  },
  "banana-2": {
    label: "香蕉2",
    model: "gemini-3.1-flash-image-preview",
    modelLabel: "Nano Banana 2",
    resolutions: ["1K", "2K", "4K"]
  },
  "banana-pro": {
    label: "香蕉Pro",
    model: "gemini-3-pro-image-preview",
    modelLabel: "Nano Banana Pro",
    resolutions: ["1K", "2K", "4K"]
  }
} as const;
```

`capabilities()` returns one entry derived from this map. `resolveRequest()` first verifies the request model equals the product model, then verifies the requested resolution is included, and only then selects `gptSizes` or `bananaSizes`. Missing `yunfeiKeyType` throws `云飞中转站缺少密钥类型`.

- [ ] **Step 4: Run adapter tests and verify GREEN**

Run:

```powershell
npm run test -w server -- yunfei-hybrid-images-adapter.test.ts ym2-openai-images-adapter.test.ts
```

Expected: both files PASS; existing field-by-field GPT/Gemini request and response tests remain unchanged.

- [ ] **Step 5: Commit**

```powershell
git add server/src/providers/yunfei-hybrid-images-adapter.ts server/tests/yunfei-hybrid-images-adapter.test.ts
git commit -m "fix: isolate Yunfei models by key product"
```

### Task 3: Preserve Key Product Through Production Routing

**Files:**
- Modify: `server/tests/generation-job-routing.test.ts`
- Modify: `server/tests/settings-routes.test.ts`

- [ ] **Step 1: Write failing production capability tests**

Update the fake Yunfei adapter to derive one model from `provider.yunfeiKeyType`. Add `/api/settings` assertions for all four entries by switching the text role and checking exact model/resolution arrays.

For direct root routing, save `yunfeiKeyType: "banana-pro"` and assert every adapter call receives it:

```ts
expect(yunfei.calls.every((call) => (
  call.provider.id === provider.id
  && call.provider.yunfeiKeyType === "banana-pro"
  && call.request.model === "gemini-3-pro-image-preview"
))).toBe(true);
```

For the reference child route, save `yunfeiKeyType: "banana-2"`, request `gemini-3.1-flash-image-preview`, and assert one ordered reference reaches the image-role adapter.

- [ ] **Step 2: Run routing tests and verify RED**

Run:

```powershell
npm run test -w server -- generation-job-routing.test.ts settings-routes.test.ts
```

Expected: TypeScript/test failures because routing fixtures still use `resolutionTier` and assume one entry exposes every Yunfei model.

- [ ] **Step 3: Update only test fixtures required by the corrected runtime contract**

Use a local map in the fake adapter:

```ts
const yunfeiModels = {
  "gpt-image-2-1k": ["gpt-image-2", ["1K"]],
  "gpt-image-2-4k": ["gpt-image-2", ["1K", "2K", "4K"]],
  "banana-2": ["gemini-3.1-flash-image-preview", ["1K", "2K", "4K"]],
  "banana-pro": ["gemini-3-pro-image-preview", ["1K", "2K", "4K"]]
} as const;
```

No production batch-service changes are expected: it already passes the full `ProviderRuntimeConfig` to capability resolution and dispatch. If the tests reveal a dropped field, add only the missing object spread in `server/src/services/batch-service.ts` and retain the failing test as regression coverage.

- [ ] **Step 4: Run routing tests and verify GREEN**

Run:

```powershell
npm run test -w server -- generation-job-routing.test.ts settings-routes.test.ts
```

Expected: both files PASS; root and child jobs retain key-product identity.

- [ ] **Step 5: Commit**

```powershell
git add server/tests/generation-job-routing.test.ts server/tests/settings-routes.test.ts server/src/services/batch-service.ts
git commit -m "test: cover Yunfei key product routing"
```

Only include `batch-service.ts` in the commit if Step 3 proves a production change is required.

### Task 4: Replace The Frontend Tier Selector

**Files:**
- Modify: `web/src/lib/provider-settings-api.ts`
- Modify: `web/src/settings-page.tsx`
- Test: `web/src/tests/settings-page.test.tsx`

- [ ] **Step 1: Write failing settings-page tests**

Assert that selecting `云飞混合图像` reveals `云飞密钥类型` with these exact values and labels:

```ts
expect(Array.from((screen.getByLabelText("云飞密钥类型") as HTMLSelectElement).options).map(
  (option) => [option.value, option.textContent]
)).toEqual([
  ["gpt-image-2-1k", "GPT Image 2 · 1K"],
  ["gpt-image-2-4k", "GPT Image 2 · 4K"],
  ["banana-2", "香蕉2（支持 1K / 2K / 4K）"],
  ["banana-pro", "香蕉Pro（支持 1K / 2K / 4K）"]
]);
```

Create a Banana 2 provider and expect the POST body to contain `yunfeiKeyType: "banana-2"` and no `resolutionTier`. Render a saved provider and expect `密钥类型 香蕉2`; edit it with a blank key and preserve the selected type.

- [ ] **Step 2: Run the frontend test and verify RED**

Run:

```powershell
npm run test -w web -- settings-page.test.tsx
```

Expected: FAIL because the form still renders `云飞密钥规格` and submits `resolutionTier`.

- [ ] **Step 3: Implement the browser type and form field**

In `provider-settings-api.ts`, add:

```ts
export type ProviderYunfeiKeyType =
  | "gpt-image-2-1k"
  | "gpt-image-2-4k"
  | "banana-2"
  | "banana-pro";
```

Use optional `yunfeiKeyType` in both `ProviderSetting` and save input. In `settings-page.tsx`, replace the draft field, conditional label, options, payload property, edit default, and saved metadata. Non-Yunfei submissions must send `yunfeiKeyType: undefined`.

- [ ] **Step 4: Run the frontend test and verify GREEN**

Run:

```powershell
npm run test -w web -- settings-page.test.tsx
```

Expected: PASS with raw keys absent from rendered saved rows.

- [ ] **Step 5: Commit**

```powershell
git add web/src/lib/provider-settings-api.ts web/src/settings-page.tsx web/src/tests/settings-page.test.tsx
git commit -m "fix: configure Yunfei key products"
```

### Task 5: Correct Editor Capability Regression Coverage

**Files:**
- Modify: `web/src/tests/settings-defaults.test.ts`
- Modify: `web/src/tests/task-table.test.tsx`

- [ ] **Step 1: Write failing editor tests**

Replace the old “all Yunfei models” fixture with a Banana 2 text role containing only `gemini-3.1-flash-image-preview` at 1K/2K/4K. Assert the model selector has exactly one option and 4K is available.

Keep the reference upload role-switch assertion, but make the image role a Banana Pro provider containing only `gemini-3-pro-image-preview`. After upload, assert the model selector preserves the old unsupported Banana 2 value, shows a blocking message, and enables generation only after the user selects Banana Pro.

- [ ] **Step 2: Run the editor tests and verify RED**

Run:

```powershell
npm run test -w web -- settings-defaults.test.ts task-table.test.tsx
```

Expected: FAIL because fixtures and expectations still model one Yunfei entry as all three models.

- [ ] **Step 3: Update fixtures to the corrected API response**

Use role capabilities shaped exactly like `/api/settings`:

```ts
models: [{
  value: "gemini-3.1-flash-image-preview",
  label: "Nano Banana 2",
  aspectRatios: ["16:9"],
  resolutions: ["1K", "2K", "4K"],
  supportedResolutionsByAspectRatio: { "16:9": ["1K", "2K", "4K"] },
  maxN: 10,
  supportsReferenceImages: true
}]
```

No production editor code change is expected because it already renders provider-returned capabilities. If a test exposes hard-coded Yunfei model assumptions, remove only that assumption and keep provider capability data as the source of truth.

- [ ] **Step 4: Run the focused frontend tests and verify GREEN**

Run:

```powershell
npm run test -w web -- settings-page.test.tsx settings-defaults.test.ts task-table.test.tsx
```

Expected: all three files PASS.

- [ ] **Step 5: Commit**

```powershell
git add web/src/tests/settings-defaults.test.ts web/src/tests/task-table.test.tsx web/src/components/tasks web/src/lib/model-options.ts
git commit -m "test: cover Yunfei model key isolation"
```

Only include production editor paths if Step 3 proves a hard-coded assumption exists.

### Task 6: Full Verification, Browser Smoke, And Handoff

**Files:**
- Modify: `WORKLOG.md`
- External evidence only: current Codex visualization directory

- [ ] **Step 1: Confirm the obsolete field is gone from source and tests**

Run:

```powershell
git grep -n "resolutionTier\|ProviderResolutionTier" -- server web
```

Expected: no matches.

- [ ] **Step 2: Run all focused correction tests**

Run:

```powershell
npm run test -w server -- provider-settings-v2.test.ts provider-settings-v2-routes.test.ts yunfei-hybrid-images-adapter.test.ts generation-job-routing.test.ts settings-routes.test.ts
npm run test -w web -- settings-page.test.tsx settings-defaults.test.ts task-table.test.tsx
```

Expected: all focused files PASS with zero failures.

- [ ] **Step 3: Run the required full verification**

Run:

```powershell
npm test
npm run build
git diff --check
```

Expected: all server and web tests PASS, both production builds exit 0, and the diff check emits no errors.

- [ ] **Step 4: Run isolated browser smoke without provider calls**

Use an unused Vite port and intercepted `/api/provider-settings`, `/api/settings`, and `/api/history` responses. At 1440x900 and 390x844 verify:

- all four key-product options render;
- saved rows display masked keys and correct product labels;
- each mocked active provider exposes exactly one model;
- Banana 2 and Pro show 1K/2K/4K;
- GPT 1K shows only 1K;
- no console errors or horizontal overflow;
- no generation submission occurs.

Store screenshots outside the repository.

- [ ] **Step 5: Update WORKLOG and commit**

Record red/green evidence, exact test/build counts, browser results, changed files, the six-test checkpoint, and confirmation that no key or paid request was used.

```powershell
git add WORKLOG.md
git commit -m "docs: record Yunfei key product correction"
```

### Task 7: Local Key Checkpoint And Six Paid Tests

**Files:**
- Local ignored data only: `app-data/provider-settings.json`
- External evidence only: current Codex visualization directory

- [ ] **Step 1: Stop for user-managed local key entry**

Ask the user to save these four entries through `/settings` without pasting keys into chat:

- `云飞 GPT 1K` → `GPT Image 2 · 1K`;
- `云飞 GPT 4K` → `GPT Image 2 · 4K`;
- `云飞 香蕉2` → `香蕉2（支持 1K / 2K / 4K）`;
- `云飞 香蕉Pro` → `香蕉Pro（支持 1K / 2K / 4K）`.

All use Base URL `https://img.yunfei.best` and maximum concurrency 100.

- [ ] **Step 2: Verify masks and capabilities without printing secrets**

Query `/api/provider-settings` and `/api/settings`; record provider names, key types, masks, model IDs, and resolutions only. Abort if any response contains an unmasked key.

- [ ] **Step 3: Run the approved six 16:9 text-to-image tests sequentially**

Use a simple no-text product-photo prompt:

1. GPT 1K key → `gpt-image-2` → 1K;
2. GPT 4K key → `gpt-image-2` → 1K;
3. GPT 4K key → `gpt-image-2` → 2K;
4. GPT 4K key → `gpt-image-2` → 4K;
5. Banana 2 key → `gemini-3.1-flash-image-preview` → 1K;
6. Banana Pro key → `gemini-3-pro-image-preview` → 1K.

Record sanitized HTTP status, elapsed time, output form, actual dimensions, and saved image path outside the repository. Never print keys, headers, base64, or raw provider responses.

- [ ] **Step 4: Apply the unknown-charge stop rule**

If any synchronous request becomes `unknown`, stop immediately. Do not retry it until the user separately confirms the duplicate-charge risk.

- [ ] **Step 5: Re-run automated verification after evidence-driven mapping changes**

If live evidence requires a size mapping change or capability removal, start a new red/green cycle, then run:

```powershell
npm test
npm run build
git diff --check
```

Expected: all commands PASS before completion is claimed.

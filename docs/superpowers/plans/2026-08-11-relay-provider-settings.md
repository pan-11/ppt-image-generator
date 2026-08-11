# Relay Provider Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local settings page that stores multiple relay providers, marks one as active, and binds every formal image-generation batch to the provider selected when that batch was created.

**Architecture:** A new `ProviderSettingsService` owns `app-data/provider-settings.json` and never reads the lab directory. `BatchService` snapshots the provider ID and configuration revision into the existing batch `settings_snapshot`, resolves one `ToApisClient` per task from that snapshot, and passes the same client through reference upload, generation, polling, and download. The React `/settings` page uses a small typed API client; the existing benchmark lab remains available at `/lab`.

**Tech Stack:** Node.js, TypeScript, Fastify, Zod, React 19, Vite, Vitest, Testing Library, local JSON storage, existing SQLite batch snapshot field.

---

## File Map

**Create**

- `server/src/services/provider-settings-service.ts`: formal provider persistence, masking, validation, activation, and server-only provider lookup.
- `server/src/routes/provider-settings-routes.ts`: formal provider settings HTTP API and status-code mapping.
- `server/tests/provider-settings-service.test.ts`: storage, masking, edit, activation, and busy-state tests.
- `server/tests/provider-settings-routes.test.ts`: API response and secret-leak regression tests.
- `server/tests/provider-selection.test.ts`: batch provider snapshot, fallback, retry, and child-task provider-affinity tests.
- `server/tests/reference-image-provider-cache.test.ts`: provider-scoped reference upload cache tests.
- `web/src/lib/provider-settings-api.ts`: typed browser API client.
- `web/src/settings-page.tsx`: formal provider settings screen.
- `web/src/tests/settings-page.test.tsx`: settings UI behavior tests.

**Modify**

- `AGENTS.md`: define formal provider settings storage and isolation rules before implementation.
- `server/src/app.ts`: register the formal provider settings API.
- `server/src/services/batch-service.ts`: snapshot and resolve the provider per batch; pass the selected client through the full task flow.
- `server/src/services/reference-image-service.ts`: accept the selected client and cache uploaded references by provider.
- `web/src/main.tsx`: route `/settings` to the formal page and `/lab` to the existing lab.
- `web/src/components/layout/app-shell.tsx`: rename the visible entry to “中转站设置”.
- `web/src/styles.css`: add restrained responsive settings-page styles.
- `WORKLOG.md`: record implementation, verification, and storage risks.

**Preserve**

- Existing uncommitted direct URL/base64 response compatibility changes in `toapis-client.ts`, `batch-service.ts`, lab service, tests, and worklog.
- Existing database schema and historical rows.
- Existing lab routes, files, benchmark data, and provider keys under `app-data/lab/`.

---

### Task 0: Checkpoint the Existing Relay Response Fix

**Files:**
- Existing modifications: `WORKLOG.md`
- Existing modifications: `server/src/lab/provider-lab-service.ts`
- Existing modifications: `server/src/services/batch-service.ts`
- Existing modifications: `server/src/services/toapis-client.ts`
- Existing modifications: `server/tests/provider-lab-service.test.ts`

- [ ] **Step 1: Confirm only the known response-compatibility files are modified**

Run:

```powershell
git status --short
git diff --check
```

Expected: the five known modified files plus untracked planning/preview files; no `.env`, `app-data`, database, image, or build output.

- [ ] **Step 2: Re-run the existing focused regression test**

Run:

```powershell
npm run test -w server -- provider-lab-service.test.ts
```

Expected: all provider lab tests pass, including direct URL and `b64_json` responses.

- [ ] **Step 3: Commit only the existing response fix**

```powershell
git add WORKLOG.md server/src/lab/provider-lab-service.ts server/src/services/batch-service.ts server/src/services/toapis-client.ts server/tests/provider-lab-service.test.ts
git diff --cached --name-only
git commit -m "fix: support synchronous relay image responses"
```

Expected staged names: exactly the five listed files. Do not stage `.superpowers/` or this implementation plan.

---

### Task 1: Establish Formal Provider Rules

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the formal storage rule before code changes**

Add these rules under Structure and Development Rules:

```markdown
- `app-data/provider-settings.json`: formal image-generation relay providers and active-provider selection. Never mix this file with `app-data/lab/`.
- Formal provider keys may be returned to the web client only as masks. Never log or return the stored value.
- A batch must keep the provider selected at batch creation for retries and child tasks.
- Provider activation is rejected while formal tasks are queued or running.
```

- [ ] **Step 2: Review the rule diff**

Run:

```powershell
git diff --check -- AGENTS.md
git diff -- AGENTS.md
```

Expected: only the four scoped rules above.

- [ ] **Step 3: Commit the rule change**

```powershell
git add AGENTS.md
git commit -m "docs: define formal relay provider rules"
```

---

### Task 2: Build the Formal Provider Settings Service

**Files:**
- Create: `server/src/services/provider-settings-service.ts`
- Create: `server/tests/provider-settings-service.test.ts`

- [ ] **Step 1: Write failing storage and activation tests**

Create tests that use a fresh `mkdtempSync` directory and assert:

```ts
const service = new ProviderSettingsService(appDataDir, () => false);
const created = service.saveProvider({
  name: "Relay A",
  baseUrl: "https://relay.example.com/v1/",
  apiKey: "secret-1234",
  notes: "1K channel"
});

expect(created).toMatchObject({
  name: "Relay A",
  baseUrl: "https://relay.example.com/v1",
  apiKeyMask: "****1234",
  hasApiKey: true,
  isActive: false
});
expect(JSON.stringify(created)).not.toContain("secret-1234");
expect(readFileSync(join(appDataDir, "provider-settings.json"), "utf8"))
  .toContain("secret-1234");

const updated = service.saveProvider({
  id: created.id,
  name: "Relay A updated",
  baseUrl: "https://relay.example.com/v1",
  apiKey: "",
  notes: "updated"
});
expect(updated.apiKeyMask).toBe("****1234");

service.activateProvider(created.id);
expect(new ProviderSettingsService(appDataDir, () => false).getPublicState())
  .toMatchObject({ activeProviderId: created.id, usingEnvFallback: false });
```

Add a separate test with a mutable busy callback that expects `activateProvider` to throw a `ProviderSettingsError` with `statusCode === 409`. After activating a provider, set busy to true and verify editing that active provider also returns 409, while editing a non-active provider remains allowed. Add invalid protocol, missing provider, and notes-over-2000 assertions.

- [ ] **Step 2: Run the service test and verify RED**

Run:

```powershell
npm run test -w server -- provider-settings-service.test.ts
```

Expected: FAIL because `ProviderSettingsService` does not exist.

- [ ] **Step 3: Implement the minimal service**

Implement these public types and methods:

```ts
export type StoredProviderSettings = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type ProviderSettingsFile = {
  activeProviderId: string | null;
  providers: StoredProviderSettings[];
};

export class ProviderSettingsError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

export class ProviderSettingsService {
  constructor(
    appDataDir: string,
    private readonly isProductionBusy: () => boolean
  ) {}

  getPublicState(): {
    activeProviderId: string | null;
    usingEnvFallback: boolean;
    providers: Array<{
      id: string;
      name: string;
      baseUrl: string;
      notes: string;
      apiKeyMask: string;
      hasApiKey: true;
      isActive: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
  };

  saveProvider(input: {
    id?: string;
    name: string;
    baseUrl: string;
    apiKey?: string;
    notes?: string;
  }): ReturnType<ProviderSettingsService["getPublicState"]>["providers"][number];

  activateProvider(providerId: string): ReturnType<ProviderSettingsService["getPublicState"]>;
  getActiveProviderId(): string | null;
  getActiveProvider(): StoredProviderSettings | null;
  getProvider(providerId: string): StoredProviderSettings;
}
```

Implementation rules:

```ts
const EMPTY_SETTINGS: ProviderSettingsFile = { activeProviderId: null, providers: [] };

function maskApiKey(apiKey: string) {
  return `****${apiKey.slice(-4)}`;
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProviderSettingsError(400, "Base URL 仅支持 http 或 https");
  }
  return url.toString().replace(/\/$/, "");
}
```

Read the file on each operation so write failures cannot corrupt an in-memory active state. Validate parsed JSON as an object with an array `providers` and nullable string `activeProviderId`; throw a clear `ProviderSettingsError(500, "中转站配置文件格式无效")` otherwise.

Before saving an edit, enforce the active-provider safety rule:

```ts
if (input.id === currentSettings.activeProviderId && this.isProductionBusy()) {
  throw new ProviderSettingsError(409, "请等待当前任务完成后再编辑正在使用的中转站");
}
```

- [ ] **Step 4: Run the service test and verify GREEN**

Run:

```powershell
npm run test -w server -- provider-settings-service.test.ts
```

Expected: all service tests pass; no secret appears in assertion output.

- [ ] **Step 5: Commit the service**

```powershell
git add server/src/services/provider-settings-service.ts server/tests/provider-settings-service.test.ts
git commit -m "feat: store formal relay providers"
```

---

### Task 3: Add the Formal Provider Settings API

**Files:**
- Create: `server/src/routes/provider-settings-routes.ts`
- Create: `server/tests/provider-settings-routes.test.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/services/batch-service.ts`

- [ ] **Step 1: Write failing API tests**

Using `buildApp({ backgroundProcessing: false, envOverrides: { TOAPIS_API_KEY: "env-secret", APP_DATA_DIR: appDataDir } })`, verify:

```ts
const created = await app.inject({
  method: "POST",
  url: "/api/provider-settings",
  payload: {
    name: "Relay A",
    baseUrl: "https://relay.example.com/v1/",
    apiKey: "route-secret-5678",
    notes: "primary"
  }
});
expect(created.statusCode).toBe(201);
expect(created.body).not.toContain("route-secret-5678");

const providerId = created.json().id as string;
const activated = await app.inject({
  method: "POST",
  url: `/api/provider-settings/${providerId}/activate`
});
expect(activated.statusCode).toBe(200);
expect(activated.json()).toMatchObject({
  activeProviderId: providerId,
  usingEnvFallback: false
});

const listed = await app.inject({ method: "GET", url: "/api/provider-settings" });
expect(listed.body).not.toContain("route-secret-5678");
```

Also verify PUT with an empty Key retains the mask, unknown IDs return 404, and invalid Base URL returns 400.

- [ ] **Step 2: Run the API test and verify RED**

Run:

```powershell
npm run test -w server -- provider-settings-routes.test.ts
```

Expected: FAIL with route not found.

- [ ] **Step 3: Implement route schemas and status mapping**

Use one Zod schema and route-local error handling:

```ts
const providerSchema = z.object({
  name: z.string().trim().min(1),
  baseUrl: z.string().trim().url(),
  apiKey: z.string().optional(),
  notes: z.string().max(2000).optional()
});

function sendError(reply: FastifyReply, error: unknown) {
  const statusCode = error instanceof ProviderSettingsError ? error.statusCode : 400;
  reply.code(statusCode);
  return { message: error instanceof Error ? error.message : "请求失败" };
}
```

Register exactly the four routes from the design. POST extends the schema with `apiKey: z.string().trim().min(1)`. PUT passes the route `providerId` to `saveProvider`. Activate calls `activateProvider`.

- [ ] **Step 4: Share one service instance with BatchService**

In `BatchService`, create the service after scheduler construction and expose a server-only getter:

```ts
private readonly providerSettingsService: ProviderSettingsService;

this.providerSettingsService = new ProviderSettingsService(
  this.env.appDataDir,
  () => this.hasActiveTasks()
);

getProviderSettingsService() {
  return this.providerSettingsService;
}
```

In `buildApp`, register:

```ts
registerProviderSettingsRoutes(app, batchService.getProviderSettingsService());
```

Keep the existing `/api/settings` model/capability endpoint unchanged.

- [ ] **Step 5: Run API and existing settings tests**

Run:

```powershell
npm run test -w server -- provider-settings-routes.test.ts settings-routes.test.ts
```

Expected: both test files pass.

- [ ] **Step 6: Commit the API**

```powershell
git add server/src/routes/provider-settings-routes.ts server/src/app.ts server/src/services/batch-service.ts server/tests/provider-settings-routes.test.ts
git commit -m "feat: add relay provider settings API"
```

---

### Task 4: Bind Batches to Their Selected Provider

**Files:**
- Modify: `server/src/services/batch-service.ts`
- Create: `server/tests/provider-selection.test.ts`

- [ ] **Step 1: Write failing provider-affinity tests**

Add a client factory spy that returns a fake `ToApisClient` with a synchronous data URL result:

```ts
const clientFactory = vi.fn((apiKey: string, baseUrl?: string) => ({
  createImageTask: vi.fn().mockResolvedValue({
    data: [{ url: `data:image/png;base64,${Buffer.from("image").toString("base64")}` }]
  }),
  getImageTask: vi.fn(),
  downloadImage: vi.fn().mockResolvedValue({ buffer: Buffer.from("image"), mimeType: "image/png" }),
  uploadReferenceImage: vi.fn().mockResolvedValue(`${baseUrl ?? "https://toapis.com/v1"}/reference.png`)
}) as unknown as ToApisClient);
```

Test A:

1. Save and activate Relay A.
2. Create a background-processing batch.
3. Wait with `vi.waitFor` until its task is completed.
4. Expect `clientFactory` to receive `("relay-a-key", "https://relay-a.example.com/v1")`.
5. Parse `batch.settings_snapshot` and expect `{ providerId: relayA.id }`.

Test B: with no active provider, expect the factory to receive the `.env` key and no explicit Base URL, and snapshot `{ providerId: null }`.

Test D: retry a failed task from a Relay A batch after Relay B becomes active and assert remote polling/resubmission still uses Relay A.

Test E: edit Relay A after its failed batch becomes idle, then retry that batch. Assert the changed provider revision prevents reuse of Relay A's old `remote_task_id` and submits a fresh request through the edited Relay A configuration.

- [ ] **Step 2: Run the provider selection test and verify RED**

Run:

```powershell
npm run test -w server -- provider-selection.test.ts
```

Expected: FAIL because batches do not snapshot or resolve providers.

- [ ] **Step 3: Add client-factory injection and batch snapshot helpers**

Extend options without exposing secrets:

```ts
type BatchServiceOptions = {
  envOverrides?: Partial<NodeJS.ProcessEnv>;
  backgroundProcessing?: boolean;
  clientFactory?: (apiKey: string, baseUrl?: string) => ToApisClient;
};

private readonly clientFactory: NonNullable<BatchServiceOptions["clientFactory"]>;

this.clientFactory = options?.clientFactory ?? ((apiKey, baseUrl) => new ToApisClient(apiKey, baseUrl));
```

Export `BatchServiceOptions`, import that type in `server/src/app.ts`, and replace the current inline options declaration with this exact function signature:

```ts
import { createBatchService, type BatchServiceOptions } from "./services/batch-service.js";

export async function buildApp(options?: BatchServiceOptions) {
```

When creating a batch, extend the existing JSON only:

```ts
const activeProvider = this.providerSettingsService.getActiveProvider();

settingsSnapshot: JSON.stringify({
  maxConcurrency: this.env.maxConcurrency,
  maxBatchSize: this.env.maxBatchSize,
  providerId: activeProvider?.id ?? null,
  providerRevision: activeProvider?.updatedAt ?? null
})
```

Add defensive snapshot parsing:

```ts
function providerFromSnapshot(value: unknown) {
  try {
    const parsed = JSON.parse(String(value)) as { providerId?: unknown; providerRevision?: unknown };
    return {
      providerId: typeof parsed.providerId === "string" ? parsed.providerId : null,
      providerRevision: typeof parsed.providerRevision === "string" ? parsed.providerRevision : null
    };
  } catch {
    return { providerId: null, providerRevision: null };
  }
}
```

Existing batches without `providerId` therefore use the `.env` fallback.

- [ ] **Step 4: Resolve one client per task from its batch**

Add:

```ts
private clientForBatch(batchId: string) {
  const batch = this.batchesRepository.getById(batchId) as { settings_snapshot?: string } | undefined;
  const snapshot = providerFromSnapshot(batch?.settings_snapshot);

  if (!snapshot.providerId) {
    return {
      client: this.clientFactory(this.env.toapisApiKey),
      providerCacheKey: "env",
      canReuseRemoteTask: true
    };
  }

  const provider = this.providerSettingsService.getProvider(snapshot.providerId);
  return {
    client: this.clientFactory(provider.apiKey, provider.baseUrl),
    providerCacheKey: `${provider.id}:${provider.updatedAt}`,
    canReuseRemoteTask: snapshot.providerRevision === provider.updatedAt
  };
}
```

At the beginning of `runTask`, resolve this once. Reuse `remote_task_id` only when `canReuseRemoteTask` is true. Pass `client` into `submitAndPollRemoteTask`, `continueRemoteTask`, and image download. Keep the existing singleton client only for `ReferenceImageService` until Task 5 replaces reference upload behavior.

- [ ] **Step 5: Run provider selection and batch route tests**

Run:

```powershell
npm run test -w server -- provider-selection.test.ts batch-routes.test.ts timeout-retry.test.ts polling.test.ts
```

Expected: all tests pass; no network call leaves the test process.

- [ ] **Step 6: Commit provider affinity**

```powershell
git add server/src/services/batch-service.ts server/tests/provider-selection.test.ts
git commit -m "feat: bind batches to relay providers"
```

---

### Task 5: Scope Reference Uploads to the Batch Provider

**Files:**
- Modify: `server/src/services/reference-image-service.ts`
- Modify: `server/src/services/batch-service.ts`
- Create: `server/tests/reference-image-provider-cache.test.ts`

- [ ] **Step 1: Write the failing provider-cache test**

Create one local reference and two fake clients. Assert:

```ts
const firstA = await service.ensureRemoteUrl(reference.id, clientA, "provider-a");
const secondA = await service.ensureRemoteUrl(reference.id, clientA, "provider-a");
const firstB = await service.ensureRemoteUrl(reference.id, clientB, "provider-b");

expect(firstA).toBe("https://relay-a.example.com/reference.png");
expect(secondA).toBe(firstA);
expect(firstB).toBe("https://relay-b.example.com/reference.png");
expect(clientA.uploadReferenceImage).toHaveBeenCalledTimes(1);
expect(clientB.uploadReferenceImage).toHaveBeenCalledTimes(1);
```

Add a fallback test with cache key `env` that continues to reuse and persist the existing database `remote_url`.

Extend `provider-selection.test.ts` with the child-task affinity case:

1. Complete a Relay A parent batch and keep its generated image.
2. Activate Relay B while the scheduler is idle.
3. Add a child task to the Relay A batch.
4. Assert reference upload and child generation both use Relay A, not Relay B.

- [ ] **Step 2: Run the reference cache test and verify RED**

Run:

```powershell
npm run test -w server -- reference-image-provider-cache.test.ts
```

Expected: FAIL because `ensureRemoteUrl` does not accept a client or provider key.

- [ ] **Step 3: Implement provider-scoped caching**

Remove the client from the constructor and add an in-memory map for custom providers:

```ts
private readonly providerRemoteUrls = new Map<string, string>();

async ensureRemoteUrl(
  referenceImageId: string,
  client: ToApisClient,
  providerCacheKey: string
) {
  const existing = this.requireReference(referenceImageId);
  const cacheKey = `${providerCacheKey}:${referenceImageId}`;

  if (providerCacheKey === "env" && existing.remote_url) {
    return existing.remote_url;
  }

  const cached = this.providerRemoteUrls.get(cacheKey);
  if (cached) {
    return cached;
  }

  const remoteUrl = await client.uploadReferenceImage({
    filename: existing.filename || basename(existing.local_path),
    mimeType: existing.mime_type,
    buffer: this.fileStorage.readFile(existing.local_path)
  });

  if (providerCacheKey === "env") {
    this.referenceImagesRepository.updateRemoteUrl(referenceImageId, remoteUrl);
  } else {
    this.providerRemoteUrls.set(cacheKey, remoteUrl);
  }
  return remoteUrl;
}
```

Construct `ReferenceImageService` without a client. In `runTask`, pass the batch-resolved `client` and `providerCacheKey`. After this call site is updated, remove the remaining singleton `toApisClient` field from `BatchService`.

- [ ] **Step 4: Run reference, provider-selection, and child-task tests**

Run:

```powershell
npm run test -w server -- reference-image-provider-cache.test.ts provider-selection.test.ts batch-routes.test.ts
```

Expected: all pass; Relay A and Relay B never share a cached remote reference URL.

- [ ] **Step 5: Commit reference-provider isolation**

```powershell
git add server/src/services/reference-image-service.ts server/src/services/batch-service.ts server/tests/reference-image-provider-cache.test.ts server/tests/provider-selection.test.ts
git commit -m "fix: isolate reference uploads by relay provider"
```

---

### Task 6: Build the Formal Settings Page

**Files:**
- Create: `web/src/lib/provider-settings-api.ts`
- Create: `web/src/settings-page.tsx`
- Create: `web/src/tests/settings-page.test.tsx`

- [ ] **Step 1: Write failing page tests**

Mock `/api/provider-settings` and verify:

```tsx
render(<SettingsPage />);

expect(await screen.findByRole("heading", { name: "中转站设置" })).toBeInTheDocument();
expect(screen.getByLabelText("名称")).toBeInTheDocument();
expect(screen.getByLabelText("Base URL")).toHaveAttribute("type", "url");
expect(screen.getByLabelText("API Key")).toHaveAttribute("type", "password");
expect(screen.getByLabelText("备注")).toBeInTheDocument();
expect(screen.queryByLabelText("模型")).not.toBeInTheDocument();
expect(screen.queryByText("单张基准测试")).not.toBeInTheDocument();
expect(screen.queryByText("route-secret-5678")).not.toBeInTheDocument();
```

Add user-event tests for:

- POST creation with all four fields.
- PUT edit with `apiKey: undefined` or empty input.
- POST activate and refreshed “当前使用” badge.
- 409 activation response displaying “请等待当前任务完成后再切换”.
- `.env` fallback summary when `usingEnvFallback` is true.

- [ ] **Step 2: Run the page test and verify RED**

Run:

```powershell
npm run test -w web -- settings-page.test.tsx
```

Expected: FAIL because the page and API client do not exist.

- [ ] **Step 3: Implement the typed API client**

Use these public types and functions:

```ts
export type ProviderSetting = {
  id: string;
  name: string;
  baseUrl: string;
  notes: string;
  apiKeyMask: string;
  hasApiKey: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProviderSettingsState = {
  activeProviderId: string | null;
  usingEnvFallback: boolean;
  providers: ProviderSetting[];
};

export function fetchProviderSettings(): Promise<ProviderSettingsState>;
export function saveProviderSetting(input: {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  notes: string;
}): Promise<ProviderSetting>;
export function activateProviderSetting(providerId: string): Promise<ProviderSettingsState>;
```

On non-2xx responses parse `{ message?: string }` and throw its message.

- [ ] **Step 4: Implement the page behavior**

Use one page component with these states:

```ts
const [state, setState] = useState<ProviderSettingsState | null>(null);
const [editing, setEditing] = useState<ProviderSetting | null>(null);
const [draft, setDraft] = useState({ name: "", baseUrl: "", apiKey: "", notes: "" });
const [saving, setSaving] = useState(false);
const [activatingId, setActivatingId] = useState<string | null>(null);
const [error, setError] = useState<string | null>(null);
```

Render, in order:

1. Header with “中转站设置” and “返回生图工作台”.
2. Current provider summary or “默认配置（来自 .env）”.
3. Four-field add/edit form.
4. Saved-provider list with masked Key, notes, “编辑”, and “设为当前使用”.

Do not render model, ratio, resolution, benchmark, check, delete, enable, or protocol controls.

- [ ] **Step 5: Run the page test and verify GREEN**

Run:

```powershell
npm run test -w web -- settings-page.test.tsx
```

Expected: all settings page tests pass.

- [ ] **Step 6: Commit the page functionality**

```powershell
git add web/src/lib/provider-settings-api.ts web/src/settings-page.tsx web/src/tests/settings-page.test.tsx
git commit -m "feat: add formal relay settings page"
```

---

### Task 7: Route, Label, and Responsive Styling

**Files:**
- Modify: `web/src/main.tsx`
- Modify: `web/src/components/layout/app-shell.tsx`
- Modify: `web/src/styles.css`
- Modify: `web/src/tests/settings-page.test.tsx`

- [ ] **Step 1: Add a failing workbench-link assertion**

In `settings-page.test.tsx`, import and render `AppShell` with a simple child, then assert:

```tsx
render(<AppShell><div>workspace</div></AppShell>);
expect(screen.getByRole("link", { name: "中转站设置" }))
  .toHaveAttribute("href", "/settings");
```

The runtime route selection for `/settings` and `/lab` is verified with real browser navigation in Task 8.

- [ ] **Step 2: Run the focused frontend tests and verify RED**

Run:

```powershell
npm run test -w web -- settings-page.test.tsx
```

Expected: FAIL because `/settings` still renders the lab and the link label is old.

- [ ] **Step 3: Wire routes and labels**

Use an explicit pathname switch:

```tsx
const page = window.location.pathname === "/settings"
  ? <SettingsPage />
  : window.location.pathname === "/lab"
    ? <LabPage />
    : <App />;
```

Change the workbench link text only:

```tsx
<a className="settings-link" href="/settings">中转站设置</a>
```

- [ ] **Step 4: Add restrained responsive styles**

Create settings-specific classes with these stable constraints:

```css
.provider-settings-page { min-height: 100vh; padding: 24px; background: #f4f6f7; color: #172026; }
.provider-settings-inner { width: min(1180px, 100%); margin: 0 auto; }
.provider-settings-form { display: grid; grid-template-columns: minmax(180px, .8fr) minmax(300px, 1.4fr); gap: 14px; }
.provider-settings-list { display: grid; gap: 10px; }
.provider-settings-row { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(240px, 1.5fr) minmax(110px, .55fr) minmax(180px, 1fr) auto; gap: 14px; align-items: center; }
.provider-settings-url, .provider-settings-notes { min-width: 0; overflow-wrap: anywhere; }

@media (max-width: 760px) {
  .provider-settings-page { padding: 14px; }
  .provider-settings-form, .provider-settings-row { grid-template-columns: 1fr; }
}
```

Use 6-8px corner radii for rows and controls. Do not add decorative gradients, nested cards, oversized headings, or instructional feature copy.

- [ ] **Step 5: Run focused and full frontend tests**

Run:

```powershell
npm run test -w web -- settings-page.test.tsx lab-page.test.tsx
npm run test -w web
```

Expected: settings tests pass, existing lab tests pass at `/lab`, and all frontend tests pass.

- [ ] **Step 6: Commit route and styling**

```powershell
git add web/src/main.tsx web/src/components/layout/app-shell.tsx web/src/styles.css web/src/tests/settings-page.test.tsx
git commit -m "feat: route formal relay settings"
```

---

### Task 8: Full Verification and Handoff

**Files:**
- Modify: `WORKLOG.md`

- [ ] **Step 1: Run targeted backend regressions**

Run:

```powershell
npm run test -w server -- provider-settings-service.test.ts provider-settings-routes.test.ts provider-selection.test.ts reference-image-provider-cache.test.ts provider-lab-service.test.ts timeout-retry.test.ts polling.test.ts
```

Expected: all targeted provider, lab, retry, and polling tests pass.

- [ ] **Step 2: Run the complete project verification**

Run:

```powershell
npm test
npm run build
git diff --check
```

Expected: all backend and frontend tests pass; server TypeScript build and Vite build succeed; no whitespace errors.

- [ ] **Step 3: Start or reuse the dev servers and check runtime routes**

Verify:

```text
GET http://127.0.0.1:5173/
GET http://127.0.0.1:5173/settings
GET http://127.0.0.1:5173/lab
GET http://127.0.0.1:5173/api/health
```

Expected: all return successfully; `/settings` has only formal provider controls; `/lab` retains benchmark controls.

- [ ] **Step 4: Run browser checks at desktop and mobile widths**

Using Playwright with the installed Edge or Chrome executable, inspect 1440×900 and 390×844. Assert:

```ts
expect(await page.getByRole("heading", { name: "中转站设置" }).isVisible()).toBe(true);
expect(await page.getByLabel("名称").isVisible()).toBe(true);
expect(await page.getByLabel("Base URL").isVisible()).toBe(true);
expect(await page.getByLabel("API Key").isVisible()).toBe(true);
expect(await page.getByLabel("备注").isVisible()).toBe(true);
expect(await page.getByText("单张基准测试").count()).toBe(0);
```

Also compare `document.documentElement.scrollWidth` to `window.innerWidth`; the settings page must not have incoherent page-level horizontal overflow.

- [ ] **Step 5: Update the worklog**

Record:

- formal provider settings location and isolation from lab;
- batch provider snapshot behavior;
- provider-scoped reference upload caching;
- exact targeted/full test and build results;
- `.env` fallback and plaintext local-key risk;
- remaining untracked `.superpowers/` preview directory, which must not be committed.

- [ ] **Step 6: Commit verification documentation**

```powershell
git add WORKLOG.md
git commit -m "docs: record relay settings verification"
```

- [ ] **Step 7: Final repository audit**

Run:

```powershell
git status --short --branch
git log -8 --oneline --decorate
```

Expected: feature files are committed; `.env`, `app-data`, databases, images, build output, and `.superpowers/` are not committed. Do not push or deploy without a separate user request.

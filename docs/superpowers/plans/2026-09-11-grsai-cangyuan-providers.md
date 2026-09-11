# GrsAI and Cangyuan Providers Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the isolated adapter task and review, with root-owned integration. Steps use checkbox syntax. User has authorized implementation; no further design approval is required for this scope. Do not commit or push until requested.

**Goal:** Add GrsAI and Cangyuan protocol choices to the existing local image-generation workbench, preserving provider roles, one-call-per-image scheduling, recovery, textless generation and export.

**Architecture:** Implement two explicit ProviderAdapter classes and register them through the existing settings/registry path. Keep external protocol differences within each adapter. Use current generation_jobs storage; no database or secret configuration changes. Cangyuan references use the verified official canvas presigned upload contract; both generation modes are available.

**Tech Stack:** TypeScript, Node fetch/FormData, Fastify, React, Vitest. Existing dependencies only.

**Workspace:** `.worktrees/grsai-cangyuan`, branch `codex/grsai-cangyuan`. Preserve main's uncommitted documentation. Source baseline hashes are recorded in main `app-data/grsai-cangyuan-baseline-2026-09-11.json`; transfer only scoped verified files after checking those hashes.

## Task 1: Complete Cangyuan transport evidence

Resolved: official deployed canvas code and anonymous metadata-only POST verify `https://canvas.cangyuansuanli.cn/api/media/references` accepts JSON `{mimeType,bytes}` without Key/cookies and returns top-level `uploadUrl,url,contentType,expiresAt,ttlHours`. PUT raw bytes with Content-Type, then use returned HTTPS URL in edits. Policy max100MiB, retention2hours. Full actual PUT/generation was not run. HTTPS ai.cangyuansuanli.cn is advertised by public `/api/status` and anonymous `/v1/models` returns401 normally. Official client unwraps `data` task objects and reads task.data image arrays; evidence in main app-data/cangyuan-research-findings-2026-09-11.json. Image capabilities can now be implemented and advertised with expiry-aware provider/revision upload caching.

- [x] Inspect official public frontend/doc implementation for official presigned upload and its authorization requirements and terminal response examples. Save public evidence in main ignored app-data only.
- [x] Verify the documented HTTPS API origin using unauthenticated read-only requests. No paid generation or real image upload.
- [x] Record exact upload authorization, request body, returned URL and terminal result shape. If public API uploads cannot be established, expose Cangyuan for text generation only with an explicit UI explanation; do not fabricate an endpoint, use another provider's Key, or expose local files. Explain this material limitation at delivery and request the missing official contract if necessary.

## Task 2: GrsAI adapter

**Create:** `server/src/providers/grsai-draw-adapter.ts`, `server/tests/grsai-draw-adapter.test.ts`.

- [x] Write request-contract and recovery tests before implementation. The submit contract is:

```ts
expect(JSON.parse(String(init.body))).toEqual({
  model: "gpt-image-2", prompt: request.prompt,
  aspectRatio: "1672x941", quality: "auto",
  shutProgress: true, webHook: "-1"
});
```

- [x] Run `npm run test -w server -- grsai-draw-adapter.test.ts` and observe the missing implementation failure.
- [x] Implement GrsaiDrawAdapter with injected fetch/sleep/timeout/poll attempts, implementing ProviderAdapter. Root or `/v1` URLs normalize to origin; reject credentials, query/hash and other paths. POST `/v1/draw/completions`; references become MIME data URIs in `urls`; omit absent references. POST `/v1/draw/result` with `{id}`; normalize `code:0,data:{id,status,results:[{url}]}` and documented legacy `data.url`. Record task ID before polling and URL before downloading. Download without provider Authorization.
- [x] Support 16:9 ordinary 1K/auto/1672x941 and VIP 1K/2K/4K/medium at1280x720/2048x1152/3840x2160. Invalid model/resolution fails before network.
- [x] Cover running/succeeded/failed, code -22, invalid JSON, missing task/result, timeout/5xx ambiguous submission, transient polling failure and existing-task recovery. Never retry an uncertain generation; limited query retries are safe. Sanitize remote errors to exclude API key/reference payload.
- [x] Run targeted adapter tests; require passing behavior assertions. Independent spec review then quality review must resolve actionable findings.

## Task 3: Cangyuan adapter

**Create:** `server/src/providers/cangyuan-images-adapter.ts`, `server/tests/cangyuan-images-adapter.test.ts`.

- [x] Add failing contract tests for the documented submission:

```ts
expect(JSON.parse(String(init.body))).toEqual({
  model: "gpt-image-2-2k", prompt: request.prompt,
  n: 1, size: "16:9", response_format: "url", async: true
});
```

- [x] Run `npm run test -w server -- cangyuan-images-adapter.test.ts` to verify missing behavior.
- [x] Implement explicit JSON submit and matching-path GET polling. Accept task ID aliases documented by provider examples; recognize queued/in_progress/completed/failed. Store remote ID/URL; recover through recorded provider without new submission. Normalize terminal response only from public-contract/source evidence.
- [x] Offer ordinary gpt-image-2 with provider-default resolution and literal public 1K/2K/4K model IDs at their respective tiers; send ratio directly and avoid unsupported quality/metadata fields. Validate model, ratio and resolution before submitting. Use one image per call.
- [x] Implement the verified anonymous presigned metadata request and HTTPS reference PUT upload with provider/revision caching, expiry handling, JSON edits and edit-specific recovery. No provider Key is sent to storage.
- [x] Test polling/download/recovery, error redaction, unsupported inputs, URL normalization, secret-free CDN requests and uncertain-submission behavior. Run targeted tests.

## Task 4: Register and expose both protocols

**Modify:** `server/src/providers/provider-adapter.ts`, `server/src/routes/provider-settings-routes.ts`, `server/src/services/batch-service.ts`, `web/src/lib/provider-settings-api.ts`, `web/src/lib/types.ts`, `web/src/settings-page.tsx`.

**Tests:** `server/tests/provider-settings-v2-routes.test.ts`, `server/tests/settings-routes.test.ts`, `server/tests/new-provider-workflow.test.ts`, `web/src/tests/settings-page.test.tsx`, plus existing routing regression suites.

- [x] Write settings persistence/role capabilities tests and frontend create/edit tests; run these to observe unsupported protocol failures.
- [x] Extend both frontend/backend protocol unions and validation:

```ts
type AddedProtocol = "grsai-draw" | "cangyuan-images";
```

- [x] Register GrsaiDrawAdapter and CangyuanImagesAdapter alongside existing adapters. Extend explicit isProtocolType checks; preserve revision-dependent edit protection and provider concurrency.
- [x] Add protocol labels and context-specific Base URL help. Selecting a protocol must not erase typed Key or existing provider settings; no automatic role switching. Use the current public capability flags to filter available image-role selections.
- [x] Verify save/reload/masked responses, GrsAI text/image capabilities, Cangyuan available capabilities, old-provider options, model/resolution filtering and recovering a submitted task after role switching.

## Task 5: Validate and deliver to the primary project

- [x] Run `npm test` and `npm run build` in the isolated worktree. Full suite361 passed before the last truncated-image regression; final affected adapter/workflow suite46 passed. Build and git diff --check passed. Final full validation is recorded below in the primary project.
- [x] Run independent spec review followed by code quality review and fix findings. Both re-reviews passed. Fixed prompt redaction order, HTTP408 unknown submission and full pixel validation of Cangyuan downloads. Real-provider/account validation remains unperformed.
- [x] Compare primary source baseline hashes; copy only approved modified/new source, tests and plan/spec. All168 hashes matched;14 source/test files and2 docs copied with matching hashes. Preserved unrelated WORKLOG entries, installation prompt, env, app-data, databases and build directories.
- [x] Run primary `npm test`, `npm run build`, `git diff --check`:362 tests passed (240 server,122 web), both builds and diff check passed. Current5173 settings page serves both new options, backend schema accepts them, existing provider configuration hash is unchanged. Mocked browser create/edit/roles passed at1440/390/320px with no overflow or page errors; primary read-only browser passed. Backend schema probes reject empty keys before persistence; no real generation or image upload.
- [x] Update WORKLOG with scoped files, verification results and external limitations. Deliver protocol/Base URL setup instructions; user supplies each Key locally. Retain the worktree and leave changes uncommitted/unpushed.

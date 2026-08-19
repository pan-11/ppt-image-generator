# Provider Protocol Routing and YM2 Compatibility Design

## Summary

Replace the current single, batch-bound relay selection with protocol-aware routing for individual image jobs. The settings page will select one provider for text-to-image work and one provider for image-to-image work. Each provider declares a protocol adapter and a maximum concurrency. The first supported adapters are the existing ToAPIs asynchronous protocol and the YM2 OpenAI Images protocol.

This design makes YM2 text-to-image and image-to-image requests valid, keeps future relay differences isolated behind adapters, and records each requested image independently so partial failures can be retried without regenerating successful images.

## Goals

- Make YM2 usable for both text-to-image and reference-image generation.
- Route every new remote generation through the provider currently selected for its role.
- Allow different providers for text-to-image and image-to-image jobs.
- Support provider-specific endpoints, request formats, sizes, response formats, and concurrency.
- Split multi-image requests into independently tracked image jobs.
- Recover existing remote results without creating duplicate billable generations.
- Preserve existing batches, tasks, images, secrets, and provider configurations through an additive migration.

## Non-Goals

- Do not build a user-authored JSON request-template system.
- Do not auto-detect protocols from Base URLs or response guesses.
- Do not automatically fail over to another provider.
- Do not call a real provider during automated tests.
- Do not delete or rewrite completed history records.

## Confirmed Product Decisions

1. Providers use an explicitly selected protocol type.
2. Settings keep separate active providers for text-to-image and image-to-image.
3. Routing depends on whether a task has a reference image; a root task with a reference image is image-to-image.
4. Each provider has a manually configured maximum concurrency. Text and image jobs using the same provider share that limit.
5. Every requested output image becomes one independent job and one remote generation call. Each adapter requests one output per call (`n: 1` where the protocol exposes `n`), so a three-image request becomes three independently scheduled jobs on every provider. This is required for missing-image-only retry; YM2 also documents `n` as fixed to `1`.
6. New and unsent jobs use the currently selected role provider. Already submitted jobs keep their recorded provider.
7. Existing remote results are recovered through their original provider when safe. A genuinely new generation uses the current role provider.
8. Provider adapters own ratio and resolution conversion. Unsupported combinations are blocked before submission.
9. Returned image dimensions are verified. A mismatched image is retained for inspection and marked as a dimension error; it is not automatically regenerated.

## Why the Current YM2 Request Is Wrong

The existing `gpt-image-2` request resolver is designed for the ToAPIs ratio-metadata protocol. For a 16:9 2K request it sends a ratio-like `size` value and places `2K` in metadata. YM2 documents pixel sizes instead. Its default size is `1024x1536`, which exactly matches the observed incorrect portrait result.

YM2 documents these relevant behaviors:

- Text-to-image: `POST /v1/images/generations` with JSON.
- Image-to-image/editing: `POST /v1/images/edits` with multipart `image` fields.
- `size` is an explicit `widthxheight` pixel value.
- `n` is fixed to `1`.
- Responses use the OpenAI Images `data[]` shape with URL or `b64_json` content.
- The public page does not document an idempotency key, business ID, or result-query endpoint for an ambiguous synchronous request.

Reference: [YM2 gpt-image-2 API documentation](https://yyds.chybenzun.top/rank/docs/gpt-image-2-api.html).

## Architecture

### 1. Protocol Adapter Registry

Create a provider protocol boundary used by the batch service instead of calling `ToApisClient` directly. An adapter declares:

- protocol identifier and label;
- text-to-image and image-to-image capabilities;
- supported models, aspect ratios, resolutions, and per-request image count;
- ratio/resolution-to-request-size conversion;
- text request creation;
- reference-image request creation;
- synchronous or asynchronous result normalization;
- remote task recovery behavior;
- returned image dimension validation rules.

Initial adapters:

- `toapis-async`: preserves the current task-ID, polling, upload, `image_urls`, direct URL, and base64 behavior, while submitting one output image per job.
- `ym2-openai-images`: implements JSON generations and multipart edits with synchronous OpenAI Images responses.

Adding a provider that already implements one of these protocols requires only a new provider record. A genuinely different protocol requires a new adapter without changing queue, history, or editor logic.

### 2. Provider Settings

Extend each stored provider with:

- `protocolType`;
- `maxConcurrency`.

Replace the single `activeProviderId` with:

- `activeTextProviderId`;
- `activeImageProviderId`.

The API continues to return masked keys only. Existing stored providers keep their name, Base URL, key, and notes. A legacy provider without `protocolType` becomes `unconfigured` and cannot receive new work until the user selects a protocol. The legacy active provider is copied into both role selections during normalization.

The existing `.env` configuration is not a silent fallback. If retained for compatibility, the settings API exposes it as a read-only `Environment default` provider using the `toapis-async` adapter, and the user must explicitly select it for either role. With no valid provider selected for a role, new work for that role is blocked with a clear settings error.

Provider switching is allowed while work runs. Editing Base URL, API key, or protocol is blocked while submitted work still depends on that provider revision. Changing notes or concurrency remains safe when validation permits it.

### 3. Role Routing

At dispatch time:

- no reference image -> active text-to-image provider;
- any reference image -> active image-to-image provider.

This rule applies equally to root rows, single-row generation, global references, row references, and child tasks. Parent-batch provider affinity no longer controls new child generation.

The provider is resolved when the image job leaves the queue so a switch affects jobs that have not yet been submitted. Once submission begins, the job records provider ID, provider revision, and protocol.

### 4. Per-Image Jobs

Add an additive `generation_jobs` table. Each requested output image has one row with a unique `(task_id, output_index)` pair. Proposed fields:

- `id`, `task_id`, `output_index`;
- `mode` (`text` or `image`);
- `status` (`queued`, `submitting`, `remote_queued`, `downloading`, `completed`, `failed`, `unknown`);
- `provider_id`, `provider_revision`, `protocol_type`;
- `remote_task_id`;
- `requested_size`, `actual_width`, `actual_height`;
- `error_stage`, `error_message`;
- `created_at`, `updated_at`.

The existing task remains the editor-row aggregate. A task requesting three images creates three jobs. Task status and progress are derived from its jobs. Successful images are persisted immediately. Retrying a partially successful task queues only missing or explicitly failed jobs.

Legacy completed tasks do not require backfilled job rows. A legacy failed task creates the missing jobs lazily when retried, using its existing image count and remote task information where recoverable.

### 5. Provider Concurrency

Use a semaphore keyed by provider ID. All text-to-image and image-to-image jobs using the same provider share one configured limit. Different providers have independent limits.

For YM2 with a configured limit of `100`, a three-image task may dispatch three `n=1` requests concurrently. The scheduler never exceeds 100 simultaneous YM2 requests across both roles. Queue and monitor counts refer to image jobs, not process-lifetime retry totals.

## YM2 Adapter

### Text-to-Image

Send JSON to `/images/generations`:

- `model: "gpt-image-2"`;
- `prompt`;
- adapter-resolved pixel `size`;
- `n: 1`;
- `response_format: "b64_json"` by default.

### Image-to-Image

Send multipart form data to `/images/edits`:

- `model: "gpt-image-2"`;
- `prompt`;
- local reference image as `image`;
- adapter-resolved pixel `size`;
- `response_format: "b64_json"`.

Multiple references repeat the `image` field within YM2's documented limit. The current `/uploads/images` plus `image_urls` flow is not used by this adapter.

### Size Mapping

The adapter exposes an explicit table of valid UI combinations rather than passing ratio labels as sizes. Confirmed 16:9 mappings include:

- 1K -> `1280x720`;
- 2K -> `2048x1152`;
- 4K -> `3840x2160`.

All other supported combinations must satisfy YM2's documented multiple-of-16, maximum-edge, aspect-ratio, and total-pixel constraints. Combinations without a verified mapping are disabled in the UI. The returned image is decoded and inspected before the job becomes completed.

## UI Design

### Provider Settings Page

Each provider form includes name, Base URL, API key, protocol type, maximum concurrency, and notes. It displays read-only capabilities supplied by the selected adapter.

The page has two role selectors:

- current text-to-image provider;
- current image-to-image provider.

The same provider may be selected for both roles. If so, both roles share its single concurrency pool.

### Editor and History

Each row shows its resolved role and provider, for example `文生图 · YM2` or `图生图 · Provider B`. Model, ratio, resolution, and count options come from the applicable adapter. Adding a reference image can change the applicable adapter. If the current selection is unsupported, generation is disabled with a specific message; values are not silently downgraded.

History and live monitoring show provider, protocol, requested size, returned size, per-image status, and error stage. Monitor success and failure values are scoped to the current jobs rather than cumulative scheduler attempts.

## Error and Billing Safety

- Never silently fall back to another provider.
- Store an asynchronous remote task ID immediately and reuse it for polling or download recovery.
- A ToAPIs polling or download failure continues through the recorded provider and revision when still valid.
- A YM2 HTTP 429 may be retried with bounded backoff because the request was rejected.
- A YM2 timeout, disconnect after submission, or ambiguous 5xx becomes `unknown`; it is not automatically resubmitted because the documentation exposes no idempotency or result-query key.
- Manual retry of an `unknown` job warns that the provider may already have charged for the first attempt.
- Dimension mismatch retains the output for inspection, marks the job failed at the validation stage, and does not auto-regenerate.
- If a stored provider revision no longer matches a recoverable remote job, the old remote ID is not queried through the changed configuration. A new generation, if requested, uses the current role provider.

## Migration and Project Rules

1. Update `AGENTS.md` before production code so project rules describe role routing, job-level provider affinity, protocol adapters, and provider concurrency.
2. Add `generation_jobs` without deleting or rewriting existing task or image rows.
3. Normalize legacy provider settings in memory and persist only through the settings service.
4. Preserve existing task-note, history, and local image behavior.
5. Do not modify `.env`. If its provider is retained, represent it as an explicit read-only `Environment default` provider that can be deliberately selected for a role; never use it as a silent fallback.

## Test Design

Automated tests use fake clients and local fixtures only. They cover:

- exact YM2 JSON generation payloads;
- exact YM2 multipart edit payloads;
- verified size mappings, including 16:9 at 1K, 2K, and 4K;
- returned-dimension validation;
- three requested images becoming three one-output jobs for both adapters;
- shared provider concurrency and independent limits across different providers;
- role routing for root, referenced, global-reference, and child tasks;
- provider switching while jobs are queued or running;
- existing remote result recovery through the recorded provider;
- ambiguous synchronous failure without automatic resubmission;
- partial success followed by missing-image-only retry;
- key masking and blocked unsafe provider edits;
- additive database migration and legacy settings normalization;
- monitor and history job-level counts;
- complete `npm test`, `npm run build`, and `git diff --check`.

Real YM2 validation is separate from automated tests. It may run only after explicit approval and should be limited to one text-to-image request and one image-to-image request.

## Success Criteria

- A YM2 16:9 2K request sends `2048x1152` and stores a 2048x1152 result.
- A YM2 child task uses `/images/edits` with the local parent image.
- A three-image YM2 task schedules three independently recoverable requests without exceeding the provider limit.
- Switching either role changes only unsent and new generations.
- Successful images are never regenerated merely because a sibling image failed.
- Existing remote results are recovered without a second billable generation whenever the recorded provider revision remains usable.
- Adding a provider with an existing protocol requires no queue or editor code changes.

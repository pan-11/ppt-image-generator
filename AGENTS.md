# Project Rules

## Scope

This repository is a local PPT image generation tool. It contains a Node/Fastify server and a React/Vite web client.

## Structure

- `server/`: backend API, queueing, polling, local image storage, and tests.
- `server/src/lab/`: isolated relay-provider configuration, checks, benchmarks, and lab-only persistence.
- `web/`: frontend editor, history restore UI, and tests.
- `web/src/components/lab/`: components used only by the relay lab settings page.
- `docs/`: project notes and reference documentation.
- `app-data/`: local runtime data. Do not commit this directory.
- `app-data/provider-settings.json`: formal relay-provider settings used by production image generation. Keep this file local and never commit it.
- `app-data/lab/`: relay keys, benchmark records, and benchmark images. Never mix these files with production history or generated images.
- `.env`: local secrets and runtime config. Do not commit this file.
- `.env.example`: safe example config only.

## Development Rules

- Keep changes scoped to the requested behavior.
- Do not commit secrets, generated images, local databases, `node_modules`, or build output.
- Preserve existing code style unless a requested change requires otherwise.
- For external API behavior, prefer evidence from tests, actual API responses, or official documentation before changing request logic.
- Lab failures must not change production task status, production history, production images, or the default `.env` provider.
- Relay API keys may be returned to the web client only as masks. Never return or log the stored value.
- Formal relay API keys are stored only in `app-data/provider-settings.json`; API responses and the web client may expose masks only.
- Keep separate active providers for text-to-image jobs and image-to-image jobs. Route by whether the job has a reference image, not by whether it is a root task or child task.
- Resolve the active role provider when an image job is dispatched. Provider switching may continue while jobs run: already submitted jobs keep their recorded provider, while unsent and newly created jobs use the new role provider.
- Recover an existing remote task through the provider and revision recorded on that image job. If a new remote generation is required, use the currently active role provider and never silently fall back to another provider.
- Treat every requested output image as one independent image job and one remote generation call. Adapters must request one output per call so successful sibling images are never regenerated during a partial retry.
- Every formal provider must declare a protocol adapter and maximum concurrency. Do not infer protocols from provider URLs. Jobs using the same provider share one concurrency limit across text-to-image and image-to-image roles.
- Do not use `.env` as a silent provider fallback. If the environment-backed provider is retained, expose it as an explicit role-selectable provider so every new generation is settings-driven.
- Block edits to a provider's Base URL, API key, or protocol while that provider has submitted work that still depends on the current configuration revision.

## Verification

Run these before considering coding work complete:

```powershell
npm test
npm run build
```

For targeted backend fixes:

```powershell
npm run test -w server -- timeout-retry.test.ts polling.test.ts
```

For targeted frontend restore/session fixes:

```powershell
npm run test -w web -- app-history-restore.test.tsx
```

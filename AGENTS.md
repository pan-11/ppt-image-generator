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

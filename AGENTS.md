# Project Rules

## Scope

This repository is a local PPT image generation tool. It contains a Node/Fastify server and a React/Vite web client.

## Structure

- `server/`: backend API, queueing, polling, local image storage, and tests.
- `web/`: frontend editor, history restore UI, and tests.
- `docs/`: project notes and reference documentation.
- `app-data/`: local runtime data. Do not commit this directory.
- `.env`: local secrets and runtime config. Do not commit this file.
- `.env.example`: safe example config only.

## Development Rules

- Keep changes scoped to the requested behavior.
- Do not commit secrets, generated images, local databases, `node_modules`, or build output.
- Preserve existing code style unless a requested change requires otherwise.
- For external API behavior, prefer evidence from tests, actual API responses, or official documentation before changing request logic.

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


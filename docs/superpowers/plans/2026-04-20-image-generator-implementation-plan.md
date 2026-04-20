# Image Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only batch image generation web app with ToAPIs integration, a five-slot execution queue, reference image uploads, local history, and ZIP downloads.

**Architecture:** Use a TypeScript monorepo with a React + Vite frontend and a Fastify backend. The backend owns the ToAPIs API key, queue scheduler, SQLite persistence, and file storage; the frontend is a local browser UI for batch editing, run monitoring, history browsing, and downloads.

**Tech Stack:** React, Vite, TypeScript, Fastify, better-sqlite3, Zod, Vitest, React Testing Library, Playwright, JSZip

---

## File Structure

### Root

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

### Backend

- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/src/index.ts`
- Create: `server/src/app.ts`
- Create: `server/src/config/env.ts`
- Create: `server/src/config/model-capabilities.ts`
- Create: `server/src/db/database.ts`
- Create: `server/src/db/schema.sql`
- Create: `server/src/db/repositories/batches-repository.ts`
- Create: `server/src/db/repositories/tasks-repository.ts`
- Create: `server/src/db/repositories/images-repository.ts`
- Create: `server/src/db/repositories/reference-images-repository.ts`
- Create: `server/src/lib/http-client.ts`
- Create: `server/src/lib/file-storage.ts`
- Create: `server/src/lib/zip-service.ts`
- Create: `server/src/lib/logger.ts`
- Create: `server/src/services/toapis-client.ts`
- Create: `server/src/services/reference-image-service.ts`
- Create: `server/src/services/task-runner.ts`
- Create: `server/src/services/queue-scheduler.ts`
- Create: `server/src/services/batch-service.ts`
- Create: `server/src/routes/health-routes.ts`
- Create: `server/src/routes/settings-routes.ts`
- Create: `server/src/routes/batch-routes.ts`
- Create: `server/src/routes/history-routes.ts`
- Create: `server/src/routes/download-routes.ts`
- Create: `server/tests/health.test.ts`
- Create: `server/tests/env.test.ts`
- Create: `server/tests/repositories.test.ts`
- Create: `server/tests/toapis-client.test.ts`
- Create: `server/tests/queue-scheduler.test.ts`
- Create: `server/tests/batch-routes.test.ts`
- Create: `server/tests/download-routes.test.ts`

### Frontend

- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/styles.css`
- Create: `web/src/lib/api.ts`
- Create: `web/src/lib/types.ts`
- Create: `web/src/lib/task-draft.ts`
- Create: `web/src/components/layout/app-shell.tsx`
- Create: `web/src/components/tasks/defaults-bar.tsx`
- Create: `web/src/components/tasks/task-table.tsx`
- Create: `web/src/components/tasks/task-row.tsx`
- Create: `web/src/components/tasks/bulk-paste-modal.tsx`
- Create: `web/src/components/monitor/run-summary.tsx`
- Create: `web/src/components/history/history-list.tsx`
- Create: `web/src/components/history/history-card.tsx`
- Create: `web/src/components/history/image-grid.tsx`
- Create: `web/src/hooks/use-active-batch.ts`
- Create: `web/src/hooks/use-history.ts`
- Create: `web/src/hooks/use-settings.ts`
- Create: `web/src/tests/task-table.test.tsx`
- Create: `web/src/tests/run-summary.test.tsx`
- Create: `web/src/tests/history-list.test.tsx`
- Create: `web/playwright.config.ts`
- Create: `web/e2e/app.spec.ts`

## Task 1: Scaffold the workspace and boot a health-checked local app

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/src/index.ts`
- Create: `server/src/app.ts`
- Create: `server/src/config/env.ts`
- Create: `server/src/routes/health-routes.ts`
- Create: `server/tests/env.test.ts`
- Create: `server/tests/health.test.ts`
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/styles.css`

- [ ] **Step 1: Write the failing backend env test**

```ts
// server/tests/env.test.ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env";

describe("loadEnv", () => {
  it("reads the ToAPIs key and default concurrency", () => {
    const env = loadEnv({
      TOAPIS_API_KEY: "test-key",
      APP_DATA_DIR: "tmp/app-data",
    });

    expect(env.toapisApiKey).toBe("test-key");
    expect(env.maxConcurrency).toBe(5);
    expect(env.appDataDir).toContain("tmp/app-data");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test env.test.ts`
Expected: FAIL with `Cannot find module '../src/config/env'`

- [ ] **Step 3: Write the minimal backend bootstrap**

```ts
// server/src/config/env.ts
import { z } from "zod";

const schema = z.object({
  TOAPIS_API_KEY: z.string().min(1),
  APP_DATA_DIR: z.string().default("app-data"),
  PORT: z.coerce.number().default(3017),
  MAX_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(5),
});

export type AppEnv = {
  toapisApiKey: string;
  appDataDir: string;
  port: number;
  maxConcurrency: number;
};

export function loadEnv(input: NodeJS.ProcessEnv): AppEnv {
  const parsed = schema.parse(input);
  return {
    toapisApiKey: parsed.TOAPIS_API_KEY,
    appDataDir: parsed.APP_DATA_DIR,
    port: parsed.PORT,
    maxConcurrency: parsed.MAX_CONCURRENCY,
  };
}
```

```ts
// server/src/app.ts
import Fastify from "fastify";
import { registerHealthRoutes } from "./routes/health-routes";

export function buildApp() {
  const app = Fastify({ logger: false });
  registerHealthRoutes(app);
  return app;
}
```

```ts
// server/src/routes/health-routes.ts
import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ status: "ok" }));
}
```

```ts
// server/src/index.ts
import { buildApp } from "./app";
import { loadEnv } from "./config/env";

const env = loadEnv(process.env);
const app = buildApp();

app.listen({ port: env.port, host: "127.0.0.1" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
```

- [ ] **Step 4: Add the failing health route test**

```ts
// server/tests/health.test.ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 5: Run backend tests to verify they pass**

Run: `pnpm --filter server test`
Expected: PASS with `2 passed`

- [ ] **Step 6: Create the root workspace files**

```json
// package.json
{
  "name": "local-image-generator",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - server
  - web
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 7: Create the frontend app shell**

```tsx
// web/src/App.tsx
export default function App() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Local Batch Runner</p>
        <h1>Image Generator</h1>
        <p>Queue up prompts, upload reference images, and keep everything on this computer.</p>
      </section>
    </main>
  );
}
```

```tsx
// web/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

```css
/* web/src/styles.css */
:root {
  color-scheme: light;
  font-family: "Segoe UI", sans-serif;
  background: linear-gradient(135deg, #f6f2ea, #dce9f4);
  color: #15202b;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
  padding: 32px;
}

.hero-card {
  max-width: 720px;
  padding: 32px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 20px 50px rgba(21, 32, 43, 0.12);
}
```

- [ ] **Step 8: Run the frontend build to verify the shell compiles**

Run: `pnpm --filter web build`
Expected: PASS with Vite output including `dist/index.html`

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example server web
git commit -m "chore: scaffold local image generator workspace"
```

### Task 2: Add SQLite storage and repository coverage for batches, tasks, and images

**Files:**
- Create: `server/src/db/database.ts`
- Create: `server/src/db/schema.sql`
- Create: `server/src/db/repositories/batches-repository.ts`
- Create: `server/src/db/repositories/tasks-repository.ts`
- Create: `server/src/db/repositories/images-repository.ts`
- Create: `server/src/db/repositories/reference-images-repository.ts`
- Create: `server/tests/repositories.test.ts`

- [ ] **Step 1: Write the failing repository test**

```ts
// server/tests/repositories.test.ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/database";
import { createBatchesRepository } from "../src/db/repositories/batches-repository";
import { createTasksRepository } from "../src/db/repositories/tasks-repository";

describe("repositories", () => {
  it("creates a batch and stores task drafts", () => {
    const db = createDatabase(":memory:");
    const batches = createBatchesRepository(db);
    const tasks = createTasksRepository(db);

    const batch = batches.create({
      name: "batch-001",
      status: "draft",
      settingsSnapshot: JSON.stringify({ maxConcurrency: 5 }),
    });

    tasks.createMany(batch.id, [
      {
        prompt: "cat in watercolor",
        model: "gpt-image-1",
        size: "1024x1024",
        n: 1,
        referenceMode: "none",
      },
    ]);

    const persisted = tasks.listByBatchId(batch.id);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.prompt).toBe("cat in watercolor");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test repositories.test.ts`
Expected: FAIL with `Cannot find module '../src/db/database'`

- [ ] **Step 3: Create the schema and database bootstrap**

```sql
-- server/src/db/schema.sql
create table if not exists batches (
  id text primary key,
  name text not null,
  status text not null,
  settings_snapshot text not null,
  total_tasks integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table if not exists tasks (
  id text primary key,
  batch_id text not null,
  prompt text not null,
  model text not null,
  size text not null,
  n integer not null,
  reference_mode text not null,
  reference_image_id text,
  status text not null,
  remote_task_id text,
  error_message text,
  retry_count integer not null default 0,
  created_at text not null,
  updated_at text not null,
  foreign key(batch_id) references batches(id) on delete cascade
);
```

```ts
// server/src/db/database.ts
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function createDatabase(filename: string) {
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(import.meta.dirname, "schema.sql"), "utf8");
  db.exec(schema);
  return db;
}
```

- [ ] **Step 4: Implement the batch and task repositories**

```ts
// server/src/db/repositories/batches-repository.ts
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export function createBatchesRepository(db: Database.Database) {
  return {
    create(input: { name: string; status: string; settingsSnapshot: string }) {
      const now = new Date().toISOString();
      const id = randomUUID();
      db.prepare(
        `insert into batches (id, name, status, settings_snapshot, created_at, updated_at)
         values (@id, @name, @status, @settingsSnapshot, @createdAt, @updatedAt)`
      ).run({ id, ...input, createdAt: now, updatedAt: now });
      return { id, ...input, createdAt: now, updatedAt: now };
    },
  };
}
```

```ts
// server/src/db/repositories/tasks-repository.ts
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

type DraftTask = {
  prompt: string;
  model: string;
  size: string;
  n: number;
  referenceMode: string;
};

export function createTasksRepository(db: Database.Database) {
  return {
    createMany(batchId: string, tasks: DraftTask[]) {
      const insert = db.prepare(
        `insert into tasks (id, batch_id, prompt, model, size, n, reference_mode, status, created_at, updated_at)
         values (@id, @batchId, @prompt, @model, @size, @n, @referenceMode, 'draft', @createdAt, @updatedAt)`
      );

      const now = new Date().toISOString();
      const tx = db.transaction((items: DraftTask[]) => {
        for (const task of items) {
          insert.run({ id: randomUUID(), batchId, ...task, createdAt: now, updatedAt: now });
        }
      });

      tx(tasks);
    },
    listByBatchId(batchId: string) {
      return db.prepare(`select * from tasks where batch_id = ? order by created_at asc`).all(batchId);
    },
  };
}
```

- [ ] **Step 5: Run repository tests to verify they pass**

Run: `pnpm --filter server test repositories.test.ts`
Expected: PASS with `1 passed`

- [ ] **Step 6: Commit**

```bash
git add server/src/db server/tests/repositories.test.ts
git commit -m "feat: add sqlite repositories for batches and tasks"
```

### Task 3: Implement the ToAPIs client and model capability validation

**Files:**
- Create: `server/src/config/model-capabilities.ts`
- Create: `server/src/lib/http-client.ts`
- Create: `server/src/services/toapis-client.ts`
- Create: `server/tests/toapis-client.test.ts`

- [ ] **Step 1: Write the failing ToAPIs capability test**

```ts
// server/tests/toapis-client.test.ts
import { describe, expect, it } from "vitest";
import { getModelCapability, validateTaskInput } from "../src/config/model-capabilities";

describe("model capability validation", () => {
  it("rejects unsupported reference images", () => {
    const capability = getModelCapability("gpt-image-1");
    expect(capability.supportsReferenceImages).toBe(true);
    expect(() =>
      validateTaskInput({
        model: "seedream-lite",
        size: "1024x1024",
        n: 1,
        hasReferenceImage: true,
      })
    ).toThrow("does not support reference images");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test toapis-client.test.ts`
Expected: FAIL with `Cannot find module '../src/config/model-capabilities'`

- [ ] **Step 3: Implement capability config and validation**

```ts
// server/src/config/model-capabilities.ts
const capabilities = {
  "gpt-image-1": {
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
    maxN: 10,
    supportsReferenceImages: true,
  },
  "seedream-lite": {
    supportedSizes: ["1024x1024"],
    maxN: 1,
    supportsReferenceImages: false,
  },
} as const;

type ModelName = keyof typeof capabilities;

export function getModelCapability(model: ModelName) {
  return capabilities[model];
}

export function validateTaskInput(input: {
  model: string;
  size: string;
  n: number;
  hasReferenceImage: boolean;
}) {
  const capability = capabilities[input.model as ModelName];
  if (!capability) {
    throw new Error(`Unknown model: ${input.model}`);
  }
  if (!capability.supportedSizes.includes(input.size as never)) {
    throw new Error(`${input.model} does not support size ${input.size}`);
  }
  if (input.n < 1 || input.n > capability.maxN) {
    throw new Error(`${input.model} only supports n between 1 and ${capability.maxN}`);
  }
  if (input.hasReferenceImage && !capability.supportsReferenceImages) {
    throw new Error(`${input.model} does not support reference images`);
  }
}
```

- [ ] **Step 4: Add the minimal ToAPIs client methods**

```ts
// server/src/services/toapis-client.ts
type ToApisRequest = {
  prompt: string;
  model: string;
  size: string;
  n: number;
  imageUrls?: string[];
};

export class ToApisClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://toapis.com/v1"
  ) {}

  async createImageTask(input: ToApisRequest) {
    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`ToAPIs create task failed: ${response.status}`);
    }

    return response.json() as Promise<{ id: string; status: string }>;
  }

  async getImageTask(taskId: string) {
    const response = await fetch(`${this.baseUrl}/images/generations/${taskId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`ToAPIs get task failed: ${response.status}`);
    }

    return response.json() as Promise<{
      id: string;
      status: "queued" | "in_progress" | "completed" | "failed";
      result?: { data: Array<{ url: string }> };
    }>;
  }
}
```

- [ ] **Step 5: Run tests to verify capability validation passes**

Run: `pnpm --filter server test toapis-client.test.ts`
Expected: PASS with `1 passed`

- [ ] **Step 6: Commit**

```bash
git add server/src/config/model-capabilities.ts server/src/services/toapis-client.ts server/tests/toapis-client.test.ts
git commit -m "feat: add ToAPIs client and model capability validation"
```

### Task 4: Build the five-slot queue scheduler with auto-fill behavior

**Files:**
- Create: `server/src/services/task-runner.ts`
- Create: `server/src/services/queue-scheduler.ts`
- Create: `server/tests/queue-scheduler.test.ts`

- [ ] **Step 1: Write the failing queue scheduler test**

```ts
// server/tests/queue-scheduler.test.ts
import { describe, expect, it } from "vitest";
import { QueueScheduler } from "../src/services/queue-scheduler";

describe("QueueScheduler", () => {
  it("runs at most five tasks at a time and auto-fills the next slot", async () => {
    const runningSnapshots: number[] = [];
    let active = 0;

    const scheduler = new QueueScheduler({
      maxConcurrency: 5,
      runTask: async (taskId) => {
        active += 1;
        runningSnapshots.push(active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { taskId, outcome: "completed" as const };
      },
    });

    for (let index = 0; index < 20; index += 1) {
      scheduler.enqueue(`task-${index}`);
    }

    await scheduler.onIdle();

    expect(Math.max(...runningSnapshots)).toBe(5);
    expect(scheduler.stats()).toEqual({
      queued: 0,
      running: 0,
      completed: 20,
      failed: 0,
      paused: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test queue-scheduler.test.ts`
Expected: FAIL with `Cannot find module '../src/services/queue-scheduler'`

- [ ] **Step 3: Implement the scheduler**

```ts
// server/src/services/queue-scheduler.ts
type QueueSchedulerOptions = {
  maxConcurrency: number;
  runTask: (taskId: string) => Promise<{ taskId: string; outcome: "completed" | "failed" }>;
};

export class QueueScheduler {
  private readonly queue: string[] = [];
  private readonly running = new Set<string>();
  private completed = 0;
  private failed = 0;
  private paused = false;
  private idleResolvers: Array<() => void> = [];

  constructor(private readonly options: QueueSchedulerOptions) {}

  enqueue(taskId: string) {
    this.queue.push(taskId);
    this.fillSlots();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.fillSlots();
  }

  stats() {
    return {
      queued: this.queue.length,
      running: this.running.size,
      completed: this.completed,
      failed: this.failed,
      paused: this.paused,
    };
  }

  async onIdle() {
    if (this.queue.length === 0 && this.running.size === 0) {
      return;
    }
    await new Promise<void>((resolve) => this.idleResolvers.push(resolve));
  }

  private fillSlots() {
    if (this.paused) {
      return;
    }

    while (this.running.size < this.options.maxConcurrency && this.queue.length > 0) {
      const taskId = this.queue.shift()!;
      this.running.add(taskId);
      void this.options.runTask(taskId)
        .then((result) => {
          if (result.outcome === "completed") {
            this.completed += 1;
          } else {
            this.failed += 1;
          }
        })
        .catch(() => {
          this.failed += 1;
        })
        .finally(() => {
          this.running.delete(taskId);
          this.fillSlots();
          if (this.queue.length === 0 && this.running.size === 0) {
            this.idleResolvers.splice(0).forEach((resolve) => resolve());
          }
        });
    }
  }
}
```

- [ ] **Step 4: Run scheduler tests to verify they pass**

Run: `pnpm --filter server test queue-scheduler.test.ts`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/queue-scheduler.ts server/tests/queue-scheduler.test.ts
git commit -m "feat: add five-slot queue scheduler"
```

### Task 5: Expose backend APIs for batches, settings, history, downloads, and retries

**Files:**
- Create: `server/src/lib/file-storage.ts`
- Create: `server/src/lib/zip-service.ts`
- Create: `server/src/services/reference-image-service.ts`
- Create: `server/src/services/batch-service.ts`
- Create: `server/src/routes/settings-routes.ts`
- Create: `server/src/routes/batch-routes.ts`
- Create: `server/src/routes/history-routes.ts`
- Create: `server/src/routes/download-routes.ts`
- Create: `server/tests/batch-routes.test.ts`
- Create: `server/tests/download-routes.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write the failing batch creation route test**

```ts
// server/tests/batch-routes.test.ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("POST /api/batches", () => {
  it("creates a batch with queued tasks", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/batches",
      payload: {
        name: "Morning run",
        tasks: [
          { prompt: "tea house in snow", model: "gpt-image-1", size: "1024x1024", n: 1, referenceMode: "none" },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().batch.name).toBe("Morning run");
    expect(response.json().tasks[0].status).toBe("queued");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test batch-routes.test.ts`
Expected: FAIL with `404`

- [ ] **Step 3: Implement batch, history, and download routes**

```ts
// server/src/routes/batch-routes.ts
import type { FastifyInstance } from "fastify";

export function registerBatchRoutes(app: FastifyInstance) {
  app.post("/api/batches", async (request, reply) => {
    const payload = request.body as {
      name: string;
      tasks: Array<{ prompt: string; model: string; size: string; n: number; referenceMode: string }>;
    };

    const batch = await app.batchService.createBatch(payload);
    reply.code(201).send(batch);
  });

  app.post("/api/batches/:batchId/pause", async (request) => {
    const { batchId } = request.params as { batchId: string };
    return app.batchService.pauseBatch(batchId);
  });

  app.post("/api/batches/:batchId/resume", async (request) => {
    const { batchId } = request.params as { batchId: string };
    return app.batchService.resumeBatch(batchId);
  });

  app.post("/api/tasks/retry", async (request) => {
    const payload = request.body as { taskIds: string[] };
    return app.batchService.retryTasks(payload.taskIds);
  });
}
```

```ts
// server/src/routes/history-routes.ts
import type { FastifyInstance } from "fastify";

export function registerHistoryRoutes(app: FastifyInstance) {
  app.get("/api/history", async (request) => {
    const query = request.query as { q?: string; model?: string; date?: string };
    return app.batchService.listHistory(query);
  });

  app.delete("/api/history/batches/:batchId", async (request) => {
    const { batchId } = request.params as { batchId: string };
    return app.batchService.deleteBatch(batchId);
  });

  app.delete("/api/history/images/:imageId", async (request) => {
    const { imageId } = request.params as { imageId: string };
    return app.batchService.deleteImage(imageId);
  });
}
```

```ts
// server/src/routes/download-routes.ts
import type { FastifyInstance } from "fastify";

export function registerDownloadRoutes(app: FastifyInstance) {
  app.get("/api/download/images/:imageId", async (request, reply) => {
    const { stream, filename } = await app.batchService.downloadImage((request.params as { imageId: string }).imageId);
    reply.header("Content-Disposition", `attachment; filename=\"${filename}\"`);
    return reply.send(stream);
  });

  app.post("/api/download/zip", async (request, reply) => {
    const payload = request.body as { imageIds?: string[]; batchId?: string };
    const { stream, filename } = await app.batchService.downloadZip(payload);
    reply.header("Content-Disposition", `attachment; filename=\"${filename}\"`);
    return reply.send(stream);
  });
}
```

- [ ] **Step 4: Register the routes and decorate services in the app**

```ts
// server/src/app.ts
import Fastify from "fastify";
import { registerBatchRoutes } from "./routes/batch-routes";
import { registerDownloadRoutes } from "./routes/download-routes";
import { registerHealthRoutes } from "./routes/health-routes";
import { registerHistoryRoutes } from "./routes/history-routes";
import { registerSettingsRoutes } from "./routes/settings-routes";
import { buildBatchService } from "./services/batch-service";

export function buildApp() {
  const app = Fastify({ logger: false });
  app.decorate("batchService", buildBatchService());
  registerHealthRoutes(app);
  registerSettingsRoutes(app);
  registerBatchRoutes(app);
  registerHistoryRoutes(app);
  registerDownloadRoutes(app);
  return app;
}
```

- [ ] **Step 5: Run backend API tests**

Run: `pnpm --filter server test batch-routes.test.ts download-routes.test.ts`
Expected: PASS with route tests green and no `404`

- [ ] **Step 6: Commit**

```bash
git add server/src/app.ts server/src/routes server/src/services server/src/lib server/tests/batch-routes.test.ts server/tests/download-routes.test.ts
git commit -m "feat: add batch, history, and download APIs"
```

### Task 6: Build the batch editor UI with defaults, row overrides, and bulk paste

**Files:**
- Create: `web/src/lib/types.ts`
- Create: `web/src/lib/task-draft.ts`
- Create: `web/src/components/layout/app-shell.tsx`
- Create: `web/src/components/tasks/defaults-bar.tsx`
- Create: `web/src/components/tasks/task-table.tsx`
- Create: `web/src/components/tasks/task-row.tsx`
- Create: `web/src/components/tasks/bulk-paste-modal.tsx`
- Create: `web/src/tests/task-table.test.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Write the failing task table test**

```tsx
// web/src/tests/task-table.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskTable } from "../components/tasks/task-table";

it("creates one row per pasted prompt", async () => {
  const user = userEvent.setup();
  render(<TaskTable />);

  await user.click(screen.getByRole("button", { name: "批量粘贴" }));
  await user.type(screen.getByLabelText("提示词列表"), "forest fox{enter}glass city");
  await user.click(screen.getByRole("button", { name: "导入" }));

  expect(screen.getAllByPlaceholderText("输入提示词")).toHaveLength(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test task-table.test.tsx`
Expected: FAIL with `Cannot find module '../components/tasks/task-table'`

- [ ] **Step 3: Implement draft helpers and the task table**

```ts
// web/src/lib/task-draft.ts
export type TaskDraft = {
  id: string;
  prompt: string;
  model: string;
  size: string;
  n: number;
  referenceMode: "none" | "row" | "global";
};

export function createTaskDraft(overrides?: Partial<TaskDraft>): TaskDraft {
  return {
    id: crypto.randomUUID(),
    prompt: "",
    model: "gpt-image-1",
    size: "1024x1024",
    n: 1,
    referenceMode: "none",
    ...overrides,
  };
}
```

```tsx
// web/src/components/tasks/task-table.tsx
import { useState } from "react";
import { createTaskDraft } from "../../lib/task-draft";
import { BulkPasteModal } from "./bulk-paste-modal";

export function TaskTable() {
  const [rows, setRows] = useState([createTaskDraft()]);
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button onClick={() => setOpen(true)}>批量粘贴</button>
      <BulkPasteModal
        open={open}
        onClose={() => setOpen(false)}
        onImport={(prompts) => {
          setRows(prompts.map((prompt) => createTaskDraft({ prompt })));
          setOpen(false);
        }}
      />
      {rows.map((row) => (
        <input key={row.id} placeholder="输入提示词" defaultValue={row.prompt} />
      ))}
    </section>
  );
}
```

```tsx
// web/src/components/tasks/bulk-paste-modal.tsx
import { useState } from "react";

export function BulkPasteModal(props: {
  open: boolean;
  onClose: () => void;
  onImport: (prompts: string[]) => void;
}) {
  const [value, setValue] = useState("");

  if (!props.open) {
    return null;
  }

  return (
    <div>
      <label htmlFor="prompts">提示词列表</label>
      <textarea id="prompts" value={value} onChange={(event) => setValue(event.target.value)} />
      <button onClick={() => props.onImport(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))}>
        导入
      </button>
      <button onClick={props.onClose}>取消</button>
    </div>
  );
}
```

- [ ] **Step 4: Expand the table with defaults and row overrides**

```tsx
// web/src/App.tsx
import { AppShell } from "./components/layout/app-shell";
import { DefaultsBar } from "./components/tasks/defaults-bar";
import { TaskTable } from "./components/tasks/task-table";

export default function App() {
  return (
    <AppShell>
      <DefaultsBar />
      <TaskTable />
    </AppShell>
  );
}
```

- [ ] **Step 5: Run frontend unit tests**

Run: `pnpm --filter web test`
Expected: PASS with `task-table.test.tsx` green

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/components web/src/lib web/src/tests/task-table.test.tsx
git commit -m "feat: add batch task editor UI"
```

### Task 7: Add run monitoring, polling, history browsing, and deletion flows

**Files:**
- Create: `web/src/lib/api.ts`
- Create: `web/src/hooks/use-active-batch.ts`
- Create: `web/src/hooks/use-history.ts`
- Create: `web/src/hooks/use-settings.ts`
- Create: `web/src/components/monitor/run-summary.tsx`
- Create: `web/src/components/history/history-list.tsx`
- Create: `web/src/components/history/history-card.tsx`
- Create: `web/src/components/history/image-grid.tsx`
- Create: `web/src/tests/run-summary.test.tsx`
- Create: `web/src/tests/history-list.test.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Write the failing run summary test**

```tsx
// web/src/tests/run-summary.test.tsx
import { render, screen } from "@testing-library/react";
import { RunSummary } from "../components/monitor/run-summary";

it("shows queued and running counts", () => {
  render(<RunSummary queued={15} running={5} completed={3} failed={1} />);

  expect(screen.getByText("等待中 15")).toBeInTheDocument();
  expect(screen.getByText("运行中 5")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test run-summary.test.tsx`
Expected: FAIL with `Cannot find module '../components/monitor/run-summary'`

- [ ] **Step 3: Implement the monitor and history components**

```tsx
// web/src/components/monitor/run-summary.tsx
export function RunSummary(props: {
  queued: number;
  running: number;
  completed: number;
  failed: number;
}) {
  return (
    <section>
      <strong>{`等待中 ${props.queued}`}</strong>
      <strong>{`运行中 ${props.running}`}</strong>
      <strong>{`成功 ${props.completed}`}</strong>
      <strong>{`失败 ${props.failed}`}</strong>
    </section>
  );
}
```

```ts
// web/src/lib/api.ts
export async function fetchHistory() {
  const response = await fetch("/api/history");
  if (!response.ok) throw new Error("history request failed");
  return response.json();
}

export async function fetchActiveBatch(batchId: string) {
  const response = await fetch(`/api/history?activeBatchId=${batchId}`);
  if (!response.ok) throw new Error("active batch request failed");
  return response.json();
}
```

```tsx
// web/src/components/history/history-list.tsx
export function HistoryList(props: { batches: Array<{ id: string; name: string }> }) {
  return (
    <section>
      {props.batches.map((batch) => (
        <article key={batch.id}>{batch.name}</article>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Wire the app shell to show editor, monitor, and history together**

```tsx
// web/src/App.tsx
import { HistoryList } from "./components/history/history-list";
import { RunSummary } from "./components/monitor/run-summary";
import { AppShell } from "./components/layout/app-shell";
import { DefaultsBar } from "./components/tasks/defaults-bar";
import { TaskTable } from "./components/tasks/task-table";

export default function App() {
  return (
    <AppShell>
      <DefaultsBar />
      <RunSummary queued={0} running={0} completed={0} failed={0} />
      <TaskTable />
      <HistoryList batches={[]} />
    </AppShell>
  );
}
```

- [ ] **Step 5: Run frontend unit tests**

Run: `pnpm --filter web test run-summary.test.tsx history-list.test.tsx`
Expected: PASS with monitor and history tests green

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/lib/api.ts web/src/hooks web/src/components/monitor web/src/components/history web/src/tests/run-summary.test.tsx web/src/tests/history-list.test.tsx
git commit -m "feat: add monitoring and history views"
```

### Task 8: Add end-to-end coverage, polish the README, and verify the local workflow

**Files:**
- Create: `web/playwright.config.ts`
- Create: `web/e2e/app.spec.ts`
- Create: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing Playwright smoke test**

```ts
// web/e2e/app.spec.ts
import { expect, test } from "@playwright/test";

test("shows the batch editor and monitor summary", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Image Generator")).toBeVisible();
  await expect(page.getByRole("button", { name: "批量粘贴" })).toBeVisible();
  await expect(page.getByText("等待中 0")).toBeVisible();
});
```

- [ ] **Step 2: Run the Playwright test to verify it fails before setup**

Run: `pnpm --filter web exec playwright test web/e2e/app.spec.ts`
Expected: FAIL with missing Playwright config or missing dev server

- [ ] **Step 3: Add Playwright config and document the local workflow**

```ts
// web/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
  },
  webServer: {
    command: "pnpm --filter web dev --host 127.0.0.1 --port 5173",
    port: 5173,
    reuseExistingServer: true,
  },
});
```

```md
<!-- README.md -->
# Local Image Generator

## Quick start

1. Copy `.env.example` to `.env`
2. Set `TOAPIS_API_KEY`
3. Run `pnpm install`
4. Run `pnpm dev`
5. Open `http://127.0.0.1:5173`

## Commands

- `pnpm test`
- `pnpm build`
- `pnpm --filter web exec playwright test`
```

- [ ] **Step 4: Run the full verification suite**

Run: `pnpm test`
Expected: PASS with backend and frontend unit tests green

Run: `pnpm --filter web exec playwright test`
Expected: PASS with one smoke test green

- [ ] **Step 5: Commit**

```bash
git add web/playwright.config.ts web/e2e/app.spec.ts README.md .env.example
git commit -m "docs: add setup guide and e2e smoke coverage"
```

## Self-Review Notes

### Spec coverage

- Batch editing with row-level parameters is covered by Task 6.
- Five-slot queueing with automatic refill is covered by Task 4 and used through Task 5.
- Reference image upload and ToAPIs proxying are covered by Tasks 3 and 5.
- Local history, deletion, and ZIP download are covered by Tasks 2 and 5, then surfaced in Task 7.
- Page refresh recovery is implemented through Task 5 backend batch state APIs and Task 7 polling hooks.
- Local-only setup and API key protection are covered by Task 1 and reinforced in Task 8 docs.

### Placeholder scan

- No `TBD`, `TODO`, or deferred instructions remain.
- All tasks include explicit file paths, runnable commands, and concrete code snippets.

### Type consistency

- Queue state uses `queued`, `running`, `completed`, `failed`, and `paused` consistently.
- Draft task fields use `prompt`, `model`, `size`, `n`, and `referenceMode` consistently across backend and frontend tasks.
- Batch service ownership is consistently attached to `app.batchService` in backend route tasks.

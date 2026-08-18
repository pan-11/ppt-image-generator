import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/database.js";
import { createBatchesRepository } from "../src/db/repositories/batches-repository.js";
import { createGeneratedImagesRepository } from "../src/db/repositories/generated-images-repository.js";
import { createTasksRepository } from "../src/db/repositories/tasks-repository.js";

const tempPaths: string[] = [];

afterEach(() => {
  tempPaths.splice(0).forEach((value) => {
    try {
      rmSync(value, { recursive: true, force: true });
    } catch {
      return;
    }
  });
});

describe("repositories", () => {
  it("creates a batch, stores task drafts, and stores generated images", () => {
    const dir = mkdtempSync(join(tmpdir(), "image-generator-db-"));
    tempPaths.push(dir);
    const filename = join(dir, "data.sqlite");
    const db = createDatabase(filename);
    const batches = createBatchesRepository(db);
    const tasks = createTasksRepository(db);
    const images = createGeneratedImagesRepository(db);

    const batch = batches.create({
      name: "batch-001",
      status: "draft",
      settingsSnapshot: JSON.stringify({ maxConcurrency: 5, maxBatchSize: 50 })
    });

    const [task] = tasks.createMany(batch.id, [
        {
          prompt: "cat in watercolor",
          note: "P1 · 系统故障",
          model: "gpt-image-1",
        aspectRatio: "1:1",
        resolution: "standard",
        size: "1024x1024",
        n: 1,
        referenceMode: "none",
        referenceImageId: null
      }
    ]);

    images.create({
      batchId: batch.id,
      taskId: task.id,
      filename: "cat.png",
      localPath: "app-data/batches/1/images/cat.png",
      mimeType: "image/png"
    });

    const persistedTasks = tasks.listByBatchId(batch.id) as Array<{ prompt: string; note: string }>;
    const persistedImages = images.listByBatchId(batch.id) as Array<{ filename: string }>;

    expect(persistedTasks).toHaveLength(1);
    expect(persistedTasks[0]).toMatchObject({
      prompt: "cat in watercolor",
      note: "P1 · 系统故障"
    });
    expect(persistedImages).toHaveLength(1);
    expect(persistedImages[0]?.filename).toBe("cat.png");
  });

  it("adds the note column to an existing tasks table without losing rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "image-generator-legacy-db-"));
    tempPaths.push(dir);
    const filename = join(dir, "legacy.sqlite");
    const legacy = new Database(filename);
    legacy.exec(`
      create table tasks (
        id text primary key,
        prompt text not null
      );
      insert into tasks (id, prompt) values ('legacy-task', 'legacy prompt');
    `);
    legacy.close();

    const db = createDatabase(filename);
    const columns = db.prepare("pragma table_info(tasks)").all() as Array<{ name: string }>;
    const row = db.prepare("select id, prompt, note from tasks where id = ?").get("legacy-task") as {
      id: string;
      prompt: string;
      note: string | null;
    };

    expect(columns.map((column) => column.name)).toContain("note");
    expect(row).toEqual({ id: "legacy-task", prompt: "legacy prompt", note: null });
    db.close();
  });
});

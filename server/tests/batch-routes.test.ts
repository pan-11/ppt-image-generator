import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createDatabase } from "../src/db/database.js";
import { createGeneratedImagesRepository } from "../src/db/repositories/generated-images-repository.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      return;
    }
  });
});

describe("batch routes", () => {
  it("creates a batch with queued tasks", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-app-"));
    tempDirs.push(appDataDir);
    const app = await buildApp({
      envOverrides: {
        TOAPIS_API_KEY: "test-key",
        APP_DATA_DIR: appDataDir
      },
      backgroundProcessing: false
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/batches",
        payload: {
          name: "Morning run",
          tasks: [
            {
              prompt: "tea house in snow",
              note: "P1 · Morning tea",
              model: "gpt-image-1",
              aspectRatio: "1:1",
              resolution: "standard",
              size: "1024x1024",
              n: 1,
              referenceMode: "none",
              referenceImageId: null
            }
          ]
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().batch.name).toBe("Morning run");
      expect(response.json().tasks).toHaveLength(1);
      expect(response.json().tasks[0]).toMatchObject({
        note: "P1 · Morning tea",
        prompt: "tea house in snow",
        status: "queued"
      });
    } finally {
      await app.close();
    }
  });

  it("creates child tasks from a generated image in the same batch", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-app-"));
    tempDirs.push(appDataDir);
    const app = await buildApp({
      envOverrides: {
        TOAPIS_API_KEY: "test-key",
        APP_DATA_DIR: appDataDir
      },
      backgroundProcessing: false
    });

    try {
      const batchResponse = await app.inject({
        method: "POST",
        url: "/api/batches",
        payload: {
          name: "PPT run",
          tasks: [
            {
              prompt: "cover page visual",
              model: "gpt-image-1",
              aspectRatio: "1:1",
              resolution: "standard",
              size: "1024x1024",
              n: 1,
              referenceMode: "none",
              referenceImageId: null
            }
          ]
        }
      });

      const { batch, tasks } = batchResponse.json() as {
        batch: { id: string };
        tasks: Array<{ id: string }>;
      };
      const parentPath = join(appDataDir, "parent.png");
      writeFileSync(parentPath, Buffer.from("parent-image"));

      const db = createDatabase(join(appDataDir, "app.sqlite"));
      const images = createGeneratedImagesRepository(db);
      const parentImage = images.create({
        batchId: batch.id,
        taskId: tasks[0].id,
        filename: "parent.png",
        localPath: parentPath,
        mimeType: "image/png"
      });
      db.close();

      const childResponse = await app.inject({
        method: "POST",
        url: `/api/images/${parentImage.id}/children`,
        payload: {
          tasks: [
            {
              prompt: "make a no-text version",
              model: "gpt-image-1",
              aspectRatio: "1:1",
              resolution: "standard",
              size: "1024x1024",
              n: 1
            }
          ]
        }
      });

      expect(childResponse.statusCode).toBe(201);
      expect(childResponse.json().tasks).toHaveLength(1);
      expect(childResponse.json().tasks[0]).toMatchObject({
        prompt: "make a no-text version",
        note: "",
        batch_id: batch.id,
        parent_image_id: parentImage.id,
        reference_mode: "row"
      });
      expect(childResponse.json().tasks[0].reference_image_id).toEqual(expect.any(String));

      const updatedBatchResponse = await app.inject({
        method: "GET",
        url: `/api/batches/${batch.id}`
      });
      expect(updatedBatchResponse.json().tasks).toHaveLength(2);
    } finally {
      await app.close();
    }
  });
});

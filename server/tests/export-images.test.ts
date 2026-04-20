import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/database.js";
import { createGeneratedImagesRepository } from "../src/db/repositories/generated-images-repository.js";
import { createBatchService } from "../src/services/batch-service.js";

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

describe("exportBatchImages", () => {
  it("copies all generated images into the requested destination directory", () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-export-app-"));
    const destinationDir = mkdtempSync(join(tmpdir(), "image-generator-export-dest-"));
    tempDirs.push(appDataDir, destinationDir);

    const service = createBatchService({
      envOverrides: {
        TOAPIS_API_KEY: "test-key",
        APP_DATA_DIR: appDataDir
      },
      backgroundProcessing: false
    });

    const created = service.createBatch({
      name: "Export run",
      tasks: [
        {
          prompt: "test export",
          model: "gpt-image-1",
          aspectRatio: "1:1",
          resolution: "standard",
          size: "1024x1024",
          n: 1,
          referenceMode: "none",
          referenceImageId: null
        }
      ]
    });

    const batchId = created.batch.id;
    const taskId = created.tasks[0]?.id as string;
    const imageDir = join(appDataDir, "batches", batchId, "images");
    mkdirSync(imageDir, { recursive: true });
    const imagePath = join(imageDir, `${taskId}-1.png`);
    writeFileSync(imagePath, Buffer.from("fake-image"));

    const db = createDatabase(join(appDataDir, "app.sqlite"));
    const images = createGeneratedImagesRepository(db);
    images.create({
      batchId,
      taskId,
      filename: `${taskId}-1.png`,
      localPath: imagePath,
      mimeType: "image/png"
    });
    db.close();

    const result = service.exportBatchImages({
      batchId,
      destinationDir
    });

    expect(result.ok).toBe(true);
    expect(result.exportedCount).toBe(1);
    expect(result.destinationDir).toBe(destinationDir);

    void service.close();
  });
});

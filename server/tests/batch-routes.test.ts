import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
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

    const response = await app.inject({
      method: "POST",
      url: "/api/batches",
      payload: {
        name: "Morning run",
        tasks: [
          {
            prompt: "tea house in snow",
            model: "gpt-image-1",
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
    expect(response.json().tasks[0].status).toBe("queued");

    await app.close();
  });
});

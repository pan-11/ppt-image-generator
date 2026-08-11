import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../src/db/database.js";
import { createReferenceImagesRepository } from "../src/db/repositories/reference-images-repository.js";
import { FileStorage } from "../src/lib/file-storage.js";
import { ReferenceImageService } from "../src/services/reference-image-service.js";
import type { ToApisClient } from "../src/services/toapis-client.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function uploadClient(url: string) {
  return {
    uploadReferenceImage: vi.fn().mockResolvedValue(url)
  } as unknown as ToApisClient;
}

function createHarness() {
  const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-reference-cache-"));
  tempDirs.push(appDataDir);
  const db = createDatabase(join(appDataDir, "app.sqlite"));
  const repository = createReferenceImagesRepository(db);
  const fileStorage = new FileStorage(appDataDir);
  const service = new ReferenceImageService(fileStorage, repository);
  const reference = service.createLocalReference({
    filename: "reference.png",
    mimeType: "image/png",
    buffer: Buffer.from("reference-bytes")
  });
  return { db, repository, fileStorage, service, reference };
}

describe("reference image provider cache", () => {
  it("uploads the same reference once per formal provider revision", async () => {
    const { db, service, reference } = createHarness();
    const clientA = uploadClient("https://a.example.com/reference.png");
    const clientB = uploadClient("https://b.example.com/reference.png");

    try {
      await expect(service.ensureRemoteUrl(reference.id, clientA, "provider-a:revision-1"))
        .resolves.toBe("https://a.example.com/reference.png");
      await expect(service.ensureRemoteUrl(reference.id, clientA, "provider-a:revision-1"))
        .resolves.toBe("https://a.example.com/reference.png");
      await expect(service.ensureRemoteUrl(reference.id, clientB, "provider-b:revision-1"))
        .resolves.toBe("https://b.example.com/reference.png");

      expect(clientA.uploadReferenceImage).toHaveBeenCalledOnce();
      expect(clientB.uploadReferenceImage).toHaveBeenCalledOnce();
    } finally {
      db.close();
    }
  });

  it("preserves the existing database cache for the env provider", async () => {
    const { db, repository, fileStorage, service, reference } = createHarness();
    const firstClient = uploadClient("https://env.example.com/reference.png");
    const secondClient = uploadClient("https://env.example.com/unused.png");

    try {
      await service.ensureRemoteUrl(reference.id, firstClient, "env");
      const reloaded = new ReferenceImageService(fileStorage, repository);
      await expect(reloaded.ensureRemoteUrl(reference.id, secondClient, "env"))
        .resolves.toBe("https://env.example.com/reference.png");

      expect(firstClient.uploadReferenceImage).toHaveBeenCalledOnce();
      expect(secondClient.uploadReferenceImage).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
});

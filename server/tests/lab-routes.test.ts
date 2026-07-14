import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { registerLabRoutes } from "../src/lab/lab-routes.js";
import type { ProviderLabService } from "../src/lab/provider-lab-service.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("lab routes", () => {
  it("stores a relay key locally but returns only its mask", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-lab-routes-"));
    tempDirs.push(appDataDir);
    const app = await buildApp({
      envOverrides: { TOAPIS_API_KEY: "production-key", APP_DATA_DIR: appDataDir },
      backgroundProcessing: false
    });

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/lab/providers",
        payload: {
          name: "Relay A",
          baseUrl: "https://relay.example.com/v1/",
          apiKey: "secret-relay-key",
          notes: "Fast for 1K classroom images",
          enabled: true
        }
      });

      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        name: "Relay A",
        baseUrl: "https://relay.example.com/v1",
        apiKeyMask: "****-key",
        hasApiKey: true,
        notes: "Fast for 1K classroom images"
      });
      expect(created.body).not.toContain("secret-relay-key");

      const listed = await app.inject({ method: "GET", url: "/api/lab/providers" });
      expect(listed.statusCode).toBe(200);
      expect(listed.body).not.toContain("secret-relay-key");
      expect(readFileSync(join(appDataDir, "lab", "providers.json"), "utf8")).toContain("secret-relay-key");
    } finally {
      await app.close();
    }
  });

  it("keeps the existing key when editing with an empty key", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-lab-edit-"));
    tempDirs.push(appDataDir);
    const app = await buildApp({
      envOverrides: { TOAPIS_API_KEY: "production-key", APP_DATA_DIR: appDataDir },
      backgroundProcessing: false
    });

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/lab/providers",
        payload: { name: "Relay A", baseUrl: "https://relay.example.com/v1", apiKey: "keep-this-key", notes: "Initial note" }
      });
      const providerId = created.json().id as string;
      const updated = await app.inject({
        method: "PUT",
        url: `/api/lab/providers/${providerId}`,
        payload: { name: "Relay B", baseUrl: "https://relay.example.com/v1", apiKey: "", notes: "Updated test result", enabled: false }
      });

      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ name: "Relay B", enabled: false, apiKeyMask: "****-key", notes: "Updated test result" });
      expect(readFileSync(join(appDataDir, "lab", "providers.json"), "utf8")).toContain("keep-this-key");
    } finally {
      await app.close();
    }
  });

  it("parses a multipart reference image benchmark without changing the manual model", async () => {
    const runBenchmark = vi.fn().mockResolvedValue({ id: "run-1", status: "completed" });
    const labService = {
      runBenchmark,
      listProviders: vi.fn(),
      saveProvider: vi.fn(),
      checkProvider: vi.fn(),
      listBenchmarks: vi.fn(),
      getBenchmarkImage: vi.fn()
    } as unknown as ProviderLabService;
    const app = Fastify({ logger: false });
    await app.register(multipart);
    registerLabRoutes(app, labService);

    try {
      const form = new FormData();
      form.append("providerId", "00000000-0000-4000-8000-000000000001");
      form.append("prompt", "reference benchmark");
      form.append("model", "manual-image-model");
      form.append("aspectRatio", "16:9");
      form.append("resolution", "2K");
      form.append("referenceImage", new Blob(["reference-bytes"], { type: "image/png" }), "reference.png");
      const request = new Request("http://localhost/api/lab/benchmarks", { method: "POST", body: form });
      const response = await app.inject({
        method: "POST",
        url: "/api/lab/benchmarks",
        headers: Object.fromEntries(request.headers),
        payload: Buffer.from(await request.arrayBuffer())
      });

      expect(response.statusCode).toBe(201);
      expect(runBenchmark).toHaveBeenCalledWith(expect.objectContaining({
        model: "manual-image-model",
        referenceImage: expect.objectContaining({ filename: "reference.png", mimeType: "image/png" })
      }));
      const input = runBenchmark.mock.calls[0][0];
      expect(input.referenceImage.buffer.toString()).toBe("reference-bytes");
    } finally {
      await app.close();
    }
  });
});

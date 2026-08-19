import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { registerProviderSettingsRoutes } from "../src/routes/provider-settings-routes.js";
import { ProviderSettingsService } from "../src/services/provider-settings-service-v2.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("provider settings v2 routes", () => {
  it("creates a protocol provider and selects it for one role", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-provider-v2-routes-"));
    tempDirs.push(appDataDir);
    const service = new ProviderSettingsService(appDataDir, {
      environment: { apiKey: "env-key", maxConcurrency: 30 },
      hasRevisionDependency: () => false
    });
    const app = Fastify({ logger: false });
    registerProviderSettingsRoutes(app, service);

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/provider-settings",
        payload: {
          name: "YM2",
          baseUrl: "https://ym2.example.com/v1",
          apiKey: "route-secret",
          protocolType: "ym2-openai-images",
          maxConcurrency: 100,
          notes: ""
        }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        protocolType: "ym2-openai-images",
        maxConcurrency: 100,
        apiKeyMask: "****cret"
      });

      const selected = await app.inject({
        method: "POST",
        url: "/api/provider-settings/roles/image",
        payload: { providerId: created.json().id }
      });
      expect(selected.statusCode).toBe(200);
      expect(selected.json()).toMatchObject({ activeImageProviderId: created.json().id });
      expect(selected.body).not.toContain("route-secret");
    } finally {
      await app.close();
    }
  });

  it("rejects invalid roles and concurrency", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-provider-v2-validation-"));
    tempDirs.push(appDataDir);
    const service = new ProviderSettingsService(appDataDir, {
      environment: { apiKey: "env-key", maxConcurrency: 30 },
      hasRevisionDependency: () => false
    });
    const app = Fastify({ logger: false });
    registerProviderSettingsRoutes(app, service);

    try {
      const invalidProvider = await app.inject({
        method: "POST",
        url: "/api/provider-settings",
        payload: {
          name: "YM2",
          baseUrl: "https://ym2.example.com/v1",
          apiKey: "key",
          protocolType: "ym2-openai-images",
          maxConcurrency: 101
        }
      });
      const invalidRole = await app.inject({
        method: "POST",
        url: "/api/provider-settings/roles/unknown",
        payload: { providerId: "env:toapis" }
      });

      expect(invalidProvider.statusCode).toBe(400);
      expect(invalidRole.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

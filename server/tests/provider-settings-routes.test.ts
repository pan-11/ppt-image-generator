import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { registerProviderSettingsRoutes } from "../src/routes/provider-settings-routes.js";
import { ProviderSettingsService } from "../src/services/provider-settings-service.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("provider settings routes", () => {
  it("creates, edits, lists, and activates providers without exposing keys", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-provider-routes-"));
    tempDirs.push(appDataDir);
    const app = await buildApp({
      envOverrides: { TOAPIS_API_KEY: "env-key", APP_DATA_DIR: appDataDir },
      backgroundProcessing: false
    });

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/provider-settings",
        payload: {
          name: "Relay A",
          baseUrl: "https://relay.example.com/v1/",
          apiKey: "formal-secret-key",
          notes: "Primary"
        }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        name: "Relay A",
        baseUrl: "https://relay.example.com/v1",
        apiKeyMask: "****-key",
        hasApiKey: true,
        isActive: false
      });
      expect(created.body).not.toContain("formal-secret-key");
      const providerId = created.json().id as string;

      const updated = await app.inject({
        method: "PUT",
        url: `/api/provider-settings/${providerId}`,
        payload: {
          name: "Relay A updated",
          baseUrl: "https://relay.example.com/v2",
          apiKey: "",
          notes: "Updated"
        }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ name: "Relay A updated", apiKeyMask: "****-key" });

      const activated = await app.inject({
        method: "POST",
        url: `/api/provider-settings/${providerId}/activate`
      });
      expect(activated.statusCode).toBe(200);
      expect(activated.json()).toMatchObject({ activeProviderId: providerId, usingEnvFallback: false });

      const listed = await app.inject({ method: "GET", url: "/api/provider-settings" });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toMatchObject({
        activeProviderId: providerId,
        providers: [expect.objectContaining({ id: providerId, isActive: true })]
      });
      expect(listed.body).not.toContain("formal-secret-key");
      expect(readFileSync(join(appDataDir, "provider-settings.json"), "utf8")).toContain("formal-secret-key");
    } finally {
      await app.close();
    }
  });

  it("maps busy activation conflicts to HTTP 409", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-provider-conflict-"));
    tempDirs.push(appDataDir);
    let busy = false;
    const service = new ProviderSettingsService(appDataDir, () => busy);
    const provider = service.saveProvider({
      name: "Relay A",
      baseUrl: "https://relay.example.com/v1",
      apiKey: "formal-key"
    });
    const app = Fastify({ logger: false });
    registerProviderSettingsRoutes(app, service);
    busy = true;

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/provider-settings/${provider.id}/activate`
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ message: expect.stringContaining("当前任务") });
      expect(response.body).not.toContain("formal-key");
    } finally {
      await app.close();
    }
  });

  it("returns validation failures as HTTP 400", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-provider-validation-"));
    tempDirs.push(appDataDir);
    const app = Fastify({ logger: false });
    registerProviderSettingsRoutes(app, new ProviderSettingsService(appDataDir, () => false));

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/provider-settings",
        payload: { name: "", baseUrl: "not-a-url", apiKey: "" }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty("message");
    } finally {
      await app.close();
    }
  });
});

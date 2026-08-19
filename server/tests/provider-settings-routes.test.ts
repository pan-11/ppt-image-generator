import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { registerProviderSettingsRoutes } from "../src/routes/provider-settings-routes.js";
import { ProviderSettingsService } from "../src/services/provider-settings-service-v2.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("provider settings routes", () => {
  it("creates, edits, lists, and selects both roles without exposing keys", async () => {
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
          protocolType: "toapis-async",
          maxConcurrency: 12,
          notes: "Primary"
        }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        name: "Relay A",
        baseUrl: "https://relay.example.com/v1",
        apiKeyMask: "****-key",
        hasApiKey: true,
        protocolType: "toapis-async",
        maxConcurrency: 12,
        readonly: false
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
          protocolType: "toapis-async",
          maxConcurrency: 20,
          notes: "Updated"
        }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ name: "Relay A updated", apiKeyMask: "****-key" });

      const textRole = await app.inject({
        method: "POST",
        url: "/api/provider-settings/roles/text",
        payload: { providerId }
      });
      const imageRole = await app.inject({
        method: "POST",
        url: "/api/provider-settings/roles/image",
        payload: { providerId }
      });
      expect(textRole.statusCode).toBe(200);
      expect(imageRole.statusCode).toBe(200);

      const listed = await app.inject({ method: "GET", url: "/api/provider-settings" });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toMatchObject({
        activeTextProviderId: providerId,
        activeImageProviderId: providerId,
        providers: expect.arrayContaining([
          expect.objectContaining({ id: providerId, isActiveText: true, isActiveImage: true })
        ])
      });
      expect(listed.body).not.toContain("formal-secret-key");
      expect(readFileSync(join(appDataDir, "provider-settings.json"), "utf8")).toContain("formal-secret-key");
    } finally {
      await app.close();
    }
  });

  it("allows role switching while another provider revision is busy", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-provider-conflict-"));
    tempDirs.push(appDataDir);
    const service = new ProviderSettingsService(appDataDir, {
      environment: { apiKey: "env-key", maxConcurrency: 30 },
      hasRevisionDependency: () => true
    });
    const provider = service.saveProvider({
      name: "Relay A",
      baseUrl: "https://relay.example.com/v1",
      apiKey: "formal-key"
    });
    const app = Fastify({ logger: false });
    registerProviderSettingsRoutes(app, service);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/provider-settings/roles/text",
        payload: { providerId: provider.id }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ activeTextProviderId: provider.id });
      expect(response.body).not.toContain("formal-key");
    } finally {
      await app.close();
    }
  });

  it("returns validation failures as HTTP 400", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-provider-validation-"));
    tempDirs.push(appDataDir);
    const app = Fastify({ logger: false });
    registerProviderSettingsRoutes(app, new ProviderSettingsService(appDataDir, {
      environment: { apiKey: "env-key", maxConcurrency: 30 },
      hasRevisionDependency: () => false
    }));

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

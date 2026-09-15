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
  it.each(["grsai-draw", "cangyuan-images"])("persists and edits %s without leaking credentials", async (protocolType) => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-new-protocol-"));
    tempDirs.push(appDataDir);
    const options = {
      environment: { apiKey: "env-key", maxConcurrency: 30 },
      hasRevisionDependency: () => false
    };
    const service = new ProviderSettingsService(appDataDir, options);
    const app = Fastify({ logger: false });
    registerProviderSettingsRoutes(app, service);
    try {
      const payload = {
        name: protocolType, baseUrl: "https://relay.example.com",
        apiKey: "new-provider-secret", protocolType, maxConcurrency: 200
      };
      const created = await app.inject({ method: "POST", url: "/api/provider-settings", payload });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ protocolType, maxConcurrency: 200, apiKeyMask: "****cret" });
      expect(created.body).not.toContain(payload.apiKey);
      const id = created.json().id as string;
      const reloaded = new ProviderSettingsService(appDataDir, options);
      expect(reloaded.getConfiguredProvider(id)).toMatchObject({ protocolType, maxConcurrency: 200, apiKey: payload.apiKey });
      const edited = await app.inject({
        method: "PUT", url: `/api/provider-settings/${id}`,
        payload: { ...payload, name: "Updated relay", apiKey: "", maxConcurrency: 500 }
      });
      expect(edited.statusCode).toBe(200);
      expect(edited.json()).toMatchObject({ protocolType, maxConcurrency: 500, apiKeyMask: "****cret" });
      expect(new ProviderSettingsService(appDataDir, options).getConfiguredProvider(id)).toMatchObject({ maxConcurrency: 500 });
      expect(edited.body).not.toContain(payload.apiKey);
      const selected = await app.inject({
        method: "POST", url: "/api/provider-settings/roles/text", payload: { providerId: id }
      });
      expect(selected.statusCode).toBe(200);
      expect(selected.json()).toMatchObject({ activeTextProviderId: id, activeImageProviderId: "env:toapis" });
      expect(selected.body).not.toContain(payload.apiKey);
    } finally {
      await app.close();
    }
  });

  it("creates a model-product Yunfei provider without exposing its key", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-yunfei-routes-"));
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
          name: "云飞 香蕉2",
          baseUrl: "https://img.yunfei.best",
          apiKey: "route-yunfei-secret",
          protocolType: "yunfei-hybrid-images",
          yunfeiKeyType: "banana-2",
          maxConcurrency: 100
        }
      });

      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        protocolType: "yunfei-hybrid-images",
        yunfeiKeyType: "banana-2",
        apiKeyMask: "****cret"
      });
      expect(created.body).not.toContain("route-yunfei-secret");
    } finally {
      await app.close();
    }
  });

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
          maxConcurrency: 0
        }
      });
      const invalidRole = await app.inject({
        method: "POST",
        url: "/api/provider-settings/roles/unknown",
        payload: { providerId: "env:toapis" }
      });
      const missingKeyType = await app.inject({
        method: "POST",
        url: "/api/provider-settings",
        payload: {
          name: "云飞",
          baseUrl: "https://img.yunfei.best",
          apiKey: "key",
          protocolType: "yunfei-hybrid-images",
          maxConcurrency: 10
        }
      });
      const invalidKeyType = await app.inject({
        method: "POST",
        url: "/api/provider-settings",
        payload: {
          name: "云飞",
          baseUrl: "https://img.yunfei.best",
          apiKey: "key",
          protocolType: "yunfei-hybrid-images",
          yunfeiKeyType: "banana-ultra",
          maxConcurrency: 10
        }
      });

      expect(invalidProvider.statusCode).toBe(400);
      expect(invalidRole.statusCode).toBe(400);
      expect(missingKeyType.statusCode).toBe(400);
      expect(missingKeyType.json()).toMatchObject({ message: "请选择云飞密钥类型" });
      expect(invalidKeyType.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

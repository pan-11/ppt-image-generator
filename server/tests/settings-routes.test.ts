import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("settings routes", () => {
  it.each([
    ["grsai-draw", "https://grsai.dakka.com.cn", [
      { value: "gpt-image-2", resolutions: ["1K"] },
      { value: "gpt-image-2-vip", resolutions: ["1K", "2K", "4K"] }
    ]],
    ["cangyuan-images", "https://ai.cangyuansuanli.cn", [
      { value: "gpt-image-2", resolutions: ["standard"] },
      { value: "gpt-image-2-1k", resolutions: ["1K"] },
      { value: "gpt-image-2-2k", resolutions: ["2K"] },
      { value: "gpt-image-2-4k", resolutions: ["4K"] }
    ]]
  ] as const)("registers %s with matching capabilities for each role", async (protocolType, baseUrl, models) => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-new-relay-settings-"));
    tempDirs.push(appDataDir);
    const options = { envOverrides: { TOAPIS_API_KEY: "test-key", APP_DATA_DIR: appDataDir }, backgroundProcessing: false };
    const app = await buildApp(options);
    let providerId: string;
    try {
      const created = await app.inject({
        method: "POST", url: "/api/provider-settings",
        payload: { name: protocolType, baseUrl, apiKey: "fake-secret", protocolType, maxConcurrency: 4 }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().capabilities).toEqual({ text: true, image: true });
      providerId = created.json().id;
      for (const role of ["text", "image"]) {
        const selected = await app.inject({ method: "POST", url: `/api/provider-settings/roles/${role}`, payload: { providerId } });
        expect(selected.statusCode).toBe(200);
        const settings = await app.inject({ method: "GET", url: "/api/settings" });
        expect(settings.statusCode).toBe(200);
        expect(settings.json().roles[role]).toMatchObject({ providerId, protocolType, maxConcurrency: 4, models: [...models] });
        expect(settings.body).not.toContain("fake-secret");
      }
    } finally { await app.close(); }
    const reopened = await buildApp(options);
    try {
      const settings = await reopened.inject({ method: "GET", url: "/api/settings" });
      expect(settings.statusCode).toBe(200);
      expect(settings.json().roles.image).toMatchObject({ providerId, protocolType });
    } finally { await reopened.close(); }
  });

  it("returns exactly one Yunfei model with resolutions filtered by key product", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-yunfei-settings-"));
    tempDirs.push(appDataDir);
    const app = await buildApp({
      envOverrides: { TOAPIS_API_KEY: "test-key", APP_DATA_DIR: appDataDir },
      backgroundProcessing: false
    });

    try {
      const productCases = [
        ["云飞 GPT 1K", "gpt-image-2-1k", "gpt-image-2", ["1K"]],
        ["云飞 GPT 4K", "gpt-image-2-4k", "gpt-image-2", ["1K", "2K", "4K"]],
        ["云飞 香蕉2", "banana-2", "gemini-3.1-flash-image-preview", ["1K", "2K", "4K"]],
        ["云飞 香蕉Pro", "banana-pro", "gemini-3-pro-image-preview", ["1K", "2K", "4K"]]
      ] as const;
      const createProvider = async (name: string, yunfeiKeyType: string) => {
        const response = await app.inject({
          method: "POST",
          url: "/api/provider-settings",
          payload: {
            name,
            baseUrl: "https://img.yunfei.best",
            apiKey: `${name}-key`,
            protocolType: "yunfei-hybrid-images",
            yunfeiKeyType,
            maxConcurrency: 100
          }
        });
        expect(response.statusCode).toBe(201);
        return response.json().id as string;
      };
      const providers = [];
      for (const [name, yunfeiKeyType, model, resolutions] of productCases) {
        const providerId = await createProvider(name, yunfeiKeyType);
        providers.push(providerId);
        await app.inject({
          method: "POST",
          url: "/api/provider-settings/roles/text",
          payload: { providerId }
        });
        const response = await app.inject({ method: "GET", url: "/api/settings" });
        expect(response.statusCode).toBe(200);
        expect(response.json().roles.text).toMatchObject({
          providerId,
          models: [{ value: model, resolutions: [...resolutions] }]
        });
      }

      await app.inject({
        method: "POST",
        url: "/api/provider-settings/roles/image",
        payload: { providerId: providers[3] }
      });
      const response = await app.inject({ method: "GET", url: "/api/settings" });
      expect(response.json().roles.image).toMatchObject({
        providerId: providers[3],
        models: [{
          value: "gemini-3-pro-image-preview",
          resolutions: ["1K", "2K", "4K"]
        }]
      });
    } finally {
      await app.close();
    }
  });

  it("returns provider capabilities independently for text and image roles", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-role-settings-"));
    tempDirs.push(appDataDir);
    const app = await buildApp({
      envOverrides: {
        TOAPIS_API_KEY: "test-key",
        APP_DATA_DIR: appDataDir
      },
      backgroundProcessing: false
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/provider-settings",
      payload: {
        name: "YM2",
        baseUrl: "https://ym2.example.com/v1",
        apiKey: "ym2-key",
        protocolType: "ym2-openai-images",
        maxConcurrency: 100
      }
    });
    const providerId = created.json().id as string;
    await app.inject({
      method: "POST",
      url: "/api/provider-settings/roles/text",
      payload: { providerId }
    });

    const response = await app.inject({ method: "GET", url: "/api/settings" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      maxBatchSize: 100,
      roles: {
        text: {
          providerId,
          providerName: "YM2",
          protocolType: "ym2-openai-images",
          maxConcurrency: 100,
          models: [expect.objectContaining({
            value: "gpt-image-2",
            aspectRatios: ["16:9"],
            resolutions: ["1K", "2K", "4K"]
          })]
        },
        image: {
          providerId: "env:toapis",
          providerName: "环境默认 ToAPIs",
          protocolType: "toapis-async",
          maxConcurrency: 30,
          models: expect.arrayContaining([
            expect.objectContaining({ value: "gpt-image-2" })
          ])
        }
      }
    });

    await app.close();
  });

  it("returns 409 instead of silently falling back when a legacy provider has no protocol", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-legacy-role-settings-"));
    tempDirs.push(appDataDir);
    writeFileSync(join(appDataDir, "provider-settings.json"), JSON.stringify({
      activeProviderId: "legacy-provider",
      providers: [{
        id: "legacy-provider",
        name: "旧中转站",
        baseUrl: "https://legacy.example.com/v1",
        apiKey: "legacy-key",
        notes: "",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      }]
    }));
    const app = await buildApp({
      envOverrides: { TOAPIS_API_KEY: "test-key", APP_DATA_DIR: appDataDir },
      backgroundProcessing: false
    });

    try {
      const response = await app.inject({ method: "GET", url: "/api/settings" });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ message: "请先为“旧中转站”选择协议类型" });
    } finally {
      await app.close();
    }
  });
});

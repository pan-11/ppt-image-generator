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
  it("returns all Yunfei models with resolutions filtered by key tier for both roles", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-yunfei-settings-"));
    tempDirs.push(appDataDir);
    const app = await buildApp({
      envOverrides: { TOAPIS_API_KEY: "test-key", APP_DATA_DIR: appDataDir },
      backgroundProcessing: false
    });

    try {
      const createProvider = async (name: string, resolutionTier: "1K" | "4K") => {
        const response = await app.inject({
          method: "POST",
          url: "/api/provider-settings",
          payload: {
            name,
            baseUrl: "https://img.yunfei.best",
            apiKey: `${name}-key`,
            protocolType: "yunfei-hybrid-images",
            resolutionTier,
            maxConcurrency: 100
          }
        });
        expect(response.statusCode).toBe(201);
        return response.json().id as string;
      };
      const oneKId = await createProvider("云飞 1K", "1K");
      const fourKId = await createProvider("云飞 4K", "4K");

      await app.inject({
        method: "POST",
        url: "/api/provider-settings/roles/text",
        payload: { providerId: oneKId }
      });
      let response = await app.inject({ method: "GET", url: "/api/settings" });
      const oneKModels = response.json().roles.text.models as Array<{
        value: string;
        resolutions: string[];
      }>;
      expect(oneKModels.map((model) => model.value)).toEqual([
        "gpt-image-2",
        "gemini-3.1-flash-image-preview",
        "gemini-3-pro-image-preview"
      ]);
      expect(oneKModels.every((model) => (
        JSON.stringify(model.resolutions) === JSON.stringify(["1K"])
      ))).toBe(true);

      await app.inject({
        method: "POST",
        url: "/api/provider-settings/roles/text",
        payload: { providerId: fourKId }
      });
      await app.inject({
        method: "POST",
        url: "/api/provider-settings/roles/image",
        payload: { providerId: fourKId }
      });
      response = await app.inject({ method: "GET", url: "/api/settings" });
      const settings = response.json();
      for (const role of [settings.roles.text, settings.roles.image]) {
        expect(role.providerId).toBe(fourKId);
        expect(role.models.every((model: { resolutions: string[] }) => (
          JSON.stringify(model.resolutions) === JSON.stringify(["1K", "2K", "4K"])
        ))).toBe(true);
      }
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

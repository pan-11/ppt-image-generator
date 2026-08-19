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

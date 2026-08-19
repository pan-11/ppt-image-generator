import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ENV_PROVIDER_ID,
  ProviderSettingsError,
  ProviderSettingsService
} from "../src/services/provider-settings-service-v2.js";

const tempDirs: string[] = [];

function createService(hasDependency = () => false) {
  const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-provider-v2-"));
  tempDirs.push(appDataDir);
  return {
    appDataDir,
    service: new ProviderSettingsService(appDataDir, {
      environment: {
        apiKey: "environment-secret",
        maxConcurrency: 30
      },
      hasRevisionDependency: hasDependency
    })
  };
}

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("ProviderSettingsService v2", () => {
  it("stores every masked Yunfei key product and requires it only for that protocol", () => {
    const { service } = createService();
    const products = [
      "gpt-image-2-1k",
      "gpt-image-2-4k",
      "banana-2",
      "banana-pro"
    ] as const;

    for (const yunfeiKeyType of products) {
      const saved = service.saveProvider({
        name: yunfeiKeyType,
        baseUrl: "https://img.yunfei.best/v1/",
        apiKey: "yunfei-secret-4321",
        protocolType: "yunfei-hybrid-images",
        yunfeiKeyType,
        maxConcurrency: 100,
        notes: "model product key"
      });

      expect(saved).toMatchObject({
        protocolType: "yunfei-hybrid-images",
        yunfeiKeyType,
        apiKeyMask: "****4321"
      });
      expect(JSON.stringify(saved)).not.toContain("yunfei-secret-4321");
      expect(service.getConfiguredProvider(saved.id)).toMatchObject({
        protocolType: "yunfei-hybrid-images",
        yunfeiKeyType
      });
    }
    expect(() => service.saveProvider({
      name: "云飞缺类型",
      baseUrl: "https://img.yunfei.best",
      apiKey: "missing-product",
      protocolType: "yunfei-hybrid-images",
      maxConcurrency: 1
    })).toThrow("请选择云飞密钥类型");

    const ym2 = service.saveProvider({
      name: "YM2",
      baseUrl: "https://ym2.example.com/v1",
      apiKey: "ym2-key",
      protocolType: "ym2-openai-images",
      yunfeiKeyType: "banana-2",
      maxConcurrency: 1
    });
    expect(service.getConfiguredProvider(ym2.id)).not.toHaveProperty("yunfeiKeyType");
  });

  it("stores protocol and concurrency while selecting text and image roles independently", () => {
    const { appDataDir, service } = createService();
    const ym2 = service.saveProvider({
      name: "YM2",
      baseUrl: "https://ym2.example.com/v1/",
      apiKey: "ym2-secret-1234",
      protocolType: "ym2-openai-images",
      maxConcurrency: 100,
      notes: "main"
    });

    service.setRoleProvider("text", ym2.id);
    service.setRoleProvider("image", ENV_PROVIDER_ID);

    const state = service.getPublicState();
    expect(state).toMatchObject({
      activeTextProviderId: ym2.id,
      activeImageProviderId: ENV_PROVIDER_ID,
      providers: expect.arrayContaining([
        expect.objectContaining({
          id: ym2.id,
          protocolType: "ym2-openai-images",
          maxConcurrency: 100,
          apiKeyMask: "****1234",
          isActiveText: true,
          isActiveImage: false,
          readonly: false
        }),
        expect.objectContaining({
          id: ENV_PROVIDER_ID,
          protocolType: "toapis-async",
          maxConcurrency: 30,
          readonly: true,
          isActiveImage: true
        })
      ])
    });
    expect(JSON.stringify(state)).not.toContain("environment-secret");
    expect(JSON.stringify(state)).not.toContain("ym2-secret-1234");
    expect(readFileSync(join(appDataDir, "provider-settings.json"), "utf8"))
      .not.toContain("environment-secret");
  });

  it("allows role switching while a provider revision is in use", () => {
    const { service } = createService(() => true);
    const first = service.saveProvider({
      name: "A",
      baseUrl: "https://a.example.com/v1",
      apiKey: "key-a",
      protocolType: "toapis-async",
      maxConcurrency: 2
    });
    const second = service.saveProvider({
      name: "B",
      baseUrl: "https://b.example.com/v1",
      apiKey: "key-b",
      protocolType: "ym2-openai-images",
      maxConcurrency: 100
    });
    service.setRoleProvider("text", first.id);

    expect(service.setRoleProvider("text", second.id).activeTextProviderId).toBe(second.id);
  });

  it("rotates revisions only for remote configuration changes and blocks unsafe edits", () => {
    let dependency = false;
    const { service } = createService(() => dependency);
    const created = service.saveProvider({
      name: "Relay",
      baseUrl: "https://relay.example.com/v1",
      apiKey: "key-a",
      protocolType: "toapis-async",
      maxConcurrency: 3,
      notes: "first"
    });
    const originalRevision = service.getConfiguredProvider(created.id).configRevision;

    service.saveProvider({
      id: created.id,
      name: "Relay renamed",
      baseUrl: "https://relay.example.com/v1",
      apiKey: "",
      protocolType: "toapis-async",
      maxConcurrency: 9,
      notes: "second"
    });
    expect(service.getConfiguredProvider(created.id).configRevision).toBe(originalRevision);

    dependency = true;
    expect(() => service.saveProvider({
      id: created.id,
      name: "Relay renamed",
      baseUrl: "https://relay.example.com/v2",
      apiKey: "",
      protocolType: "toapis-async",
      maxConcurrency: 9,
      notes: "second"
    })).toThrowError(expect.objectContaining<Partial<ProviderSettingsError>>({ statusCode: 409 }));

    dependency = false;
    service.saveProvider({
      id: created.id,
      name: "Relay renamed",
      baseUrl: "https://relay.example.com/v2",
      apiKey: "",
      protocolType: "ym2-openai-images",
      maxConcurrency: 9,
      notes: "second"
    });
    expect(service.getConfiguredProvider(created.id).configRevision).not.toBe(originalRevision);
  });

  it("treats a Yunfei key product edit as a guarded remote configuration change", () => {
    let dependency = false;
    const { service } = createService(() => dependency);
    const created = service.saveProvider({
      name: "云飞",
      baseUrl: "https://img.yunfei.best",
      apiKey: "key",
      protocolType: "yunfei-hybrid-images",
      yunfeiKeyType: "banana-2",
      maxConcurrency: 10
    });
    const originalRevision = service.getConfiguredProvider(created.id).configRevision;

    dependency = true;
    expect(() => service.saveProvider({
      id: created.id,
      name: "云飞",
      baseUrl: "https://img.yunfei.best",
      apiKey: "",
      protocolType: "yunfei-hybrid-images",
      yunfeiKeyType: "banana-pro",
      maxConcurrency: 10
    })).toThrowError(expect.objectContaining<Partial<ProviderSettingsError>>({ statusCode: 409 }));

    dependency = false;
    service.saveProvider({
      id: created.id,
      name: "云飞",
      baseUrl: "https://img.yunfei.best",
      apiKey: "",
      protocolType: "yunfei-hybrid-images",
      yunfeiKeyType: "banana-pro",
      maxConcurrency: 10
    });
    expect(service.getConfiguredProvider(created.id)).toMatchObject({
      yunfeiKeyType: "banana-pro"
    });
    expect(service.getConfiguredProvider(created.id).configRevision).not.toBe(originalRevision);
  });

  it("normalizes legacy active-provider files without guessing their protocol", () => {
    const { appDataDir, service } = createService();
    writeFileSync(join(appDataDir, "provider-settings.json"), JSON.stringify({
      activeProviderId: "legacy-provider",
      providers: [{
        id: "legacy-provider",
        name: "Legacy",
        baseUrl: "https://legacy.example.com/v1",
        apiKey: "legacy-key",
        notes: "",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      }]
    }));

    const state = service.getPublicState();
    expect(state).toMatchObject({
      activeTextProviderId: "legacy-provider",
      activeImageProviderId: "legacy-provider",
      providers: expect.arrayContaining([
        expect.objectContaining({ id: "legacy-provider", protocolType: "unconfigured" })
      ])
    });
    expect(() => service.getRoleProvider("text")).toThrow("选择协议类型");
  });
});

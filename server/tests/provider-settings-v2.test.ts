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

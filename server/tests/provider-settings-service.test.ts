import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ProviderSettingsError,
  ProviderSettingsService
} from "../src/services/provider-settings-service.js";

const tempDirs: string[] = [];

function createService(isBusy = false) {
  const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-provider-settings-"));
  tempDirs.push(appDataDir);
  return {
    appDataDir,
    service: new ProviderSettingsService(appDataDir, () => isBusy)
  };
}

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("ProviderSettingsService", () => {
  it("persists providers while exposing only masked keys", () => {
    const { appDataDir, service } = createService();

    const created = service.saveProvider({
      name: " Relay A ",
      baseUrl: "https://relay.example.com/v1/",
      apiKey: "secret-provider-key",
      notes: " Primary relay "
    });
    const state = service.getPublicState();
    const stored = readFileSync(join(appDataDir, "provider-settings.json"), "utf8");

    expect(created).toMatchObject({
      name: "Relay A",
      baseUrl: "https://relay.example.com/v1",
      notes: "Primary relay",
      apiKeyMask: "****-key",
      hasApiKey: true,
      isActive: false
    });
    expect(state).toMatchObject({
      activeProviderId: null,
      usingEnvFallback: true,
      providers: [expect.objectContaining({ id: created.id, apiKeyMask: "****-key" })]
    });
    expect(JSON.stringify(state)).not.toContain("secret-provider-key");
    expect(stored).toContain("secret-provider-key");
  });

  it("keeps the stored key when editing with an empty key", () => {
    const { appDataDir, service } = createService();
    const created = service.saveProvider({
      name: "Relay A",
      baseUrl: "https://relay.example.com/v1",
      apiKey: "keep-this-key"
    });

    const updated = service.saveProvider({
      id: created.id,
      name: "Relay B",
      baseUrl: "https://relay.example.com/v2/",
      apiKey: "",
      notes: "Updated"
    });
    const stored = readFileSync(join(appDataDir, "provider-settings.json"), "utf8");

    expect(updated).toMatchObject({
      name: "Relay B",
      baseUrl: "https://relay.example.com/v2",
      apiKeyMask: "****-key"
    });
    expect(stored).toContain("keep-this-key");
  });

  it("persists the active provider across service instances", () => {
    const { appDataDir, service } = createService();
    const created = service.saveProvider({
      name: "Relay A",
      baseUrl: "https://relay.example.com/v1",
      apiKey: "provider-key"
    });

    service.activateProvider(created.id);
    const reloaded = new ProviderSettingsService(appDataDir, () => false);

    expect(reloaded.getActiveProviderId()).toBe(created.id);
    expect(reloaded.getActiveProvider()).toMatchObject({ id: created.id, apiKey: "provider-key" });
    expect(reloaded.getPublicState()).toMatchObject({
      activeProviderId: created.id,
      usingEnvFallback: false,
      providers: [expect.objectContaining({ id: created.id, isActive: true })]
    });
  });

  it("blocks activation and active-provider edits while production is busy", () => {
    let busy = false;
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-provider-busy-"));
    tempDirs.push(appDataDir);
    const service = new ProviderSettingsService(appDataDir, () => busy);
    const first = service.saveProvider({
      name: "Relay A",
      baseUrl: "https://a.example.com/v1",
      apiKey: "key-a"
    });
    const second = service.saveProvider({
      name: "Relay B",
      baseUrl: "https://b.example.com/v1",
      apiKey: "key-b"
    });
    service.activateProvider(first.id);
    busy = true;

    expect(() => service.activateProvider(second.id)).toThrowError(
      expect.objectContaining<Partial<ProviderSettingsError>>({ statusCode: 409 })
    );
    expect(() => service.saveProvider({
      id: first.id,
      name: "Relay A edited",
      baseUrl: "https://a.example.com/v1",
      apiKey: ""
    })).toThrowError(expect.objectContaining<Partial<ProviderSettingsError>>({ statusCode: 409 }));
    expect(service.saveProvider({
      id: second.id,
      name: "Relay B edited",
      baseUrl: "https://b.example.com/v1",
      apiKey: ""
    })).toMatchObject({ name: "Relay B edited" });
  });

  it("rejects invalid input and missing provider IDs", () => {
    const { service } = createService();

    expect(() => service.saveProvider({
      name: "Relay",
      baseUrl: "ftp://relay.example.com/v1",
      apiKey: "key"
    })).toThrowError(expect.objectContaining<Partial<ProviderSettingsError>>({ statusCode: 400 }));
    expect(() => service.saveProvider({
      id: "missing",
      name: "Relay",
      baseUrl: "https://relay.example.com/v1",
      apiKey: ""
    })).toThrowError(expect.objectContaining<Partial<ProviderSettingsError>>({ statusCode: 404 }));
    expect(() => service.saveProvider({
      name: "Relay",
      baseUrl: "https://relay.example.com/v1",
      apiKey: "key",
      notes: "x".repeat(2001)
    })).toThrowError(expect.objectContaining<Partial<ProviderSettingsError>>({ statusCode: 400 }));
    expect(() => service.activateProvider("missing")).toThrowError(
      expect.objectContaining<Partial<ProviderSettingsError>>({ statusCode: 404 })
    );
  });

  it("reports invalid persisted settings as a server error", () => {
    const { appDataDir, service } = createService();
    writeFileSync(join(appDataDir, "provider-settings.json"), "[]\n", "utf8");

    expect(() => service.getPublicState()).toThrowError(
      expect.objectContaining<Partial<ProviderSettingsError>>({ statusCode: 500 })
    );
  });
});

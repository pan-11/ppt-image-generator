import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

export type StoredProviderSettings = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type ProviderSettingsFile = {
  activeProviderId: string | null;
  providers: StoredProviderSettings[];
};

export class ProviderSettingsError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "ProviderSettingsError";
  }
}

function normalizeBaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new ProviderSettingsError(400, "Base URL 仅支持 http 或 https");
  }
}

function maskApiKey(apiKey: string) {
  return `****${apiKey.slice(-4)}`;
}

function isStoredProvider(value: unknown): value is StoredProviderSettings {
  if (!value || typeof value !== "object") {
    return false;
  }
  const provider = value as Record<string, unknown>;
  return ["id", "name", "baseUrl", "apiKey", "notes", "createdAt", "updatedAt"]
    .every((key) => typeof provider[key] === "string");
}

export class ProviderSettingsService {
  private readonly settingsFile: string;

  constructor(
    appDataDir: string,
    private readonly isProductionBusy: () => boolean
  ) {
    const resolvedAppDataDir = resolve(appDataDir);
    mkdirSync(resolvedAppDataDir, { recursive: true });
    this.settingsFile = join(resolvedAppDataDir, "provider-settings.json");
  }

  getPublicState() {
    const settings = this.readSettings();
    return {
      activeProviderId: settings.activeProviderId,
      usingEnvFallback: settings.activeProviderId === null,
      providers: settings.providers.map((provider) => this.toPublicProvider(
        provider,
        provider.id === settings.activeProviderId
      ))
    };
  }

  saveProvider(input: {
    id?: string;
    name: string;
    baseUrl: string;
    apiKey?: string;
    notes?: string;
  }) {
    const settings = this.readSettings();
    const current = input.id
      ? settings.providers.find((provider) => provider.id === input.id)
      : undefined;

    if (input.id && !current) {
      throw new ProviderSettingsError(404, "中转站不存在");
    }
    if (current?.id === settings.activeProviderId && this.isProductionBusy()) {
      throw new ProviderSettingsError(409, "请等待当前任务完成后再编辑正在使用的中转站");
    }

    const name = input.name.trim();
    if (!name) {
      throw new ProviderSettingsError(400, "请填写中转站名称");
    }
    if ((input.notes?.length ?? 0) > 2000) {
      throw new ProviderSettingsError(400, "备注不能超过 2000 个字符");
    }
    const apiKey = input.apiKey?.trim() || current?.apiKey;
    if (!apiKey) {
      throw new ProviderSettingsError(400, "请填写 API Key");
    }

    const now = new Date().toISOString();
    const provider: StoredProviderSettings = {
      id: current?.id ?? randomUUID(),
      name,
      baseUrl: normalizeBaseUrl(input.baseUrl.trim()),
      apiKey,
      notes: input.notes?.trim() ?? current?.notes ?? "",
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    };
    const nextSettings: ProviderSettingsFile = {
      ...settings,
      providers: current
        ? settings.providers.map((item) => item.id === current.id ? provider : item)
        : [...settings.providers, provider]
    };
    this.writeSettings(nextSettings);
    return this.toPublicProvider(provider, provider.id === settings.activeProviderId);
  }

  activateProvider(providerId: string) {
    const settings = this.readSettings();
    const provider = settings.providers.find((item) => item.id === providerId);
    if (!provider) {
      throw new ProviderSettingsError(404, "中转站不存在");
    }
    if (this.isProductionBusy()) {
      throw new ProviderSettingsError(409, "请等待当前任务完成后再切换中转站");
    }
    this.writeSettings({ ...settings, activeProviderId: providerId });
    return this.getPublicState();
  }

  getActiveProviderId() {
    return this.readSettings().activeProviderId;
  }

  getActiveProvider() {
    const settings = this.readSettings();
    if (!settings.activeProviderId) {
      return null;
    }
    const provider = settings.providers.find((item) => item.id === settings.activeProviderId);
    if (!provider) {
      throw new ProviderSettingsError(500, "当前中转站配置不存在");
    }
    return provider;
  }

  getProvider(providerId: string) {
    const provider = this.readSettings().providers.find((item) => item.id === providerId);
    if (!provider) {
      throw new ProviderSettingsError(404, "中转站不存在");
    }
    return provider;
  }

  private toPublicProvider(provider: StoredProviderSettings, isActive: boolean) {
    const { apiKey, ...publicProvider } = provider;
    return {
      ...publicProvider,
      apiKeyMask: maskApiKey(apiKey),
      hasApiKey: Boolean(apiKey),
      isActive
    };
  }

  private readSettings(): ProviderSettingsFile {
    if (!existsSync(this.settingsFile)) {
      return { activeProviderId: null, providers: [] };
    }
    try {
      const parsed = JSON.parse(readFileSync(this.settingsFile, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("invalid settings");
      }
      const settings = parsed as Record<string, unknown>;
      const activeProviderId = settings.activeProviderId;
      const providers = settings.providers;
      if ((activeProviderId !== null && typeof activeProviderId !== "string")
        || !Array.isArray(providers)
        || !providers.every(isStoredProvider)) {
        throw new Error("invalid settings");
      }
      return { activeProviderId, providers };
    } catch (error) {
      if (error instanceof ProviderSettingsError) {
        throw error;
      }
      throw new ProviderSettingsError(500, "中转站配置文件格式无效");
    }
  }

  private writeSettings(settings: ProviderSettingsFile) {
    writeFileSync(this.settingsFile, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }
}

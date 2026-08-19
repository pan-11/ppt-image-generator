import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isProtocolType, type GenerationMode, type ProtocolType, type ProviderRuntimeConfig } from "../providers/provider-adapter.js";

export const ENV_PROVIDER_ID = "env:toapis";

export type StoredProviderSettings = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocolType: ProtocolType | "unconfigured";
  maxConcurrency: number;
  configRevision: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type ProviderSettingsFile = {
  activeTextProviderId: string;
  activeImageProviderId: string;
  providers: StoredProviderSettings[];
};

type ProviderSettingsOptions = {
  environment: { apiKey: string; maxConcurrency: number; baseUrl?: string };
  hasRevisionDependency: (providerId: string, providerRevision: string) => boolean;
  protocolCapabilities?: (
    protocolType: ProtocolType | "unconfigured"
  ) => { text: boolean; image: boolean };
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
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid protocol");
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new ProviderSettingsError(400, "Base URL 仅支持 http 或 https");
  }
}

function maskApiKey(apiKey: string) {
  return `****${apiKey.slice(-4)}`;
}

function normalizeStoredProvider(value: unknown): StoredProviderSettings | null {
  if (!value || typeof value !== "object") return null;
  const provider = value as Record<string, unknown>;
  const required = ["id", "name", "baseUrl", "apiKey", "notes", "createdAt", "updatedAt"];
  if (!required.every((key) => typeof provider[key] === "string")) return null;
  const protocolType = isProtocolType(provider.protocolType) ? provider.protocolType : "unconfigured";
  const maxConcurrency = typeof provider.maxConcurrency === "number"
    && Number.isInteger(provider.maxConcurrency)
    && provider.maxConcurrency >= 1
    && provider.maxConcurrency <= 100
    ? provider.maxConcurrency
    : 1;
  const id = String(provider.id);
  const updatedAt = String(provider.updatedAt);
  return {
    id,
    name: String(provider.name),
    baseUrl: String(provider.baseUrl),
    apiKey: String(provider.apiKey),
    protocolType,
    maxConcurrency,
    configRevision: typeof provider.configRevision === "string"
      ? provider.configRevision
      : `legacy:${id}:${updatedAt}`,
    notes: String(provider.notes),
    createdAt: String(provider.createdAt),
    updatedAt
  };
}

export class ProviderSettingsService {
  private readonly settingsFile: string;
  private readonly environmentProvider: ProviderRuntimeConfig;
  private readonly hasRevisionDependency: ProviderSettingsOptions["hasRevisionDependency"];
  private readonly protocolCapabilities: NonNullable<ProviderSettingsOptions["protocolCapabilities"]>;

  constructor(appDataDir: string, options: ProviderSettingsOptions) {
    const resolvedAppDataDir = resolve(appDataDir);
    mkdirSync(resolvedAppDataDir, { recursive: true });
    this.settingsFile = join(resolvedAppDataDir, "provider-settings.json");
    this.hasRevisionDependency = options.hasRevisionDependency;
    this.protocolCapabilities = options.protocolCapabilities ?? ((protocolType) => ({
      text: protocolType !== "unconfigured",
      image: protocolType !== "unconfigured"
    }));
    const baseUrl = options.environment.baseUrl ?? "https://toapis.com/v1";
    this.environmentProvider = {
      id: ENV_PROVIDER_ID,
      name: "环境默认 ToAPIs",
      baseUrl,
      apiKey: options.environment.apiKey,
      protocolType: "toapis-async",
      configRevision: `env:toapis:${createHash("sha256")
        .update(`${baseUrl}\0${options.environment.apiKey}`)
        .digest("hex")
        .slice(0, 16)}`,
      maxConcurrency: options.environment.maxConcurrency
    };
  }

  getPublicState() {
    const settings = this.readSettings();
    const environmentPublic = this.toPublicProvider({
      ...this.environmentProvider,
      notes: "来自 .env",
      createdAt: "",
      updatedAt: ""
    }, settings, true);
    return {
      activeTextProviderId: settings.activeTextProviderId,
      activeImageProviderId: settings.activeImageProviderId,
      activeProviderId: settings.activeTextProviderId === ENV_PROVIDER_ID
        ? null
        : settings.activeTextProviderId,
      usingEnvFallback: settings.activeTextProviderId === ENV_PROVIDER_ID,
      providers: [
        environmentPublic,
        ...settings.providers.map((provider) => this.toPublicProvider(provider, settings, false))
      ]
    };
  }

  saveProvider(input: {
    id?: string;
    name: string;
    baseUrl: string;
    apiKey?: string;
    protocolType?: ProtocolType;
    maxConcurrency?: number;
    notes?: string;
  }) {
    const settings = this.readSettings();
    const current = input.id
      ? settings.providers.find((provider) => provider.id === input.id)
      : undefined;
    if (input.id && !current) throw new ProviderSettingsError(404, "中转站不存在");

    const name = input.name.trim();
    if (!name) throw new ProviderSettingsError(400, "请填写中转站名称");
    if ((input.notes?.length ?? 0) > 2000) {
      throw new ProviderSettingsError(400, "备注不能超过 2000 个字符");
    }
    const apiKey = input.apiKey?.trim() || current?.apiKey;
    if (!apiKey) throw new ProviderSettingsError(400, "请填写 API Key");
    const protocolType = input.protocolType ?? (
      current?.protocolType && current.protocolType !== "unconfigured"
        ? current.protocolType
        : "toapis-async"
    );
    const maxConcurrency = input.maxConcurrency ?? current?.maxConcurrency ?? 30;
    if (!Number.isInteger(maxConcurrency)
      || maxConcurrency < 1
      || maxConcurrency > 100) {
      throw new ProviderSettingsError(400, "最大并发必须是 1 到 100 的整数");
    }
    const baseUrl = normalizeBaseUrl(input.baseUrl.trim());
    const remoteConfigurationChanged = Boolean(current) && (
      current?.baseUrl !== baseUrl
      || current.apiKey !== apiKey
      || current.protocolType !== protocolType
    );
    if (current && remoteConfigurationChanged
      && this.hasRevisionDependency(current.id, current.configRevision)) {
      throw new ProviderSettingsError(409, "仍有远程任务依赖当前中转站配置，请先完成或处理这些任务");
    }

    const now = new Date().toISOString();
    const provider: StoredProviderSettings = {
      id: current?.id ?? randomUUID(),
      name,
      baseUrl,
      apiKey,
      protocolType,
      maxConcurrency,
      configRevision: current && !remoteConfigurationChanged ? current.configRevision : randomUUID(),
      notes: input.notes?.trim() ?? current?.notes ?? "",
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    };
    const nextSettings = {
      ...settings,
      providers: current
        ? settings.providers.map((item) => item.id === current.id ? provider : item)
        : [...settings.providers, provider]
    };
    this.writeSettings(nextSettings);
    return this.toPublicProvider(provider, settings, false);
  }

  setRoleProvider(role: GenerationMode, providerId: string) {
    const settings = this.readSettings();
    const provider = this.getConfiguredProvider(providerId);
    if (!this.protocolCapabilities(provider.protocolType)[role]) {
      throw new ProviderSettingsError(400, `中转站“${provider.name}”不支持${role === "text" ? "文生图" : "图生图"}`);
    }
    this.writeSettings({
      ...settings,
      ...(role === "text"
        ? { activeTextProviderId: providerId }
        : { activeImageProviderId: providerId })
    });
    return this.getPublicState();
  }

  activateProvider(providerId: string) {
    const settings = this.readSettings();
    this.getConfiguredProvider(providerId);
    this.writeSettings({
      ...settings,
      activeTextProviderId: providerId,
      activeImageProviderId: providerId
    });
    return this.getPublicState();
  }

  getRoleProvider(role: GenerationMode) {
    const settings = this.readSettings();
    return this.getConfiguredProvider(
      role === "text" ? settings.activeTextProviderId : settings.activeImageProviderId
    );
  }

  getConfiguredProvider(providerId: string): ProviderRuntimeConfig {
    if (providerId === ENV_PROVIDER_ID) return this.environmentProvider;
    const provider = this.readSettings().providers.find((item) => item.id === providerId);
    if (!provider) throw new ProviderSettingsError(404, "中转站不存在");
    if (provider.protocolType === "unconfigured") {
      throw new ProviderSettingsError(409, `请先为“${provider.name}”选择协议类型`);
    }
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      protocolType: provider.protocolType,
      configRevision: provider.configRevision,
      maxConcurrency: provider.maxConcurrency
    };
  }

  getProvider(providerId: string) {
    return this.getConfiguredProvider(providerId);
  }

  getActiveProviderId() {
    const providerId = this.readSettings().activeTextProviderId;
    return providerId === ENV_PROVIDER_ID ? null : providerId;
  }

  getActiveProvider() {
    const providerId = this.readSettings().activeTextProviderId;
    return providerId === ENV_PROVIDER_ID ? null : this.getConfiguredProvider(providerId);
  }

  private toPublicProvider(
    provider: StoredProviderSettings | (ProviderRuntimeConfig & { notes: string; createdAt: string; updatedAt: string }),
    settings: ProviderSettingsFile,
    readonly: boolean
  ) {
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      protocolType: provider.protocolType,
      maxConcurrency: provider.maxConcurrency,
      notes: provider.notes,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
      apiKeyMask: maskApiKey(provider.apiKey),
      hasApiKey: Boolean(provider.apiKey),
      readonly,
      capabilities: this.protocolCapabilities(provider.protocolType),
      isActiveText: provider.id === settings.activeTextProviderId,
      isActiveImage: provider.id === settings.activeImageProviderId,
      isActive: provider.id === settings.activeTextProviderId
        && provider.id === settings.activeImageProviderId
    };
  }

  private readSettings(): ProviderSettingsFile {
    if (!existsSync(this.settingsFile)) {
      return {
        activeTextProviderId: ENV_PROVIDER_ID,
        activeImageProviderId: ENV_PROVIDER_ID,
        providers: []
      };
    }
    try {
      const parsed = JSON.parse(readFileSync(this.settingsFile, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("invalid settings");
      }
      const settings = parsed as Record<string, unknown>;
      if (!Array.isArray(settings.providers)) throw new Error("invalid providers");
      const providers = settings.providers.map(normalizeStoredProvider);
      if (providers.some((provider) => provider === null)) throw new Error("invalid provider");
      const normalizedProviders = providers as StoredProviderSettings[];
      if (typeof settings.activeTextProviderId === "string"
        && typeof settings.activeImageProviderId === "string") {
        return {
          activeTextProviderId: settings.activeTextProviderId,
          activeImageProviderId: settings.activeImageProviderId,
          providers: normalizedProviders
        };
      }
      const legacyActiveProviderId = typeof settings.activeProviderId === "string"
        ? settings.activeProviderId
        : ENV_PROVIDER_ID;
      if (settings.activeProviderId !== null && settings.activeProviderId !== undefined
        && typeof settings.activeProviderId !== "string") {
        throw new Error("invalid active provider");
      }
      return {
        activeTextProviderId: legacyActiveProviderId,
        activeImageProviderId: legacyActiveProviderId,
        providers: normalizedProviders
      };
    } catch (error) {
      if (error instanceof ProviderSettingsError) throw error;
      throw new ProviderSettingsError(500, "中转站配置文件格式无效");
    }
  }

  private writeSettings(settings: ProviderSettingsFile) {
    writeFileSync(this.settingsFile, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }
}

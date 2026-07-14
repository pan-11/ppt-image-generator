import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type StoredProvider = {
  id: string;
  name: string;
  baseUrl: string;
  protocol: "toapis";
  apiKey: string;
  notes: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BenchmarkRecord = {
  id: string;
  providerId: string;
  providerName: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  testMode: "text-to-image" | "reference-image";
  referenceFilename: string | null;
  status: "completed" | "failed";
  uploadMs: number;
  submitMs: number;
  generationMs: number;
  downloadMs: number;
  totalMs: number;
  reportedUsage: unknown | null;
  reportedCost: unknown | null;
  errorMessage: string | null;
  localPath: string | null;
  mimeType: string | null;
  createdAt: string;
};

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Base URL 仅支持 http 或 https");
  }
  return url.toString().replace(/\/$/, "");
}

function maskApiKey(apiKey: string) {
  return `****${apiKey.slice(-4)}`;
}

export class ProviderStore {
  private readonly labDir: string;
  private readonly providersFile: string;
  private readonly benchmarksFile: string;
  private readonly resultsDir: string;

  constructor(appDataDir: string) {
    this.labDir = resolve(appDataDir, "lab");
    this.providersFile = join(this.labDir, "providers.json");
    this.benchmarksFile = join(this.labDir, "benchmarks.jsonl");
    this.resultsDir = join(this.labDir, "results");
    mkdirSync(this.resultsDir, { recursive: true });
  }

  listProviders() {
    return this.readProviders().map(({ apiKey, ...provider }) => ({
      ...provider,
      notes: provider.notes ?? "",
      apiKeyMask: maskApiKey(apiKey),
      hasApiKey: Boolean(apiKey)
    }));
  }

  getProvider(id: string) {
    return this.readProviders().find((provider) => provider.id === id);
  }

  saveProvider(input: {
    id?: string;
    name: string;
    baseUrl: string;
    apiKey?: string;
    notes?: string;
    enabled?: boolean;
  }) {
    const providers = this.readProviders();
    const current = input.id ? providers.find((provider) => provider.id === input.id) : undefined;

    if (input.id && !current) {
      throw new Error("中转站不存在");
    }

    const apiKey = input.apiKey?.trim() || current?.apiKey;

    if (!apiKey) {
      throw new Error("请填写 API Key");
    }

    const now = new Date().toISOString();
    const provider: StoredProvider = {
      id: current?.id ?? randomUUID(),
      name: input.name.trim(),
      baseUrl: normalizeBaseUrl(input.baseUrl.trim()),
      protocol: "toapis",
      apiKey,
      notes: input.notes?.trim() ?? current?.notes ?? "",
      enabled: input.enabled ?? current?.enabled ?? true,
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    };

    if (!provider.name) {
      throw new Error("请填写中转站名称");
    }

    const next = current
      ? providers.map((item) => item.id === current.id ? provider : item)
      : [...providers, provider];
    writeFileSync(this.providersFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");

    const { apiKey: _apiKey, ...publicProvider } = provider;
    return {
      ...publicProvider,
      apiKeyMask: maskApiKey(apiKey),
      hasApiKey: true
    };
  }

  appendBenchmark(record: BenchmarkRecord) {
    appendFileSync(this.benchmarksFile, `${JSON.stringify(record)}\n`, "utf8");
  }

  listBenchmarks(limit = 100) {
    if (!existsSync(this.benchmarksFile)) {
      return [];
    }

    return readFileSync(this.benchmarksFile, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as BenchmarkRecord];
        } catch {
          return [];
        }
      })
      .slice(-limit)
      .reverse()
      .map((record) => this.toPublicBenchmark(record));
  }

  writeBenchmarkImage(runId: string, sourceUrl: string, mimeType: string, buffer: Buffer) {
    const extension = extname(new URL(sourceUrl).pathname) || (mimeType.includes("jpeg") ? ".jpg" : ".png");
    const localPath = join(this.resultsDir, `${runId}${extension}`);
    writeFileSync(localPath, buffer);
    return localPath;
  }

  getBenchmarkImage(runId: string) {
    const record = this.readBenchmarkRecords().find((item) => item.id === runId);
    if (!record?.localPath || !record.mimeType || !existsSync(record.localPath)) {
      return undefined;
    }
    return {
      buffer: readFileSync(record.localPath),
      mimeType: record.mimeType
    };
  }

  toPublicBenchmark(record: BenchmarkRecord) {
    const { localPath, ...publicRecord } = record;
    return {
      ...publicRecord,
      testMode: record.testMode ?? "text-to-image",
      referenceFilename: record.referenceFilename ?? null,
      uploadMs: record.uploadMs ?? 0,
      imageUrl: localPath ? `/api/lab/benchmarks/${record.id}/image` : null
    };
  }

  private readProviders(): StoredProvider[] {
    if (!existsSync(this.providersFile)) {
      return [];
    }
    const parsed = JSON.parse(readFileSync(this.providersFile, "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("中转站配置文件格式无效");
    }
    return parsed as StoredProvider[];
  }

  private readBenchmarkRecords() {
    if (!existsSync(this.benchmarksFile)) {
      return [];
    }
    return readFileSync(this.benchmarksFile, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as BenchmarkRecord];
        } catch {
          return [];
        }
      });
  }
}

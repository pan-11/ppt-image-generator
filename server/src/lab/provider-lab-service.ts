import { randomUUID } from "node:crypto";
import { modelCapabilities, resolveTaskRequest } from "../config/model-capabilities.js";
import { pollRemoteImageTask, type RemoteImageTask } from "../services/polling.js";
import { extractFirstImageUrl, extractImageTaskId, ToApisClient } from "../services/toapis-client.js";
import { ProviderStore, type BenchmarkRecord, type StoredProvider } from "./provider-store.js";

type LabClient = Pick<ToApisClient, "uploadReferenceImage" | "createImageTask" | "getImageTask" | "downloadImage">;

type ProviderLabServiceOptions = {
  appDataDir: string;
  isProductionBusy: () => boolean;
  clientFactory?: (provider: StoredProvider) => LabClient;
  pollTask?: typeof pollRemoteImageTask;
  fetchImpl?: typeof fetch;
};

function extractBilling(result: unknown) {
  const payload = result as RemoteImageTask & {
    usage?: unknown;
    cost?: unknown;
    result?: RemoteImageTask["result"] & { usage?: unknown; cost?: unknown };
  };
  return {
    reportedUsage: payload.usage ?? payload.result?.usage ?? null,
    reportedCost: payload.cost ?? payload.result?.cost ?? null
  };
}

export class ProviderLabService {
  private readonly store: ProviderStore;
  private readonly isProductionBusy: () => boolean;
  private readonly clientFactory: (provider: StoredProvider) => LabClient;
  private readonly pollTask: typeof pollRemoteImageTask;
  private readonly fetchImpl: typeof fetch;
  private benchmarkRunning = false;

  constructor(options: ProviderLabServiceOptions) {
    this.store = new ProviderStore(options.appDataDir);
    this.isProductionBusy = options.isProductionBusy;
    this.clientFactory = options.clientFactory ?? ((provider) => new ToApisClient(provider.apiKey, provider.baseUrl));
    this.pollTask = options.pollTask ?? pollRemoteImageTask;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  listProviders() {
    return this.store.listProviders();
  }

  saveProvider(input: Parameters<ProviderStore["saveProvider"]>[0]) {
    return this.store.saveProvider(input);
  }

  listBenchmarks() {
    return this.store.listBenchmarks();
  }

  getBenchmarkImage(runId: string) {
    return this.store.getBenchmarkImage(runId);
  }

  async checkProvider(providerId: string) {
    const provider = this.requireProvider(providerId);
    const startedAt = Date.now();

    try {
      const response = await this.fetchImpl(provider.baseUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${provider.apiKey}` },
        signal: AbortSignal.timeout(10000)
      });
      return {
        reachable: true,
        authorized: response.status !== 401 && response.status !== 403,
        statusCode: response.status,
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      return {
        reachable: false,
        authorized: false,
        statusCode: null,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "连接失败"
      };
    }
  }

  async runBenchmark(input: {
    providerId: string;
    prompt: string;
    model: string;
    aspectRatio: string;
    resolution: string;
    referenceImage?: {
      filename: string;
      mimeType: string;
      buffer: Buffer;
    };
  }) {
    if (this.isProductionBusy()) {
      throw new Error("正式生图任务运行中，暂不能启动实验室测试");
    }
    if (this.benchmarkRunning) {
      throw new Error("已有实验室测试正在运行");
    }

    const provider = this.requireProvider(input.providerId);
    if (!provider.enabled) {
      throw new Error("该中转站已停用");
    }

    this.benchmarkRunning = true;
    const runId = randomUUID();
    const startedAt = Date.now();
    let uploadMs = 0;
    let submitMs = 0;
    let generationMs = 0;
    let downloadMs = 0;

    try {
      const knownCapability = modelCapabilities[input.model];
      const request = knownCapability
        ? resolveTaskRequest({
            model: input.model,
            aspectRatio: input.aspectRatio,
            resolution: input.resolution,
            n: 1,
            hasReferenceImage: Boolean(input.referenceImage)
          })
        : {
            requestModel: input.model,
            size: input.aspectRatio,
            resolution: input.resolution
          };
      const client = this.clientFactory(provider);
      let imageUrls: string[] | undefined;

      if (input.referenceImage) {
        const uploadStartedAt = Date.now();
        try {
          imageUrls = [await client.uploadReferenceImage(input.referenceImage)];
        } finally {
          uploadMs = Date.now() - uploadStartedAt;
        }
      }

      const submitStartedAt = Date.now();
      const created = await client.createImageTask({
        prompt: input.prompt,
        model: input.model,
        size: request.size,
        resolution: request.resolution,
        n: 1,
        metadata: request.metadata,
        imageUrls
      });
      submitMs = Date.now() - submitStartedAt;

      let settled: RemoteImageTask | null = null;
      let imageUrl = extractFirstImageUrl(created);
      if (!imageUrl) {
        const remoteTaskId = extractImageTaskId(created);
        if (!remoteTaskId) {
          throw new Error("创建任务响应缺少任务 ID 或图片结果");
        }

        const generationStartedAt = Date.now();
        settled = await this.pollTask(remoteTaskId, (id) => client.getImageTask(id));
        generationMs = Date.now() - generationStartedAt;

        if (settled.status === "failed") {
          throw new Error(settled.error?.message ?? "远程生成失败");
        }

        imageUrl = extractFirstImageUrl(settled);
      }

      if (!imageUrl) {
        throw new Error("远程任务未返回图片地址");
      }

      const downloadStartedAt = Date.now();
      const downloaded = await client.downloadImage(imageUrl);
      downloadMs = Date.now() - downloadStartedAt;
      const localPath = this.store.writeBenchmarkImage(runId, imageUrl, downloaded.mimeType, downloaded.buffer);
      const billing = extractBilling(settled ?? created);
      const record: BenchmarkRecord = {
        id: runId,
        providerId: provider.id,
        providerName: provider.name,
        prompt: input.prompt,
        model: input.model,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        testMode: input.referenceImage ? "reference-image" : "text-to-image",
        referenceFilename: input.referenceImage?.filename ?? null,
        status: "completed",
        uploadMs,
        submitMs,
        generationMs,
        downloadMs,
        totalMs: Date.now() - startedAt,
        ...billing,
        errorMessage: null,
        localPath,
        mimeType: downloaded.mimeType,
        createdAt: new Date().toISOString()
      };
      this.store.appendBenchmark(record);
      return this.store.toPublicBenchmark(record);
    } catch (error) {
      const record: BenchmarkRecord = {
        id: runId,
        providerId: provider.id,
        providerName: provider.name,
        prompt: input.prompt,
        model: input.model,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        testMode: input.referenceImage ? "reference-image" : "text-to-image",
        referenceFilename: input.referenceImage?.filename ?? null,
        status: "failed",
        uploadMs,
        submitMs,
        generationMs,
        downloadMs,
        totalMs: Date.now() - startedAt,
        reportedUsage: null,
        reportedCost: null,
        errorMessage: error instanceof Error ? error.message : "测试失败",
        localPath: null,
        mimeType: null,
        createdAt: new Date().toISOString()
      };
      this.store.appendBenchmark(record);
      throw error;
    } finally {
      this.benchmarkRunning = false;
    }
  }

  private requireProvider(providerId: string) {
    const provider = this.store.getProvider(providerId);
    if (!provider) {
      throw new Error("中转站不存在");
    }
    return provider;
  }
}

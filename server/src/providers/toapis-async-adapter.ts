import { modelCapabilities, resolveTaskRequest } from "../config/model-capabilities.js";
import { pollRemoteImageTask } from "../services/polling.js";
import {
  extractFirstImageUrl,
  extractImageTaskId,
  ToApisClient
} from "../services/toapis-client.js";
import type {
  AdapterGeneratedImage,
  AdapterGenerationRequest,
  AdapterModelCapability,
  AdapterRemoteReference,
  GenerationMode,
  ProviderAdapter,
  ProviderRuntimeConfig
} from "./provider-adapter.js";

type ClientFactory = (apiKey: string, baseUrl: string) => ToApisClient;

function resolutionsByRatio(sizeMap?: Record<string, Record<string, string>>) {
  if (!sizeMap) return undefined;
  return Object.fromEntries(
    Object.entries(sizeMap).map(([ratio, resolutions]) => [ratio, Object.keys(resolutions)])
  );
}

function decodeDataUrl(source: string): AdapterGeneratedImage | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(source);
  if (!match) return null;
  return {
    mimeType: match[1] || "image/png",
    buffer: Buffer.from(match[2] || "", "base64")
  };
}

export class ToApisAsyncAdapter implements ProviderAdapter {
  readonly protocolType = "toapis-async" as const;
  private readonly remoteReferenceUrls = new Map<string, string>();

  constructor(
    private readonly clientFactory: ClientFactory = (apiKey, baseUrl) => (
      new ToApisClient(apiKey, baseUrl)
    )
  ) {}

  capabilities(_provider: ProviderRuntimeConfig, mode: GenerationMode): AdapterModelCapability[] {
    return Object.entries(modelCapabilities)
      .filter(([, capability]) => mode === "text" || capability.supportsReferenceImages)
      .map(([value, capability]) => ({
        value,
        label: capability.label,
        aspectRatios: capability.aspectRatios,
        resolutions: capability.resolutions,
        supportedResolutionsByAspectRatio: resolutionsByRatio(capability.sizeMap),
        maxN: capability.maxN,
        supportsReferenceImages: capability.supportsReferenceImages
      }));
  }

  resolveRequest(_provider: ProviderRuntimeConfig, request: AdapterGenerationRequest) {
    const resolved = resolveTaskRequest({
      model: request.model,
      aspectRatio: request.aspectRatio,
      resolution: request.resolution,
      n: 1,
      hasReferenceImage: request.references.length > 0
    });
    return { requestSize: resolved.size };
  }

  async generate(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ) {
    const client = this.clientFactory(provider.apiKey, provider.baseUrl);
    const resolved = resolveTaskRequest({
      model: request.model,
      aspectRatio: request.aspectRatio,
      resolution: request.resolution,
      n: 1,
      hasReferenceImage: request.references.length > 0
    });
    const imageUrls = request.references.length > 0
      ? await Promise.all(request.references.map(async (reference) => {
          const cacheKey = `${provider.id}:${provider.configRevision}:${reference.id}`;
          const cached = this.remoteReferenceUrls.get(cacheKey);
          if (cached) return cached;
          const remoteUrl = await client.uploadReferenceImage({
            filename: reference.filename,
            mimeType: reference.mimeType,
            buffer: reference.buffer
          });
          this.remoteReferenceUrls.set(cacheKey, remoteUrl);
          return remoteUrl;
        }))
      : undefined;
    const created = await client.createImageTask({
      prompt: request.prompt,
      model: resolved.requestModel,
      size: resolved.size,
      resolution: resolved.resolution,
      n: 1,
      metadata: resolved.metadata,
      imageUrls
    });

    const directSource = extractFirstImageUrl(created);
    if (directSource) {
      if (/^https?:/i.test(directSource)) {
        onRemoteReference({ resultUrl: directSource });
      }
      return this.downloadSource(client, directSource);
    }

    const remoteTaskId = extractImageTaskId(created);
    if (!remoteTaskId) throw new Error("创建任务响应缺少任务 ID 或图片结果");
    onRemoteReference({ taskId: remoteTaskId });
    return this.pollAndDownload(client, remoteTaskId);
  }

  async recover(
    provider: ProviderRuntimeConfig,
    _request: AdapterGenerationRequest,
    remote: AdapterRemoteReference,
    _onRemoteReference: (reference: AdapterRemoteReference) => void
  ) {
    const client = this.clientFactory(provider.apiKey, provider.baseUrl);
    if (remote.resultUrl) return this.downloadSource(client, remote.resultUrl);
    if (remote.taskId) return this.pollAndDownload(client, remote.taskId);
    throw new Error("缺少可恢复的远程任务信息");
  }

  private async pollAndDownload(client: ToApisClient, remoteTaskId: string) {
    const settled = await pollRemoteImageTask(remoteTaskId, (id) => client.getImageTask(id));
    if (settled.status === "failed") {
      throw new Error(settled.error?.message ?? "远程任务失败");
    }
    const source = settled.result?.data?.[0]?.url;
    if (!source) throw new Error("远程任务完成但未返回图片结果");
    return this.downloadSource(client, source);
  }

  private async downloadSource(client: ToApisClient, source: string) {
    const decoded = decodeDataUrl(source);
    if (decoded) return decoded;
    return client.downloadImage(source);
  }
}

import sharp from "sharp";
import {
  UnknownSubmissionError,
  RemoteGenerationFailedError,
  type AdapterGeneratedImage,
  type AdapterGenerationRequest,
  type AdapterRemoteReference,
  type GenerationMode,
  type ProviderAdapter,
  type ProviderRuntimeConfig,
  type ReferenceAsset
} from "./provider-adapter.js";

type CangyuanAdapterOptions = {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  maxPollAttempts?: number;
  now?: () => number;
};

const models = [
  { value: "gpt-image-2", label: "gpt-image-2（沧元，默认尺寸）", resolution: "standard" },
  { value: "gpt-image-2-1k", label: "gpt-image-2 · 1K（沧元）", resolution: "1K" },
  { value: "gpt-image-2-2k", label: "gpt-image-2 · 2K（沧元）", resolution: "2K" },
  { value: "gpt-image-2-4k", label: "gpt-image-2 · 4K（沧元）", resolution: "4K" }
];

// Official canvas client uses this metadata endpoint, then PUTs to its signed URL.
const referenceUploadEndpoint = "https://canvas.cangyuansuanli.cn/api/media/references";
const maxReferenceBytes = 100 * 1024 * 1024;
const referenceLifetimeMs = 2 * 60 * 60 * 1000;

class RetryableQueryError extends Error {}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function taskId(task: Record<string, unknown> | null) {
  const id = task?.id ?? task?.task_id;
  return typeof id === "string" && id.trim() ? id : null;
}

function normalizeTask(value: unknown) {
  const root = record(value);
  if (typeof root?.code === "number" && root.code !== 0) {
    throw new Error(`沧元请求被拒绝（错误码 ${root.code}），请查看中转站控制台`);
  }
  const inner = record(root?.data);
  return taskId(inner) ? inner : root;
}

function providerOrigin(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    const path = url.pathname.replace(/\/+$/, "");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
      || baseUrl.includes("?") || baseUrl.includes("#") || (path && path !== "/v1")) throw new Error();
    return url.origin;
  } catch {
    throw new Error("沧元 Base URL 仅支持 http/https 站点根地址或 /v1，不能包含账号、查询参数或其他路径");
  }
}

function requireHttpsUrl(value: unknown) {
  try {
    if (typeof value !== "string" || !value) throw new Error();
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error();
    return value;
  } catch {
    throw new Error("沧元未返回有效的 HTTPS 图片地址");
  }
}

function taskPath(request: AdapterGenerationRequest) {
  return request.references.length ? "/v1/images/edits" : "/v1/images/generations";
}

export class CangyuanImagesAdapter implements ProviderAdapter {
  readonly protocolType = "cangyuan-images" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly maxPollAttempts: number;
  private readonly now: () => number;
  private readonly referenceUrls = new Map<string, {
    expiresAt?: number;
    promise: Promise<{ url: string; expiresAt: number }>;
  }>();

  constructor(options: CangyuanAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    this.timeoutMs = options.timeoutMs ?? 300_000;
    this.maxPollAttempts = options.maxPollAttempts ?? 400;
    this.now = options.now ?? Date.now;
  }

  capabilities(_provider: ProviderRuntimeConfig, _mode: GenerationMode) {
    return models.map(model => ({
      value: model.value, label: model.label, aspectRatios: ["16:9"],
      resolutions: [model.resolution],
      supportedResolutionsByAspectRatio: { "16:9": [model.resolution] },
      maxN: 10, supportsReferenceImages: true
    }));
  }

  resolveRequest(provider: ProviderRuntimeConfig, request: AdapterGenerationRequest) {
    providerOrigin(provider.baseUrl);
    const model = models.find(model => model.value === request.model);
    if (!model || request.aspectRatio !== "16:9" || request.resolution !== model.resolution) {
      throw new Error("沧元不支持当前模型、比例或分辨率组合，请重新选择");
    }
    if (request.references.length > 9) throw new Error("沧元最多支持 9 张参考图");
    for (const reference of request.references) {
      if (!reference.mimeType.startsWith("image/") || !reference.buffer.length
        || reference.buffer.length > maxReferenceBytes) {
        throw new Error("沧元参考图必须是大于 0 字节且不超过 100 MiB 的图片");
      }
    }
    return { requestSize: request.aspectRatio };
  }

  async generate(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage> {
    const { requestSize } = this.resolveRequest(provider, request);
    const images: string[] = [];
    for (const reference of request.references) images.push(await this.referenceUrl(provider, reference));
    const task = normalizeTask(await this.apiJson(provider, taskPath(request), {
      model: request.model, prompt: request.prompt, n: 1, size: requestSize,
      response_format: "url", async: true,
      ...(images.length ? { images } : {})
    }));
    const id = taskId(task);
    if (!id) throw new UnknownSubmissionError("沧元提交状态未知：响应中没有任务 ID，请先查看中转站控制台");
    onRemoteReference({ taskId: id });
    return this.pollAndDownload(provider, request, id, onRemoteReference);
  }

  async recover(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    remote: AdapterRemoteReference,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage> {
    providerOrigin(provider.baseUrl);
    if (remote.resultUrl) {
      try { return await this.downloadResult(remote.resultUrl); }
      catch (error) { if (!remote.taskId) throw error; }
    }
    if (!remote.taskId) throw new Error("沧元没有可恢复的远程任务 ID 或图片地址");
    return this.pollAndDownload(provider, request, remote.taskId, onRemoteReference);
  }

  private async apiJson(provider: ProviderRuntimeConfig, path: string, body?: unknown): Promise<unknown> {
    const submitting = body !== undefined;
    let response: Response;
    try {
      response = await this.fetchImpl(`${providerOrigin(provider.baseUrl)}${path}`, {
        method: submitting ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          ...(submitting ? { "Content-Type": "application/json" } : {})
        },
        ...(submitting ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs), redirect: "error"
      });
    } catch {
      if (submitting) throw new UnknownSubmissionError("沧元提交状态未知：网络中断或超时，请先查看中转站控制台");
      throw new RetryableQueryError("沧元任务查询暂时不可用");
    }
    if (submitting && (response.status >= 500 || response.status === 408)) {
      throw new UnknownSubmissionError(`沧元提交状态未知（HTTP ${response.status}），请先查看中转站控制台`);
    }
    if (!submitting && (response.status === 429 || response.status >= 500)) {
      throw new RetryableQueryError("沧元任务查询暂时不可用");
    }
    if (!response.ok) throw new Error(`沧元请求失败（HTTP ${response.status}），请检查中转站权限和参数`);
    try { return await response.json(); }
    catch (error) {
      if (submitting) throw new UnknownSubmissionError("沧元提交状态未知：响应无法读取，请先查看中转站控制台");
      if (error instanceof Error && ["TypeError", "AbortError", "TimeoutError"].includes(error.name)) {
        throw new RetryableQueryError("沧元任务查询响应中断");
      }
      throw new Error("沧元查询响应不是有效 JSON");
    }
  }

  private async pollAndDownload(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    id: string,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      let task: Record<string, unknown> | null;
      try {
        task = normalizeTask(await this.apiJson(provider, `${taskPath(request)}/${encodeURIComponent(id)}`));
      } catch (error) {
        if (!(error instanceof RetryableQueryError)) throw error;
        if (attempt + 1 < this.maxPollAttempts) await this.sleep(15_000);
        continue;
      }
      if (["completed", "succeeded", "success"].includes(String(task?.status))) {
        const data = Array.isArray(task?.data) ? task.data : [];
        const first = record(data[0]);
        if (!first?.url) throw new Error("沧元任务完成但未返回图片");
        const url = requireHttpsUrl(first.url);
        onRemoteReference({ resultUrl: url });
        return this.downloadResult(url);
      }
      if (["failed", "cancelled", "error"].includes(String(task?.status))) {
        throw new RemoteGenerationFailedError("沧元任务失败，请查看中转站控制台的失败原因");
      }
      if (task?.status !== "queued" && task?.status !== "in_progress") {
        throw new Error("沧元返回未知任务状态");
      }
      if (attempt + 1 < this.maxPollAttempts) await this.sleep(8000);
    }
    throw new Error("沧元任务轮询超时，可重试查询已有任务");
  }

  private async referenceUrl(provider: ProviderRuntimeConfig, reference: ReferenceAsset) {
    const key = `${provider.id}:${provider.configRevision}:${reference.id}`;
    const cached = this.referenceUrls.get(key);
    if (cached && (!cached.expiresAt || cached.expiresAt > this.now() + 60_000)) {
      return (await cached.promise).url;
    }
    const entry: { expiresAt?: number; promise: Promise<{ url: string; expiresAt: number }> } = {
      promise: this.uploadReference(reference)
    };
    this.referenceUrls.set(key, entry);
    try {
      const uploaded = await entry.promise;
      entry.expiresAt = uploaded.expiresAt;
      return uploaded.url;
    } catch (error) {
      if (this.referenceUrls.get(key) === entry) this.referenceUrls.delete(key);
      throw error;
    }
  }

  private async uploadReference(reference: ReferenceAsset) {
    let metadata: Record<string, unknown> | null;
    try {
      const response = await this.fetchImpl(referenceUploadEndpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: reference.mimeType, bytes: reference.buffer.length }),
        signal: AbortSignal.timeout(this.timeoutMs), redirect: "error"
      });
      if (!response.ok) throw new Error();
      metadata = record(await response.json());
    } catch {
      throw new Error("沧元上传参考图失败：无法取得临时上传地址");
    }
    const uploadUrl = requireHttpsUrl(metadata?.uploadUrl);
    const url = requireHttpsUrl(metadata?.url);
    const expiresAt = Math.min(
      this.now() + referenceLifetimeMs,
      typeof metadata?.expiresAt === "number" && Number.isFinite(metadata.expiresAt)
        ? metadata.expiresAt : this.now() + referenceLifetimeMs
    );
    if (expiresAt <= this.now() + 60_000) throw new Error("沧元上传参考图失败：临时地址已过期");
    try {
      const response = await this.fetchImpl(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": typeof metadata?.contentType === "string" ? metadata.contentType : reference.mimeType },
        body: new Blob([new Uint8Array(reference.buffer)], { type: reference.mimeType }),
        signal: AbortSignal.timeout(this.timeoutMs), redirect: "error"
      });
      if (!response.ok) throw new Error();
    } catch {
      throw new Error("沧元上传参考图失败，尚未提交生图任务");
    }
    return { url, expiresAt };
  }

  private async downloadResult(source: string): Promise<AdapterGeneratedImage> {
    const url = requireHttpsUrl(source);
    try {
      const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!response.ok) throw new Error();
      const buffer = Buffer.from(await response.arrayBuffer());
      // Decode all pixels: a readable header can still belong to a truncated image.
      await sharp(buffer, { failOn: "warning" }).stats();
      return {
        buffer,
        mimeType: response.headers.get("content-type") ?? "image/png"
      };
    } catch {
      throw new Error("下载沧元结果失败，可重试获取已有任务结果");
    }
  }
}

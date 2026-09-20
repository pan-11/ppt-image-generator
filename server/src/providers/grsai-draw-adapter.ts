import {
  UnknownSubmissionError,
  RemoteGenerationFailedError,
  type AdapterGeneratedImage,
  type AdapterGenerationRequest,
  type AdapterModelCapability,
  type AdapterRemoteReference,
  type AdapterResolvedRequest,
  type GenerationMode,
  type ProviderAdapter,
  type ProviderRuntimeConfig
} from "./provider-adapter.js";

type GrsaiAdapterOptions = {
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  maxPollAttempts?: number;
};

const vipSizes = {
  "1K": "1280x720",
  "2K": "2048x1152",
  "4K": "3840x2160"
} as const;

function providerOrigin(baseUrl: string) {
  const message = "GrsAI Base URL 仅支持 HTTP/HTTPS 站点根地址或 /v1，不能包含账号、密码、查询参数或片段";
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(message);
  }
  const path = url.pathname.replace(/\/+$/, "");
  if ((url.protocol !== "http:" && url.protocol !== "https:")
    || url.username || url.password || baseUrl.includes("?") || baseUrl.includes("#")
    || (path !== "" && path !== "/v1")) {
    throw new Error(message);
  }
  return url.origin;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonemptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeMessage(value: unknown, provider: ProviderRuntimeConfig, request: AdapterGenerationRequest) {
  // Only selected message fields are shown; echoed JSON requests are discarded entirely.
  if (typeof value !== "string" || /[{}\[\]]/.test(value)) return "";
  const message = value.replace(/\s+/g, " ").trim();
  const sensitive = [provider.apiKey, request.prompt, ...request.references.map((reference) => reference.buffer.toString("base64"))];
  for (const value of sensitive) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized && message.includes(normalized)) return "";
  }
  return message
    .replace(/data:[^\s,]+,[^\s]+/gi, "[已隐藏]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[已隐藏]")
    .slice(0, 300);
}

class ResultDownloadError extends Error {
  constructor(message: string, readonly refreshResult: boolean) {
    super(message);
  }
}

export class GrsaiDrawAdapter implements ProviderAdapter {
  readonly protocolType = "grsai-draw" as const;
  private readonly fetchImpl: NonNullable<GrsaiAdapterOptions["fetchImpl"]>;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly maxPollAttempts: number;

  constructor(options: GrsaiAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => (
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    ));
    this.timeoutMs = options.timeoutMs ?? 300_000;
    this.maxPollAttempts = options.maxPollAttempts ?? 400;
  }

  capabilities(_provider: ProviderRuntimeConfig, _mode: GenerationMode): AdapterModelCapability[] {
    return ["gpt-image-2", "gpt-image-2-vip", "gpt-image-2.5"].map((model) => {
      const resolutions = model === "gpt-image-2-vip" ? ["1K", "2K", "4K"] : ["1K"];
      return {
        value: model,
        label: `${model}（GrsAI）`,
        aspectRatios: ["16:9"],
        resolutions,
        supportedResolutionsByAspectRatio: { "16:9": resolutions },
        maxN: 10,
        supportsReferenceImages: true
      };
    });
  }

  resolveRequest(_provider: ProviderRuntimeConfig, request: AdapterGenerationRequest): AdapterResolvedRequest {
    if (!["gpt-image-2", "gpt-image-2-vip", "gpt-image-2.5"].includes(request.model)) {
      throw new Error("GrsAI 仅支持 gpt-image-2、gpt-image-2-vip 和 gpt-image-2.5 模型");
    }
    if (request.aspectRatio !== "16:9") throw new Error("GrsAI 仅支持 16:9");
    if (!(request.model === "gpt-image-2-vip" ? ["1K", "2K", "4K"] : ["1K"]).includes(request.resolution)) {
      throw new Error("GrsAI 当前模型不支持所选分辨率");
    }
    const requestSize = request.model === "gpt-image-2-vip"
      ? vipSizes[request.resolution as keyof typeof vipSizes]
      : "1672x941";
    const [width, height] = requestSize.split("x").map(Number);
    return { requestSize, expectedDimensions: { width, height } };
  }

  async generate(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage> {
    const origin = providerOrigin(provider.baseUrl);
    const { requestSize } = this.resolveRequest(provider, request);
    const body = {
      model: request.model,
      prompt: request.prompt,
      aspectRatio: requestSize,
      quality: request.model === "gpt-image-2-vip" ? "medium" : "auto",
      shutProgress: true,
      webHook: "-1",
      ...(request.references.length > 0 ? {
        urls: request.references.map((reference) => (
          `data:${reference.mimeType};base64,${reference.buffer.toString("base64")}`
        ))
      } : {})
    };
    let response: Response;
    try {
      response = await this.postJson(`${origin}/v1/draw/completions`, provider, body);
    } catch {
      throw new UnknownSubmissionError("GrsAI 提交状态未知：网络中断或请求超时，请先核对远程任务");
    }
    if (response.status >= 500 || response.status === 408) {
      throw new UnknownSubmissionError(`GrsAI 提交状态未知：HTTP ${response.status}`);
    }
    if (!response.ok) throw new Error(`GrsAI 提交被拒绝：HTTP ${response.status}`);
    let root: Record<string, unknown> | null;
    try {
      root = record(await response.json());
    } catch {
      throw new UnknownSubmissionError("GrsAI 提交状态未知：响应不是有效 JSON");
    }
    if (!root || typeof root.code !== "number") {
      throw new UnknownSubmissionError("GrsAI 提交状态未知：响应格式无效");
    }
    if (root.code !== 0) {
      const message = safeMessage(root.msg, provider, request);
      throw new Error(`GrsAI 提交被拒绝：错误码 ${root.code}${message ? ` · ${message}` : ""}`);
    }
    const taskId = nonemptyString(record(root.data)?.id);
    if (!taskId) throw new UnknownSubmissionError("GrsAI 提交状态未知：响应中没有远程任务 ID");
    onRemoteReference({ taskId });
    return this.pollResult(origin, provider, request, taskId, onRemoteReference);
  }

  async recover(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    remote: AdapterRemoteReference,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage> {
    const origin = providerOrigin(provider.baseUrl);
    const taskId = nonemptyString(remote.taskId);
    if (remote.resultUrl) {
      try {
        return await this.downloadResult(remote.resultUrl);
      } catch (error) {
        if (!taskId || !(error instanceof ResultDownloadError) || !error.refreshResult) throw error;
      }
    }
    if (!taskId) throw new Error("GrsAI 没有可恢复的远程任务或结果地址");
    return this.pollResult(origin, provider, request, taskId, onRemoteReference);
  }

  private postJson(url: string, provider: ProviderRuntimeConfig, body: unknown) {
    return this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: "error"
    });
  }

  private async pollResult(
    origin: string,
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    taskId: string,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage> {
    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.postJson(`${origin}/v1/draw/result`, provider, { id: taskId });
      } catch {
        if (attempt < this.maxPollAttempts) await this.sleep(15_000);
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt < this.maxPollAttempts) await this.sleep(15_000);
        continue;
      }
      if (!response.ok) throw new Error(`GrsAI 结果查询失败：HTTP ${response.status}`);
      let root: Record<string, unknown> | null;
      try {
        root = record(await response.json());
      } catch (error) {
        if (error instanceof Error && ["TypeError", "AbortError", "TimeoutError"].includes(error.name)) {
          if (attempt < this.maxPollAttempts) await this.sleep(15_000);
          continue;
        }
        throw new Error("GrsAI 结果查询失败：响应不是有效 JSON");
      }
      if (!root || typeof root.code !== "number") throw new Error("GrsAI 结果查询响应格式无效");
      if (root.code === -22) throw new Error("GrsAI 远程任务不存在（-22），请核对原中转站任务记录");
      if (root.code !== 0) {
        const message = safeMessage(root.msg, provider, request);
        throw new Error(`GrsAI 结果查询失败：错误码 ${root.code}${message ? ` · ${message}` : ""}`);
      }
      const data = record(root.data);
      if (data?.status === "running") {
        if (attempt < this.maxPollAttempts) await this.sleep(8_000);
        continue;
      }
      if (data?.status === "failed") {
        const message = safeMessage(data.failure_reason ?? data.error, provider, request);
        throw new RemoteGenerationFailedError(`GrsAI 任务失败${message ? `：${message}` : ""}`);
      }
      if (data?.status !== "succeeded") throw new Error("GrsAI 结果查询响应包含无效任务状态");
      const firstResult = Array.isArray(data.results) ? record(data.results[0]) : null;
      const resultUrl = nonemptyString(firstResult?.url) ?? nonemptyString(data.url);
      if (!resultUrl) throw new Error("GrsAI 任务成功但响应中没有图片地址");
      onRemoteReference({ resultUrl });
      return this.downloadResult(resultUrl);
    }
    throw new Error("GrsAI 结果查询次数已用尽，可使用已保存的任务记录恢复");
  }

  private async downloadResult(resultUrl: string): Promise<AdapterGeneratedImage> {
    let url: URL;
    try {
      url = new URL(resultUrl);
    } catch {
      throw new ResultDownloadError("下载 GrsAI 结果失败：图片地址无效", true);
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      throw new ResultDownloadError("下载 GrsAI 结果失败：图片地址无效", true);
    }
    let response: Response;
    try {
      response = await this.fetchImpl(resultUrl, {
        method: "GET",
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch {
      throw new ResultDownloadError("下载 GrsAI 结果失败：网络中断或请求超时", false);
    }
    if (!response.ok) {
      throw new ResultDownloadError(
        `下载 GrsAI 结果失败：HTTP ${response.status}`,
        response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 408
      );
    }
    try {
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        mimeType: response.headers.get("content-type") ?? "image/png"
      };
    } catch {
      throw new ResultDownloadError("下载 GrsAI 结果失败：图片传输中断或超时", false);
    }
  }
}

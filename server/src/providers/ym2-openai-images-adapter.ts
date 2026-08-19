import {
  UnknownSubmissionError,
  type AdapterGeneratedImage,
  type AdapterGenerationRequest,
  type AdapterRemoteReference,
  type GenerationMode,
  type ProviderAdapter,
  type ProviderRuntimeConfig
} from "./provider-adapter.js";

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

type Ym2AdapterOptions = {
  fetchImpl?: FetchImplementation;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
};

const ym2Sizes = {
  "16:9": {
    "1K": "1280x720",
    "2K": "2048x1152",
    "4K": "3840x2160"
  }
} as const;

function endpoint(baseUrl: string, path: string) {
  return new URL(path, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

function parseSize(size: string) {
  const [width, height] = size.split("x").map(Number);
  return { width, height };
}

function excerpt(value: string) {
  return value.slice(0, 500);
}

export class Ym2OpenAiImagesAdapter implements ProviderAdapter {
  readonly protocolType = "ym2-openai-images" as const;
  private readonly fetchImpl: FetchImplementation;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutMs: number;

  constructor(options: Ym2AdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => (
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    ));
    this.timeoutMs = options.timeoutMs ?? 300_000;
  }

  capabilities(_provider: ProviderRuntimeConfig, _mode: GenerationMode) {
    return [{
      value: "gpt-image-2",
      label: "gpt-image-2（YM2）",
      aspectRatios: ["16:9"],
      resolutions: ["1K", "2K", "4K"],
      supportedResolutionsByAspectRatio: { "16:9": ["1K", "2K", "4K"] },
      maxN: 10,
      supportsReferenceImages: true
    }];
  }

  resolveRequest(_provider: ProviderRuntimeConfig, request: AdapterGenerationRequest) {
    const ratioSizes = ym2Sizes[request.aspectRatio as keyof typeof ym2Sizes];
    const requestSize = ratioSizes?.[request.resolution as keyof typeof ratioSizes];
    if (!requestSize) {
      throw new Error(`YM2 不支持 ${request.aspectRatio} · ${request.resolution}`);
    }
    return {
      requestSize,
      expectedDimensions: parseSize(requestSize)
    };
  }

  async generate(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ) {
    const { requestSize } = this.resolveRequest(provider, request);
    const response = request.references.length > 0
      ? await this.submitEdit(provider, request, requestSize)
      : await this.submitGeneration(provider, request, requestSize);
    return this.normalizeGenerationResponse(response, onRemoteReference);
  }

  async recover(
    _provider: ProviderRuntimeConfig,
    _request: AdapterGenerationRequest,
    remote: AdapterRemoteReference,
    _onRemoteReference: (reference: AdapterRemoteReference) => void
  ) {
    if (!remote.resultUrl) {
      throw new Error("YM2 没有可查询的远程任务 ID");
    }
    return this.downloadResult(remote.resultUrl);
  }

  private submitGeneration(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    requestSize: string
  ) {
    return this.fetchGeneration(endpoint(provider.baseUrl, "images/generations"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        size: requestSize,
        n: 1,
        response_format: "b64_json"
      })
    });
  }

  private submitEdit(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    requestSize: string
  ) {
    const form = new FormData();
    form.append("model", request.model);
    form.append("prompt", request.prompt);
    form.append("size", requestSize);
    form.append("n", "1");
    form.append("response_format", "b64_json");
    for (const reference of request.references) {
      form.append(
        "image",
        new Blob([new Uint8Array(reference.buffer)], { type: reference.mimeType }),
        reference.filename
      );
    }
    return this.fetchGeneration(endpoint(provider.baseUrl, "images/edits"), {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      body: form
    });
  }

  private async fetchGeneration(url: string, init: RequestInit) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          ...init,
          signal: AbortSignal.timeout(this.timeoutMs)
        });
      } catch (error) {
        throw new UnknownSubmissionError(
          `YM2 请求状态未知：${error instanceof Error ? error.message : "网络错误"}`
        );
      }

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : attempt * 1000;
        await this.sleep(delay);
        continue;
      }
      if (response.status >= 500) {
        const message = excerpt(await response.text());
        throw new UnknownSubmissionError(`YM2 请求状态未知：${response.status} ${message}`);
      }
      if (!response.ok) {
        throw new Error(`YM2 请求失败：${response.status} ${excerpt(await response.text())}`);
      }
      try {
        return await response.json() as unknown;
      } catch {
        throw new UnknownSubmissionError("YM2 请求状态未知：成功响应不是有效 JSON");
      }
    }
    throw new Error("YM2 429 重试次数已用尽");
  }

  private async normalizeGenerationResponse(
    value: unknown,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage> {
    const root = value && typeof value === "object" ? value as Record<string, unknown> : null;
    const data = Array.isArray(root?.data) ? root.data : [];
    const first = data[0] && typeof data[0] === "object"
      ? data[0] as Record<string, unknown>
      : null;
    const base64 = typeof first?.b64_json === "string" ? first.b64_json : null;
    if (base64) {
      return { buffer: Buffer.from(base64, "base64"), mimeType: "image/png" };
    }
    const url = typeof first?.url === "string" && first.url ? first.url : null;
    if (url) {
      onRemoteReference({ resultUrl: url });
      return this.downloadResult(url);
    }
    throw new UnknownSubmissionError("YM2 请求状态未知：响应中没有图片结果");
  }

  private async downloadResult(url: string): Promise<AdapterGeneratedImage> {
    let response: Response;
    try {
      response = await this.fetchImpl(url);
    } catch (error) {
      throw new Error(`下载 YM2 结果失败：${error instanceof Error ? error.message : "网络错误"}`);
    }
    if (!response.ok) {
      throw new Error(`下载 YM2 结果失败：${response.status}`);
    }
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") ?? "image/png"
    };
  }
}

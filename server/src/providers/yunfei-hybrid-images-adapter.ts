import {
  UnknownSubmissionError,
  type AdapterGeneratedImage,
  type AdapterGenerationRequest,
  type AdapterRemoteReference,
  type GenerationMode,
  type ProviderAdapter,
  type ProviderYunfeiKeyType,
  type ProviderRuntimeConfig
} from "./provider-adapter.js";

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

type YunfeiAdapterOptions = {
  fetchImpl?: FetchImplementation;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
};

const gptSizes = {
  "1K": { requestSize: "1280x720", width: 1280, height: 720 },
  "2K": { requestSize: "2048x1152", width: 2048, height: 1152 },
  "4K": { requestSize: "3840x2160", width: 3840, height: 2160 }
} as const;

const bananaSizes = {
  "1K": { requestSize: "1K", width: 1376, height: 768 },
  "2K": { requestSize: "2K", width: 2752, height: 1536 },
  "4K": { requestSize: "4K", width: 5504, height: 3072 }
} as const;

const bananaModels = new Set([
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview"
]);

const keyProducts: Record<ProviderYunfeiKeyType, {
  errorLabel: string;
  model: string;
  modelLabel: string;
  resolutions: string[];
}> = {
  "gpt-image-2-1k": {
    errorLabel: "云飞 GPT Image 2 · 1K",
    model: "gpt-image-2",
    modelLabel: "gpt-image-2（云飞）",
    resolutions: ["1K"]
  },
  "gpt-image-2-4k": {
    errorLabel: "云飞 GPT Image 2 · 4K",
    model: "gpt-image-2",
    modelLabel: "gpt-image-2（云飞）",
    resolutions: ["1K", "2K", "4K"]
  },
  "banana-2": {
    errorLabel: "云飞香蕉2",
    model: "gemini-3.1-flash-image-preview",
    modelLabel: "Nano Banana 2",
    resolutions: ["1K", "2K", "4K"]
  },
  "banana-pro": {
    errorLabel: "云飞香蕉Pro",
    model: "gemini-3-pro-image-preview",
    modelLabel: "Nano Banana Pro",
    resolutions: ["1K", "2K", "4K"]
  }
};

function requireKeyProduct(provider: ProviderRuntimeConfig) {
  if (!provider.yunfeiKeyType) throw new Error("云飞中转站缺少密钥类型");
  return keyProducts[provider.yunfeiKeyType];
}

function providerOrigin(baseUrl: string) {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, "");
  if (path && path !== "/v1") {
    throw new Error("云飞 Base URL 仅支持站点根地址或 /v1");
  }
  return url.origin;
}

function endpoint(provider: ProviderRuntimeConfig, path: string) {
  return `${providerOrigin(provider.baseUrl)}${path}`;
}

function excerpt(value: string) {
  return value.slice(0, 500);
}

export class YunfeiHybridImagesAdapter implements ProviderAdapter {
  readonly protocolType = "yunfei-hybrid-images" as const;
  private readonly fetchImpl: FetchImplementation;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutMs: number;

  constructor(options: YunfeiAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => (
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    ));
    this.timeoutMs = options.timeoutMs ?? 300_000;
  }

  capabilities(provider: ProviderRuntimeConfig, _mode: GenerationMode) {
    const product = requireKeyProduct(provider);
    const resolutions = [...product.resolutions];
    return [{
      value: product.model,
      label: product.modelLabel,
      aspectRatios: ["16:9"],
      resolutions,
      supportedResolutionsByAspectRatio: { "16:9": resolutions },
      maxN: 10,
      supportsReferenceImages: true
    }];
  }

  resolveRequest(provider: ProviderRuntimeConfig, request: AdapterGenerationRequest) {
    if (request.aspectRatio !== "16:9") throw new Error("云飞仅支持 16:9");
    const product = requireKeyProduct(provider);
    if (request.model !== product.model) {
      throw new Error(`${product.errorLabel}密钥不支持模型 ${request.model}`);
    }
    if (!product.resolutions.includes(request.resolution)) {
      throw new Error(`${product.errorLabel} 密钥不支持 ${request.resolution}`);
    }
    const sizes = request.model === "gpt-image-2"
      ? gptSizes
      : bananaModels.has(request.model)
        ? bananaSizes
        : null;
    if (!sizes) throw new Error(`云飞不支持模型 ${request.model}`);
    const size = sizes[request.resolution as keyof typeof sizes];
    if (!size) throw new Error(`云飞不支持 ${request.aspectRatio} · ${request.resolution}`);
    return {
      requestSize: size.requestSize,
      expectedDimensions: { width: size.width, height: size.height }
    };
  }

  async generate(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ) {
    const { requestSize } = this.resolveRequest(provider, request);
    if (request.model === "gpt-image-2") {
      const response = request.references.length > 0
        ? await this.submitGptEdit(provider, request, requestSize)
        : await this.submitGptGeneration(provider, request, requestSize);
      return this.normalizeGptResponse(response, onRemoteReference);
    }
    if (!bananaModels.has(request.model)) throw new Error(`云飞不支持模型 ${request.model}`);
    const response = await this.submitBanana(provider, request, requestSize);
    return this.normalizeBananaResponse(response, onRemoteReference);
  }

  async recover(
    _provider: ProviderRuntimeConfig,
    _request: AdapterGenerationRequest,
    remote: AdapterRemoteReference,
    _onRemoteReference: (reference: AdapterRemoteReference) => void
  ) {
    if (!remote.resultUrl) throw new Error("云飞没有可恢复的结果地址");
    return this.downloadResult(remote.resultUrl);
  }

  private submitGptGeneration(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    requestSize: string
  ) {
    return this.fetchJson(endpoint(provider, "/v1/images/generations"), {
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

  private submitGptEdit(
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
        "image[]",
        new Blob([new Uint8Array(reference.buffer)], { type: reference.mimeType }),
        reference.filename
      );
    }
    return this.fetchJson(endpoint(provider, "/v1/images/edits"), {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      body: form
    });
  }

  private submitBanana(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    requestSize: string
  ) {
    const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];
    for (const reference of request.references) {
      parts.push({
        inline_data: {
          mime_type: reference.mimeType,
          data: reference.buffer.toString("base64")
        }
      });
    }
    return this.fetchJson(
      endpoint(provider, `/v1beta/models/${request.model}:generateContent`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": provider.apiKey
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: {
              aspectRatio: "16:9",
              imageSize: requestSize
            }
          }
        })
      }
    );
  }

  private async fetchJson(url: string, init: RequestInit) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          ...init,
          signal: AbortSignal.timeout(this.timeoutMs)
        });
      } catch (error) {
        throw new UnknownSubmissionError(
          `云飞请求状态未知：${error instanceof Error ? error.message : "网络错误"}`
        );
      }
      if (response.status === 429) {
        if (attempt === 3) throw new Error("云飞 429 重试次数已用尽");
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
        await this.sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : attempt * 1000);
        continue;
      }
      if (response.status >= 500) {
        throw new UnknownSubmissionError(
          `云飞请求状态未知：${response.status} ${excerpt(await response.text())}`
        );
      }
      if (!response.ok) {
        throw new Error(`云飞请求失败：${response.status} ${excerpt(await response.text())}`);
      }
      try {
        return await response.json() as unknown;
      } catch {
        throw new UnknownSubmissionError("云飞请求状态未知：成功响应不是有效 JSON");
      }
    }
    throw new Error("云飞 429 重试次数已用尽");
  }

  private async normalizeGptResponse(
    value: unknown,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage> {
    const root = value && typeof value === "object" ? value as Record<string, unknown> : null;
    const data = Array.isArray(root?.data) ? root.data : [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const base64 = (item as Record<string, unknown>).b64_json;
      if (typeof base64 === "string" && base64) {
        return { buffer: Buffer.from(base64, "base64"), mimeType: "image/png" };
      }
    }
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const url = (item as Record<string, unknown>).url;
      if (typeof url === "string" && url) {
        onRemoteReference({ resultUrl: url });
        return this.downloadResult(url);
      }
    }
    throw new UnknownSubmissionError("云飞请求状态未知：响应中没有图片结果");
  }

  private async normalizeBananaResponse(
    value: unknown,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage> {
    const root = value && typeof value === "object" ? value as Record<string, unknown> : null;
    const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
    const parts: Record<string, unknown>[] = [];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const content = (candidate as Record<string, unknown>).content;
      if (!content || typeof content !== "object") continue;
      const candidateParts = (content as Record<string, unknown>).parts;
      if (!Array.isArray(candidateParts)) continue;
      for (const part of candidateParts) {
        if (part && typeof part === "object") parts.push(part as Record<string, unknown>);
      }
    }
    for (const part of parts) {
      const inlineData = part.inline_data;
      if (!inlineData || typeof inlineData !== "object") continue;
      const inline = inlineData as Record<string, unknown>;
      if (typeof inline.data === "string" && inline.data) {
        return {
          buffer: Buffer.from(inline.data, "base64"),
          mimeType: typeof inline.mime_type === "string" ? inline.mime_type : "image/png"
        };
      }
    }
    for (const part of parts) {
      const fileData = part.file_data;
      if (!fileData || typeof fileData !== "object") continue;
      const file = fileData as Record<string, unknown>;
      if (typeof file.file_uri === "string" && file.file_uri) {
        onRemoteReference({ resultUrl: file.file_uri });
        return this.downloadResult(file.file_uri);
      }
    }
    throw new UnknownSubmissionError("云飞请求状态未知：响应中没有图片结果");
  }

  private async downloadResult(url: string): Promise<AdapterGeneratedImage> {
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new Error(`下载云飞结果失败：${response.status}`);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") ?? "image/png"
    };
  }
}

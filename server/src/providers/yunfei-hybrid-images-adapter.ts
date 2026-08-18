import type {
  AdapterGeneratedImage,
  AdapterGenerationRequest,
  AdapterRemoteReference,
  GenerationMode,
  ProviderAdapter,
  ProviderResolutionTier,
  ProviderRuntimeConfig
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

function requireTier(provider: ProviderRuntimeConfig): ProviderResolutionTier {
  if (!provider.resolutionTier) throw new Error("云飞中转站缺少密钥规格");
  return provider.resolutionTier;
}

function availableResolutions(provider: ProviderRuntimeConfig) {
  return requireTier(provider) === "1K" ? ["1K"] : ["1K", "2K", "4K"];
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
    const resolutions = availableResolutions(provider);
    const shared = {
      aspectRatios: ["16:9"],
      resolutions,
      supportedResolutionsByAspectRatio: { "16:9": resolutions },
      maxN: 10,
      supportsReferenceImages: true
    };
    return [
      { value: "gpt-image-2", label: "gpt-image-2（云飞）", ...shared },
      {
        value: "gemini-3.1-flash-image-preview",
        label: "Nano Banana 2",
        ...shared
      },
      {
        value: "gemini-3-pro-image-preview",
        label: "Nano Banana Pro",
        ...shared
      }
    ];
  }

  resolveRequest(provider: ProviderRuntimeConfig, request: AdapterGenerationRequest) {
    if (request.aspectRatio !== "16:9") throw new Error("云飞仅支持 16:9");
    const tier = requireTier(provider);
    if (tier === "1K" && request.resolution !== "1K") {
      throw new Error(`云飞 1K 密钥不支持 ${request.resolution}`);
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
    if (request.model !== "gpt-image-2") {
      throw new Error(`云飞不支持模型 ${request.model}`);
    }
    const response = request.references.length > 0
      ? await this.submitGptEdit(provider, request, requestSize)
      : await this.submitGptGeneration(provider, request, requestSize);
    return this.normalizeGptResponse(response, onRemoteReference);
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

  private async fetchJson(url: string, init: RequestInit) {
    const response = await this.fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) throw new Error(`云飞请求失败：${response.status}`);
    return response.json() as Promise<unknown>;
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
    throw new Error("云飞响应中没有图片结果");
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

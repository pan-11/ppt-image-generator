import { describe, expect, it, vi } from "vitest";
import type {
  AdapterGenerationRequest,
  ProviderRuntimeConfig
} from "../src/providers/provider-adapter.js";
import { UnknownSubmissionError } from "../src/providers/provider-adapter.js";
import { YunfeiHybridImagesAdapter } from "../src/providers/yunfei-hybrid-images-adapter.js";

const providerGpt1K: ProviderRuntimeConfig = {
  id: "yunfei-1k",
  name: "云飞 1K",
  baseUrl: "https://img.yunfei.best",
  apiKey: "yunfei-secret",
  protocolType: "yunfei-hybrid-images",
  yunfeiKeyType: "gpt-image-2-1k",
  configRevision: "revision-1k",
  maxConcurrency: 100
};

const providerGpt4K: ProviderRuntimeConfig = {
  ...providerGpt1K,
  id: "yunfei-4k",
  name: "云飞 4K",
  baseUrl: "https://img.yunfei.best/v1/",
  yunfeiKeyType: "gpt-image-2-4k",
  configRevision: "revision-4k"
};

const providerBanana2: ProviderRuntimeConfig = {
  ...providerGpt1K,
  id: "yunfei-banana-2",
  name: "云飞 香蕉2",
  yunfeiKeyType: "banana-2",
  configRevision: "revision-banana-2"
};

const providerBananaPro: ProviderRuntimeConfig = {
  ...providerGpt1K,
  id: "yunfei-banana-pro",
  name: "云飞 香蕉Pro",
  yunfeiKeyType: "banana-pro",
  configRevision: "revision-banana-pro"
};

const textRequest: AdapterGenerationRequest = {
  prompt: "16:9 product photo without text",
  model: "gpt-image-2",
  aspectRatio: "16:9",
  resolution: "2K",
  references: []
};

function gptImageResponse(bytes = "yunfei-image") {
  return new Response(JSON.stringify({
    data: [{ b64_json: Buffer.from(bytes).toString("base64") }]
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

describe("YunfeiHybridImagesAdapter GPT Images", () => {
  it("exposes exactly one model with resolutions allowed by each key product", () => {
    const adapter = new YunfeiHybridImagesAdapter();
    const cases = [
      [providerGpt1K, "gpt-image-2", ["1K"]],
      [providerGpt4K, "gpt-image-2", ["1K", "2K", "4K"]],
      [providerBanana2, "gemini-3.1-flash-image-preview", ["1K", "2K", "4K"]],
      [providerBananaPro, "gemini-3-pro-image-preview", ["1K", "2K", "4K"]]
    ] as const;

    for (const [provider, model, resolutions] of cases) {
      const capabilities = adapter.capabilities(provider, "text");
      expect(capabilities).toHaveLength(1);
      expect(capabilities[0]).toMatchObject({
        value: model,
        resolutions: [...resolutions],
        aspectRatios: ["16:9"],
        maxN: 10,
        supportsReferenceImages: true
      });
    }
  });

  it("resolves documented 16:9 sizes and rejects key-product violations before fetch", () => {
    const fetchMock = vi.fn();
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });

    expect(adapter.resolveRequest(providerGpt4K, { ...textRequest, resolution: "1K" })).toEqual({
      requestSize: "1280x720",
      expectedDimensions: { width: 1280, height: 720 }
    });
    expect(adapter.resolveRequest(providerGpt1K, { ...textRequest, resolution: "1K" })).toEqual({
      requestSize: "1280x720",
      expectedDimensions: { width: 1672, height: 941 }
    });
    expect(adapter.resolveRequest(providerGpt4K, textRequest)).toEqual({
      requestSize: "2048x1152",
      expectedDimensions: { width: 2048, height: 1152 }
    });
    expect(adapter.resolveRequest(providerGpt4K, { ...textRequest, resolution: "4K" })).toEqual({
      requestSize: "3840x2160",
      expectedDimensions: { width: 3840, height: 2160 }
    });
    expect(adapter.resolveRequest(providerBanana2, {
      ...textRequest,
      model: "gemini-3.1-flash-image-preview",
      resolution: "2K"
    })).toEqual({
      requestSize: "2K",
      expectedDimensions: { width: 2752, height: 1536 }
    });
    expect(() => adapter.resolveRequest(providerGpt1K, textRequest))
      .toThrow("云飞 GPT Image 2 · 1K 密钥不支持 2K");
    expect(() => adapter.resolveRequest(providerBanana2, {
      ...textRequest,
      model: "gemini-3-pro-image-preview",
      resolution: "1K"
    })).toThrow("云飞香蕉2密钥不支持模型 gemini-3-pro-image-preview");
    expect(() => adapter.resolveRequest(providerGpt4K, { ...textRequest, aspectRatio: "4:3" }))
      .toThrow("云飞仅支持 16:9");
    expect(() => adapter.capabilities({ ...providerGpt1K, yunfeiKeyType: undefined }, "text"))
      .toThrow("云飞中转站缺少密钥类型");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes root and trailing v1 URLs for exact GPT JSON generation requests", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(gptImageResponse("root"))
      .mockResolvedValueOnce(gptImageResponse("v1"));
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });

    const rootResult = await adapter.generate(
      { ...providerGpt4K, baseUrl: "https://img.yunfei.best" },
      textRequest,
      () => undefined
    );
    const v1Result = await adapter.generate(providerGpt4K, textRequest, () => undefined);

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://img.yunfei.best/v1/images/generations",
      "https://img.yunfei.best/v1/images/generations"
    ]);
    const firstInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(firstInit).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer yunfei-secret"
      }
    });
    expect(JSON.parse(String(firstInit.body))).toEqual({
      model: "gpt-image-2",
      prompt: "16:9 product photo without text",
      size: "2048x1152",
      n: 1,
      response_format: "b64_json"
    });
    expect(rootResult.buffer).toEqual(Buffer.from("root"));
    expect(v1Result.buffer).toEqual(Buffer.from("v1"));
  });

  it("sends documented repeated image array fields for GPT edits", async () => {
    const fetchMock = vi.fn().mockResolvedValue(gptImageResponse("edited"));
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });
    const request: AdapterGenerationRequest = {
      ...textRequest,
      references: [
        { id: "ref-1", filename: "first.png", mimeType: "image/png", buffer: Buffer.from("first") },
        { id: "ref-2", filename: "second.jpg", mimeType: "image/jpeg", buffer: Buffer.from("second") }
      ]
    };

    await adapter.generate(providerGpt4K, request, () => undefined);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://img.yunfei.best/v1/images/edits");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer yunfei-secret" });
    const form = init.body as FormData;
    expect(form.get("model")).toBe("gpt-image-2");
    expect(form.get("prompt")).toBe(textRequest.prompt);
    expect(form.get("size")).toBe("2048x1152");
    expect(form.get("n")).toBe("1");
    expect(form.get("response_format")).toBe("b64_json");
    expect(form.getAll("image[]")).toHaveLength(2);
    expect(form.getAll("image")).toHaveLength(0);
  });

  it("downloads short-lived GPT URL results immediately and records recovery data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ url: "https://images.example.com/yunfei.png" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(Buffer.from("downloaded"), {
        status: 200,
        headers: { "Content-Type": "image/webp" }
      }))
      .mockResolvedValueOnce(new Response(Buffer.from("recovered"), {
        status: 200,
        headers: { "Content-Type": "image/png" }
      }));
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });
    const remotes: unknown[] = [];

    const generated = await adapter.generate(providerGpt4K, textRequest, (remote) => remotes.push(remote));
    const recovered = await adapter.recover(
      providerGpt4K,
      textRequest,
      { resultUrl: "https://images.example.com/yunfei.png" },
      () => undefined
    );

    expect(remotes).toEqual([{ resultUrl: "https://images.example.com/yunfei.png" }]);
    expect(generated).toEqual({ buffer: Buffer.from("downloaded"), mimeType: "image/webp" });
    expect(recovered).toEqual({ buffer: Buffer.from("recovered"), mimeType: "image/png" });
  });

  it("requests URL results for 4K GPT generations and edits", async () => {
    const urlResponse = () => new Response(JSON.stringify({
      data: [{ url: "https://images.example.com/yunfei-4k.png" }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(urlResponse())
      .mockResolvedValueOnce(new Response(Buffer.from("generated-4k"), {
        status: 200,
        headers: { "Content-Type": "image/png" }
      }))
      .mockResolvedValueOnce(urlResponse())
      .mockResolvedValueOnce(new Response(Buffer.from("edited-4k"), {
        status: 200,
        headers: { "Content-Type": "image/png" }
      }));
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });
    const request: AdapterGenerationRequest = { ...textRequest, resolution: "4K" };

    await adapter.generate(providerGpt4K, request, () => undefined);
    await adapter.generate(providerGpt4K, {
      ...request,
      references: [{
        id: "ref-4k",
        filename: "reference.png",
        mimeType: "image/png",
        buffer: Buffer.from("reference")
      }]
    }, () => undefined);

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)))
      .toMatchObject({ response_format: "url" });
    expect((fetchMock.mock.calls[2][1] as RequestInit).body).toBeInstanceOf(FormData);
    expect(((fetchMock.mock.calls[2][1] as RequestInit).body as FormData).get("response_format"))
      .toBe("url");
  });

  it("rejects unsupported Base URL paths before sending a request", async () => {
    const fetchMock = vi.fn();
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });

    await expect(adapter.generate(
      { ...providerGpt4K, baseUrl: "https://img.yunfei.best/custom" },
      textRequest,
      () => undefined
    )).rejects.toThrow("云飞 Base URL 仅支持站点根地址或 /v1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("YunfeiHybridImagesAdapter Gemini native", () => {
  it("sends exact Gemini text-to-image headers and body for both Banana model IDs", async () => {
    const inline = Buffer.from("banana-inline").toString("base64");
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/png", data: inline } }] } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });
    const request: AdapterGenerationRequest = {
      ...textRequest,
      model: "gemini-3.1-flash-image-preview"
    };

    const result = await adapter.generate(providerBanana2, request, () => undefined);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://img.yunfei.best/v1beta/models/gemini-3.1-flash-image-preview:generateContent"
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": "yunfei-secret"
      }
    });
    expect(JSON.parse(String(init.body))).toEqual({
      contents: [{
        role: "user",
        parts: [{ text: "16:9 product photo without text" }]
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "16:9", imageSize: "2K" }
      }
    });
    expect(result).toEqual({ buffer: Buffer.from("banana-inline"), mimeType: "image/png" });

    await adapter.generate(providerBananaPro, { ...request, model: "gemini-3-pro-image-preview" }, () => undefined);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://img.yunfei.best/v1beta/models/gemini-3-pro-image-preview:generateContent"
    );
  });

  it("keeps the prompt first and preserves ordered inline reference parts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inline_data: {
        mime_type: "image/webp",
        data: Buffer.from("edited").toString("base64")
      } }] } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });
    const request: AdapterGenerationRequest = {
      ...textRequest,
      model: "gemini-3-pro-image-preview",
      resolution: "1K",
      references: [
        { id: "ref-1", filename: "first.png", mimeType: "image/png", buffer: Buffer.from("first") },
        { id: "ref-2", filename: "second.jpg", mimeType: "image/jpeg", buffer: Buffer.from("second") }
      ]
    };

    await adapter.generate(providerBananaPro, request, () => undefined);

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.contents[0].parts).toEqual([
      { text: textRequest.prompt },
      { inline_data: { mime_type: "image/png", data: Buffer.from("first").toString("base64") } },
      { inline_data: { mime_type: "image/jpeg", data: Buffer.from("second").toString("base64") } }
    ]);
  });

  it("scans every candidate and part for the first inline image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [
        { content: { parts: [{ text: "no image here" }] } },
        { content: { parts: [
          { text: "still no image" },
          { inline_data: {
            mime_type: "image/webp",
            data: Buffer.from("banana-image").toString("base64")
          } }
        ] } }
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });

    const result = await adapter.generate(providerBanana2, {
      ...textRequest,
      model: "gemini-3.1-flash-image-preview"
    }, () => undefined);

    expect(result).toEqual({ buffer: Buffer.from("banana-image"), mimeType: "image/webp" });
  });

  it("accepts the official Gemini camelCase inlineData response fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: {
        mimeType: "image/png",
        data: Buffer.from("camel-inline").toString("base64")
      } }] } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });

    const result = await adapter.generate(providerBanana2, {
      ...textRequest,
      model: "gemini-3.1-flash-image-preview"
    }, () => undefined);

    expect(result).toEqual({ buffer: Buffer.from("camel-inline"), mimeType: "image/png" });
  });

  it("accepts the official Gemini camelCase fileData response fields", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ fileData: {
          mimeType: "image/jpeg",
          fileUri: "https://images.example.com/camel-banana.jpg"
        } }] } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(Buffer.from("camel-file"), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" }
      }));
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });
    const remotes: unknown[] = [];

    const result = await adapter.generate(providerBananaPro, {
      ...textRequest,
      model: "gemini-3-pro-image-preview"
    }, (remote) => remotes.push(remote));

    expect(remotes).toEqual([{ resultUrl: "https://images.example.com/camel-banana.jpg" }]);
    expect(result).toEqual({ buffer: Buffer.from("camel-file"), mimeType: "image/jpeg" });
  });

  it("downloads and records Gemini file data immediately", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ file_data: {
          mime_type: "image/jpeg",
          file_uri: "https://images.example.com/banana.jpg"
        } }] } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(Buffer.from("banana-url"), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" }
      }));
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });
    const remotes: unknown[] = [];

    const result = await adapter.generate(providerBananaPro, {
      ...textRequest,
      model: "gemini-3-pro-image-preview"
    }, (remote) => remotes.push(remote));

    expect(remotes).toEqual([{ resultUrl: "https://images.example.com/banana.jpg" }]);
    expect(result).toEqual({ buffer: Buffer.from("banana-url"), mimeType: "image/jpeg" });
  });
});

describe("YunfeiHybridImagesAdapter synchronous failure safety", () => {
  it("retries explicit 429 rejections but treats exhausted 429 as safe failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("rate-one", { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(new Response("rate-two", { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(gptImageResponse("after-retry"));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock, sleep });

    await expect(adapter.generate(providerGpt4K, textRequest, () => undefined))
      .resolves.toMatchObject({ buffer: Buffer.from("after-retry") });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);

    const exhaustedSleep = vi.fn().mockResolvedValue(undefined);
    const exhausted = new YunfeiHybridImagesAdapter({
      fetchImpl: vi.fn().mockResolvedValue(new Response("rate", { status: 429 })),
      sleep: exhaustedSleep
    });
    await expect(exhausted.generate(providerGpt4K, textRequest, () => undefined))
      .rejects.toThrow("云飞 429 重试次数已用尽");
    expect(exhaustedSleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([1000, 2000]);
  });

  it("keeps deterministic 4xx errors safe and sanitized", async () => {
    const longMessage = `invalid-size-${"x".repeat(600)}`;
    const adapter = new YunfeiHybridImagesAdapter({
      fetchImpl: vi.fn().mockResolvedValue(new Response(longMessage, { status: 400 }))
    });

    await expect(adapter.generate(providerGpt4K, textRequest, () => undefined))
      .rejects.toThrow(`云飞请求失败：400 ${longMessage.slice(0, 500)}`);
  });

  it("marks server, network, malformed, and image-less successes unknown", async () => {
    const serverError = new YunfeiHybridImagesAdapter({
      fetchImpl: vi.fn().mockResolvedValue(new Response("uncertain", { status: 500 }))
    });
    await expect(serverError.generate(providerGpt4K, textRequest, () => undefined))
      .rejects.toBeInstanceOf(UnknownSubmissionError);

    const networkError = new YunfeiHybridImagesAdapter({
      fetchImpl: vi.fn().mockRejectedValue(new Error("socket closed"))
    });
    await expect(networkError.generate(providerGpt4K, textRequest, () => undefined))
      .rejects.toBeInstanceOf(UnknownSubmissionError);

    const malformed = new YunfeiHybridImagesAdapter({
      fetchImpl: vi.fn().mockResolvedValue(new Response("not-json", { status: 200 }))
    });
    await expect(malformed.generate(providerGpt4K, textRequest, () => undefined))
      .rejects.toBeInstanceOf(UnknownSubmissionError);

    const noImage = new YunfeiHybridImagesAdapter({
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
    });
    await expect(noImage.generate(providerGpt4K, textRequest, () => undefined))
      .rejects.toBeInstanceOf(UnknownSubmissionError);
  });

  it("records a URL before a failed download so the job can recover", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ url: "https://images.example.com/recoverable.png" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("expired", { status: 502 }));
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });
    const remotes: unknown[] = [];

    await expect(adapter.generate(providerGpt4K, textRequest, (remote) => remotes.push(remote)))
      .rejects.toThrow("下载云飞结果失败：502");
    expect(remotes).toEqual([{ resultUrl: "https://images.example.com/recoverable.png" }]);
  });
});

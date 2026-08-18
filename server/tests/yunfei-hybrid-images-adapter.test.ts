import { describe, expect, it, vi } from "vitest";
import type {
  AdapterGenerationRequest,
  ProviderRuntimeConfig
} from "../src/providers/provider-adapter.js";
import { YunfeiHybridImagesAdapter } from "../src/providers/yunfei-hybrid-images-adapter.js";

const provider1K: ProviderRuntimeConfig = {
  id: "yunfei-1k",
  name: "云飞 1K",
  baseUrl: "https://img.yunfei.best",
  apiKey: "yunfei-secret",
  protocolType: "yunfei-hybrid-images",
  resolutionTier: "1K",
  configRevision: "revision-1k",
  maxConcurrency: 100
};

const provider4K: ProviderRuntimeConfig = {
  ...provider1K,
  id: "yunfei-4k",
  name: "云飞 4K",
  baseUrl: "https://img.yunfei.best/v1/",
  resolutionTier: "4K",
  configRevision: "revision-4k"
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
  it("exposes all three models with resolutions limited by key tier", () => {
    const adapter = new YunfeiHybridImagesAdapter();
    const oneK = adapter.capabilities(provider1K, "text");
    const fourK = adapter.capabilities(provider4K, "image");

    expect(oneK).toEqual([
      expect.objectContaining({ value: "gpt-image-2", label: "gpt-image-2（云飞）", resolutions: ["1K"] }),
      expect.objectContaining({
        value: "gemini-3.1-flash-image-preview",
        label: "Nano Banana 2",
        resolutions: ["1K"]
      }),
      expect.objectContaining({
        value: "gemini-3-pro-image-preview",
        label: "Nano Banana Pro",
        resolutions: ["1K"]
      })
    ]);
    expect(fourK.map((model) => model.resolutions)).toEqual([
      ["1K", "2K", "4K"],
      ["1K", "2K", "4K"],
      ["1K", "2K", "4K"]
    ]);
    expect([...oneK, ...fourK].every((model) => (
      model.aspectRatios.length === 1
      && model.aspectRatios[0] === "16:9"
      && model.maxN === 10
      && model.supportsReferenceImages
    ))).toBe(true);
  });

  it("resolves documented 16:9 sizes and rejects tier violations before fetch", () => {
    const fetchMock = vi.fn();
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });

    expect(adapter.resolveRequest(provider4K, { ...textRequest, resolution: "1K" })).toEqual({
      requestSize: "1280x720",
      expectedDimensions: { width: 1280, height: 720 }
    });
    expect(adapter.resolveRequest(provider4K, textRequest)).toEqual({
      requestSize: "2048x1152",
      expectedDimensions: { width: 2048, height: 1152 }
    });
    expect(adapter.resolveRequest(provider4K, { ...textRequest, resolution: "4K" })).toEqual({
      requestSize: "3840x2160",
      expectedDimensions: { width: 3840, height: 2160 }
    });
    expect(adapter.resolveRequest(provider4K, {
      ...textRequest,
      model: "gemini-3.1-flash-image-preview",
      resolution: "2K"
    })).toEqual({
      requestSize: "2K",
      expectedDimensions: { width: 2752, height: 1536 }
    });
    expect(() => adapter.resolveRequest(provider1K, textRequest))
      .toThrow("云飞 1K 密钥不支持 2K");
    expect(() => adapter.resolveRequest(provider4K, { ...textRequest, aspectRatio: "4:3" }))
      .toThrow("云飞仅支持 16:9");
    expect(() => adapter.capabilities({ ...provider1K, resolutionTier: undefined }, "text"))
      .toThrow("云飞中转站缺少密钥规格");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes root and trailing v1 URLs for exact GPT JSON generation requests", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(gptImageResponse("root"))
      .mockResolvedValueOnce(gptImageResponse("v1"));
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });

    const rootResult = await adapter.generate(
      { ...provider4K, baseUrl: "https://img.yunfei.best" },
      textRequest,
      () => undefined
    );
    const v1Result = await adapter.generate(provider4K, textRequest, () => undefined);

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

    await adapter.generate(provider4K, request, () => undefined);

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

    const generated = await adapter.generate(provider4K, textRequest, (remote) => remotes.push(remote));
    const recovered = await adapter.recover(
      provider4K,
      textRequest,
      { resultUrl: "https://images.example.com/yunfei.png" },
      () => undefined
    );

    expect(remotes).toEqual([{ resultUrl: "https://images.example.com/yunfei.png" }]);
    expect(generated).toEqual({ buffer: Buffer.from("downloaded"), mimeType: "image/webp" });
    expect(recovered).toEqual({ buffer: Buffer.from("recovered"), mimeType: "image/png" });
  });

  it("rejects unsupported Base URL paths before sending a request", async () => {
    const fetchMock = vi.fn();
    const adapter = new YunfeiHybridImagesAdapter({ fetchImpl: fetchMock });

    await expect(adapter.generate(
      { ...provider4K, baseUrl: "https://img.yunfei.best/custom" },
      textRequest,
      () => undefined
    )).rejects.toThrow("云飞 Base URL 仅支持站点根地址或 /v1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

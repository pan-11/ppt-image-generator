import { describe, expect, it, vi } from "vitest";
import { UnknownSubmissionError, type AdapterGenerationRequest, type ProviderRuntimeConfig } from "../src/providers/provider-adapter.js";
import { Ym2OpenAiImagesAdapter } from "../src/providers/ym2-openai-images-adapter.js";

const provider: ProviderRuntimeConfig = {
  id: "ym2",
  name: "YM2",
  baseUrl: "https://yyds.example/v1",
  apiKey: "ym2-secret",
  protocolType: "ym2-openai-images",
  configRevision: "revision-1",
  maxConcurrency: 100
};

const textRequest: AdapterGenerationRequest = {
  prompt: "16:9 classroom slide",
  model: "gpt-image-2",
  aspectRatio: "16:9",
  resolution: "2K",
  references: []
};

function imageResponse(bytes = "ym2-image") {
  return new Response(JSON.stringify({
    data: [{ b64_json: Buffer.from(bytes).toString("base64") }]
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

describe("Ym2OpenAiImagesAdapter", () => {
  it("sends exact JSON text-to-image payload with verified 16:9 sizes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(imageResponse());
    const adapter = new Ym2OpenAiImagesAdapter({ fetchImpl: fetchMock });

    const result = await adapter.generate(provider, textRequest, () => undefined);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://yyds.example/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer ym2-secret"
        }
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      model: "gpt-image-2",
      prompt: "16:9 classroom slide",
      size: "2048x1152",
      n: 1,
      response_format: "b64_json"
    });
    expect(result).toEqual({ buffer: Buffer.from("ym2-image"), mimeType: "image/png" });
    expect(adapter.resolveRequest(provider, { ...textRequest, resolution: "1K" })).toEqual({
      requestSize: "1280x720",
      expectedDimensions: { width: 1280, height: 720 }
    });
    expect(adapter.resolveRequest(provider, textRequest)).toEqual({
      requestSize: "2048x1152",
      expectedDimensions: { width: 2048, height: 1152 }
    });
    expect(adapter.resolveRequest(provider, { ...textRequest, resolution: "4K" })).toEqual({
      requestSize: "3840x2160",
      expectedDimensions: { width: 3840, height: 2160 }
    });
  });

  it("sends multipart image edits with repeated local image fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(imageResponse("edited"));
    const adapter = new Ym2OpenAiImagesAdapter({ fetchImpl: fetchMock });
    const request: AdapterGenerationRequest = {
      ...textRequest,
      references: [
        { id: "ref-1", filename: "first.png", mimeType: "image/png", buffer: Buffer.from("first") },
        { id: "ref-2", filename: "second.jpg", mimeType: "image/jpeg", buffer: Buffer.from("second") }
      ]
    };

    await adapter.generate(provider, request, () => undefined);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://yyds.example/v1/images/edits");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer ym2-secret" });
    const form = init.body as FormData;
    expect(form.get("model")).toBe("gpt-image-2");
    expect(form.get("prompt")).toBe(textRequest.prompt);
    expect(form.get("size")).toBe("2048x1152");
    expect(form.get("n")).toBe("1");
    expect(form.getAll("image")).toHaveLength(2);
  });

  it("retries rejected 429 requests but not deterministic or ambiguous failures", async () => {
    const fetch429 = vi.fn()
      .mockResolvedValueOnce(new Response("rate", { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(new Response("rate", { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(imageResponse("after-retry"));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const retrying = new Ym2OpenAiImagesAdapter({ fetchImpl: fetch429, sleep });

    await expect(retrying.generate(provider, textRequest, () => undefined))
      .resolves.toMatchObject({ buffer: Buffer.from("after-retry") });
    expect(fetch429).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);

    const badRequest = new Ym2OpenAiImagesAdapter({
      fetchImpl: vi.fn().mockResolvedValue(new Response("bad", { status: 400 }))
    });
    await expect(badRequest.generate(provider, textRequest, () => undefined))
      .rejects.toThrow("YM2 请求失败：400 bad");

    const serverError = new Ym2OpenAiImagesAdapter({
      fetchImpl: vi.fn().mockResolvedValue(new Response("uncertain", { status: 500 }))
    });
    await expect(serverError.generate(provider, textRequest, () => undefined))
      .rejects.toBeInstanceOf(UnknownSubmissionError);
  });

  it("marks network and malformed success responses unknown without resubmitting", async () => {
    const rejectedFetch = vi.fn().mockRejectedValue(new Error("socket closed"));
    const rejected = new Ym2OpenAiImagesAdapter({ fetchImpl: rejectedFetch });
    await expect(rejected.generate(provider, textRequest, () => undefined))
      .rejects.toBeInstanceOf(UnknownSubmissionError);
    expect(rejectedFetch).toHaveBeenCalledTimes(1);

    const malformedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    const malformed = new Ym2OpenAiImagesAdapter({ fetchImpl: malformedFetch });
    await expect(malformed.generate(provider, textRequest, () => undefined))
      .rejects.toBeInstanceOf(UnknownSubmissionError);
    expect(malformedFetch).toHaveBeenCalledTimes(1);
  });

  it("records URL responses for recovery and blocks unsupported sizes before fetch", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ url: "https://images.example.com/ym2.png" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(Buffer.from("downloaded"), {
        status: 200,
        headers: { "Content-Type": "image/png" }
      }));
    const adapter = new Ym2OpenAiImagesAdapter({ fetchImpl: fetchMock });
    const remotes: unknown[] = [];

    const generated = await adapter.generate(provider, textRequest, (remote) => remotes.push(remote));
    expect(remotes).toEqual([{ resultUrl: "https://images.example.com/ym2.png" }]);
    expect(generated.buffer).toEqual(Buffer.from("downloaded"));

    expect(() => adapter.resolveRequest(provider, { ...textRequest, aspectRatio: "4:3" }))
      .toThrow("YM2 不支持 4:3 · 2K");
  });
});

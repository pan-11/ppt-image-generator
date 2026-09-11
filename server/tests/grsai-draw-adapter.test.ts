import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UnknownSubmissionError,
  type AdapterGenerationRequest,
  type AdapterRemoteReference,
  type ProviderRuntimeConfig
} from "../src/providers/provider-adapter.js";
import { GrsaiDrawAdapter } from "../src/providers/grsai-draw-adapter.js";

const provider: ProviderRuntimeConfig = {
  id: "grsai",
  name: "GrsAI",
  baseUrl: "https://grsai.example",
  apiKey: "grsai-test-secret",
  protocolType: "grsai-draw",
  configRevision: "revision-1",
  maxConcurrency: 10
};

const textRequest: AdapterGenerationRequest = {
  prompt: "16:9 classroom slide",
  model: "gpt-image-2",
  aspectRatio: "16:9",
  resolution: "1K",
  references: []
};

const resultUrl = "https://images.example/grsai.png?signature=private-download-token";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function submittedResponse() {
  return jsonResponse({ code: 0, msg: "success", data: { id: "task-1" } });
}

function succeededResponse(url = resultUrl) {
  return jsonResponse({
    code: 0, msg: "success",
    data: { id: "task-1", status: "succeeded", progress: 100, results: [{ url }] }
  });
}

function downloadedResponse() {
  return new Response(Buffer.from("generated-image"), {
    headers: { "Content-Type": "image/webp" }
  });
}

function successfulFetch() {
  return vi.fn()
    .mockResolvedValueOnce(submittedResponse())
    .mockResolvedValueOnce(succeededResponse())
    .mockResolvedValueOnce(downloadedResponse());
}

afterEach(() => vi.restoreAllMocks());

describe("GrsaiDrawAdapter", () => {
  it("submits exactly one legacy generation and persists each remote reference before its next request", async () => {
    const remotes: AdapterRemoteReference[] = [];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(submittedResponse())
      .mockImplementationOnce(async () => {
        expect(remotes).toEqual([{ taskId: "task-1" }]);
        return succeededResponse();
      })
      .mockImplementationOnce(async () => {
        expect(remotes).toEqual([{ taskId: "task-1" }, { resultUrl }]);
        return downloadedResponse();
      });
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const adapter = new GrsaiDrawAdapter({ fetchImpl: fetchMock });

    const result = await adapter.generate(provider, textRequest, (remote) => remotes.push(remote));

    expect(fetchMock.mock.calls[0]).toEqual([
      "https://grsai.example/v1/draw/completions",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer grsai-test-secret" },
        signal: expect.any(AbortSignal)
      })
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      model: "gpt-image-2",
      prompt: textRequest.prompt,
      aspectRatio: "1672x941",
      quality: "auto",
      shutProgress: true,
      webHook: "-1"
    });
    expect(fetchMock.mock.calls[1]).toEqual([
      "https://grsai.example/v1/draw/result",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer grsai-test-secret" },
        body: JSON.stringify({ id: "task-1" }),
        signal: expect.any(AbortSignal)
      })
    ]);
    const [downloadUrl, downloadInit] = fetchMock.mock.calls[2];
    expect(downloadUrl).toBe(resultUrl);
    expect(downloadInit.method).toBe("GET");
    expect(new Headers(downloadInit.headers).has("Authorization")).toBe(false);
    expect(downloadInit.signal).toBeInstanceOf(AbortSignal);
    expect(timeout.mock.calls).toEqual([[300_000], [300_000], [300_000]]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ buffer: Buffer.from("generated-image"), mimeType: "image/webp" });
  });

  it.each([
    ["gpt-image-2", "1K", "1672x941", "auto", 1672, 941],
    ["gpt-image-2-vip", "1K", "1280x720", "medium", 1280, 720],
    ["gpt-image-2-vip", "2K", "2048x1152", "medium", 2048, 1152],
    ["gpt-image-2-vip", "4K", "3840x2160", "medium", 3840, 2160]
  ])("maps %s %s to the documented size and quality", async (model, resolution, size, quality, width, height) => {
    const fetchMock = successfulFetch();
    const adapter = new GrsaiDrawAdapter({ fetchImpl: fetchMock });
    const request = { ...textRequest, model: String(model), resolution: String(resolution) };

    expect(adapter.resolveRequest(provider, request)).toEqual({
      requestSize: size, expectedDimensions: { width, height }
    });
    await adapter.generate(provider, request, () => undefined);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      model, prompt: request.prompt, aspectRatio: size, quality, shutProgress: true, webHook: "-1"
    });
  });

  it("advertises only the supported model sizes in both generation modes", () => {
    const adapter = new GrsaiDrawAdapter();
    const capabilities = adapter.capabilities(provider, "text");
    expect(adapter.protocolType).toBe("grsai-draw");
    expect(capabilities.map(({ value, aspectRatios, resolutions, supportedResolutionsByAspectRatio, maxN, supportsReferenceImages }) => ({
      value, aspectRatios, resolutions, supportedResolutionsByAspectRatio, maxN, supportsReferenceImages
    }))).toEqual([
      {
        value: "gpt-image-2", aspectRatios: ["16:9"], resolutions: ["1K"],
        supportedResolutionsByAspectRatio: { "16:9": ["1K"] }, maxN: 10, supportsReferenceImages: true
      },
      {
        value: "gpt-image-2-vip", aspectRatios: ["16:9"], resolutions: ["1K", "2K", "4K"],
        supportedResolutionsByAspectRatio: { "16:9": ["1K", "2K", "4K"] }, maxN: 10, supportsReferenceImages: true
      }
    ]);
    expect(adapter.capabilities(provider, "image")).toEqual(capabilities);
  });

  it("encodes the selected reference bytes with their MIME types and preserves the textless prompt", async () => {
    const fetchMock = successfulFetch();
    const adapter = new GrsaiDrawAdapter({ fetchImpl: fetchMock });
    const request = {
      ...textRequest,
      prompt: "只去掉图中文字，保持其他元素和画面比例。",
      references: [
        { id: "parent", filename: "parent.png", mimeType: "image/png", buffer: Buffer.from([0, 1, 254, 255]) },
        { id: "detail", filename: "detail.jpg", mimeType: "image/jpeg", buffer: Buffer.from("second-reference") }
      ]
    };

    await adapter.generate(provider, request, () => undefined);

    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      model: request.model, prompt: request.prompt, aspectRatio: "1672x941", quality: "auto",
      shutProgress: true, webHook: "-1",
      urls: ["data:image/png;base64,AAH+/w==", `data:image/jpeg;base64,${Buffer.from("second-reference").toString("base64")}`]
    });
  });

  it.each(["https://grsai.example/", "https://grsai.example/v1", "https://grsai.example/v1/"])(
    "normalizes the allowed base URL %s without duplicating v1", async (baseUrl) => {
      const fetchMock = successfulFetch();
      await new GrsaiDrawAdapter({ fetchImpl: fetchMock })
        .generate({ ...provider, baseUrl }, textRequest, () => undefined);
      expect(fetchMock.mock.calls[0][0]).toBe("https://grsai.example/v1/draw/completions");
    }
  );

  it.each([
    "not-a-url", "ftp://grsai.example", "https://user:password@grsai.example",
    "https://grsai.example/docs", "https://grsai.example/v1/draw",
    "https://grsai.example?key=private", "https://grsai.example#private"
  ])("rejects invalid API base URLs before any network request: %s", async (baseUrl) => {
    const fetchMock = vi.fn();
    const adapter = new GrsaiDrawAdapter({ fetchImpl: fetchMock });
    await expect(adapter.generate({ ...provider, baseUrl }, textRequest, () => undefined)).rejects.toThrow("Base URL");
    await expect(adapter.recover({ ...provider, baseUrl }, textRequest, { taskId: "task-1", resultUrl }, () => undefined))
      .rejects.toThrow("Base URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ model: "gpt-image-1" }, "模型"], [{ model: "toString" }, "模型"], [{ aspectRatio: "4:3" }, "16:9"],
    [{ resolution: "2K" }, "分辨率"], [{ resolution: "4K" }, "分辨率"], [{ resolution: "toString" }, "分辨率"]
  ])("rejects unsupported model, ratio or resolution before submission: %j", async (invalid, message) => {
    const fetchMock = vi.fn();
    const adapter = new GrsaiDrawAdapter({ fetchImpl: fetchMock });
    expect(() => adapter.resolveRequest(provider, { ...textRequest, ...invalid })).toThrow(String(message));
    await expect(adapter.generate(provider, { ...textRequest, ...invalid }, () => undefined)).rejects.toThrow(String(message));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("waits eight seconds between running responses and accepts the legacy result URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(submittedResponse())
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { status: "running", progress: 45 } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { status: "succeeded", url: resultUrl } }))
      .mockResolvedValueOnce(downloadedResponse());
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock, sleep })
      .generate(provider, textRequest, () => undefined)).resolves.toMatchObject({ buffer: Buffer.from("generated-image") });
    expect(sleep.mock.calls).toEqual([[8_000]]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://grsai.example/v1/draw/completions", "https://grsai.example/v1/draw/result",
      "https://grsai.example/v1/draw/result", resultUrl
    ]);
  });

  it.each([
    ["network interruption", () => Promise.reject(new Error("socket closed"))],
    ["timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
    ["server error", () => Promise.resolve(new Response("upstream error", { status: 503 }))],
    ["invalid JSON", () => Promise.resolve(new Response("not-json"))],
    ["missing ID", () => Promise.resolve(jsonResponse({ code: 0, data: {} }))],
    ["blank ID", () => Promise.resolve(jsonResponse({ code: 0, data: { id: " " } }))],
    ["missing envelope", () => Promise.resolve(jsonResponse({ data: { id: "task-1" } }))]
  ])("marks %s submission unknown without issuing another generation", async (_name, respond) => {
    const fetchMock = vi.fn().mockImplementation(respond);
    const remote = vi.fn();
    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock })
      .generate(provider, textRequest, remote)).rejects.toBeInstanceOf(UnknownSubmissionError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(remote).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 429])("reports an HTTP %i submission rejection without resubmitting", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("sensitive provider response", { status }));
    const error = await new GrsaiDrawAdapter({ fetchImpl: fetchMock })
      .generate(provider, textRequest, () => undefined).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnknownSubmissionError);
    expect((error as Error).message).toContain(String(status));
    expect((error as Error).message).not.toContain("sensitive provider response");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves a readable explicit provider rejection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: -1, msg: "insufficient balance", data: null }));
    const error = await new GrsaiDrawAdapter({ fetchImpl: fetchMock })
      .generate(provider, textRequest, () => undefined).catch((value: unknown) => value);
    expect(error).not.toBeInstanceOf(UnknownSubmissionError);
    expect((error as Error).message).toContain("insufficient balance");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ code: 0, data: { status: "failed", failure_reason: "content rejected" } }, "content rejected"],
    [{ code: 0, data: { status: "failed", error: "render failed" } }, "render failed"],
    [{ code: -22, msg: "task not found" }, "任务不存在"],
    [{ code: -1, msg: "query rejected" }, "query rejected"],
    [{ code: 0, data: { status: "succeeded", results: [] } }, "图片地址"],
    [{ code: 0, data: { status: "unexpected" } }, "状态"],
    [{ data: { status: "running" } }, "响应"]
  ])("stops polling on a terminal or invalid envelope %j", async (value, message) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(value));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock, sleep })
      .recover(provider, textRequest, { taskId: "task-1" }, () => undefined)).rejects.toThrow(String(message));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", () => new Response("not-json"), "JSON"],
    ["authentication failure", () => new Response("private", { status: 401 }), "401"]
  ])("does not retry query %s", async (_name, respond, message) => {
    const fetchMock = vi.fn().mockImplementation(async () => respond());
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock, sleep })
      .recover(provider, textRequest, { taskId: "task-1" }, () => undefined)).rejects.toThrow(String(message));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries transient query failures with fifteen-second waits inside the poll budget", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("connection interrupted"))
      .mockResolvedValueOnce(new Response("limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(succeededResponse())
      .mockResolvedValueOnce(downloadedResponse());
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock, sleep, maxPollAttempts: 4 })
      .recover(provider, textRequest, { taskId: "task-1" }, () => undefined)).resolves.toMatchObject({ mimeType: "image/webp" });
    expect(sleep.mock.calls).toEqual([[15_000], [15_000], [15_000]]);
    expect(fetchMock.mock.calls.slice(0, 4).every(([url, init]) => (
      url === "https://grsai.example/v1/draw/result" && init.body === JSON.stringify({ id: "task-1" })
    ))).toBe(true);
  });

  it("retries an interrupted query body using the saved task ID", async () => {
    const interrupted = new Response(new ReadableStream({
      start(controller) {
        controller.error(new TypeError(`body interrupted ${provider.apiKey}`));
      }
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(interrupted)
      .mockResolvedValueOnce(succeededResponse())
      .mockResolvedValueOnce(downloadedResponse());
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock, sleep, maxPollAttempts: 2 })
      .recover(provider, textRequest, { taskId: "task-1" }, () => undefined)).resolves.toMatchObject({ mimeType: "image/webp" });
    expect(sleep.mock.calls).toEqual([[15_000]]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://grsai.example/v1/draw/result", "https://grsai.example/v1/draw/result", resultUrl
    ]);
  });

  it.each(["running", "transient"])("stops %s polling at the configured budget", async (kind) => {
    const fetchMock = vi.fn().mockImplementation(async () => kind === "running"
      ? jsonResponse({ code: 0, data: { status: "running" } })
      : new Response("unavailable", { status: 503 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock, sleep, maxPollAttempts: 2 })
      .recover(provider, textRequest, { taskId: "task-1" }, () => undefined)).rejects.toThrow("查询次数已用尽");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("defaults to a maximum of four hundred result queries", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ code: 0, data: { status: "running" } }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock, sleep })
      .recover(provider, textRequest, { taskId: "task-1" }, () => undefined)).rejects.toThrow("查询次数已用尽");
    expect(fetchMock).toHaveBeenCalledTimes(400);
    expect(sleep).toHaveBeenCalledTimes(399);
  });

  it("recovers an existing URL without submitting or querying a task", async () => {
    const fetchMock = vi.fn().mockResolvedValue(downloadedResponse());
    const remote = vi.fn();
    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock })
      .recover(provider, textRequest, { taskId: "task-1", resultUrl }, remote)).resolves.toMatchObject({ mimeType: "image/webp" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(resultUrl);
    expect(remote).not.toHaveBeenCalled();
  });

  it.each([403, 404, 410])("refreshes an expired HTTP %i result URL by querying the original task", async (status) => {
    const freshUrl = "https://images.example/fresh.png";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("expired", { status }))
      .mockResolvedValueOnce(succeededResponse(freshUrl))
      .mockResolvedValueOnce(downloadedResponse());
    const remote = vi.fn();

    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock })
      .recover(provider, textRequest, { taskId: "task-1", resultUrl }, remote)).resolves.toMatchObject({ mimeType: "image/webp" });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([resultUrl, "https://grsai.example/v1/draw/result", freshUrl]);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ id: "task-1" });
    expect(remote).toHaveBeenCalledWith({ resultUrl: freshUrl });
  });

  it("keeps the saved task reference when the generated URL cannot be downloaded", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(submittedResponse())
      .mockResolvedValueOnce(succeededResponse())
      .mockRejectedValueOnce(new Error("CDN disconnected"));
    const remotes: AdapterRemoteReference[] = [];
    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock })
      .generate(provider, textRequest, (remote) => remotes.push(remote))).rejects.toThrow("下载 GrsAI");
    expect(remotes).toEqual([{ taskId: "task-1" }, { resultUrl }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([429, 503])("leaves transient HTTP %i CDN failures recoverable without querying a new URL", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("temporary", { status }));
    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock })
      .recover(provider, textRequest, { taskId: "task-1", resultUrl }, () => undefined)).rejects.toThrow(String(status));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects recovery without a task or URL and never generates a replacement", async () => {
    const fetchMock = vi.fn();
    await expect(new GrsaiDrawAdapter({ fetchImpl: fetchMock })
      .recover(provider, textRequest, {}, () => undefined)).rejects.toThrow("可恢复");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("applies the injected timeout to a CDN request and hides its URL and network error", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn().mockRejectedValue(new DOMException(`timeout ${resultUrl} ${provider.apiKey}`, "TimeoutError"));
    const error = await new GrsaiDrawAdapter({ fetchImpl: fetchMock, timeoutMs: 12 })
      .recover(provider, textRequest, { resultUrl }, () => undefined).catch((value: unknown) => value);
    expect(timeout).toHaveBeenCalledWith(12);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect((error as Error).message).toContain("下载 GrsAI");
    expect((error as Error).message).not.toContain(resultUrl);
    expect((error as Error).message).not.toContain(provider.apiKey);
  });

  it("redacts provider messages containing the key, prompt, reference data or raw request", async () => {
    const reference = { id: "ref", filename: "source.png", mimeType: "image/png", buffer: Buffer.from("private-reference-image") };
    const request = { ...textRequest, references: [reference] };
    const referenceData = reference.buffer.toString("base64");
    const leaks = [
      `rejected ${provider.apiKey} ${request.prompt} data:image/png;base64,${referenceData} ${resultUrl}`,
      JSON.stringify({ model: request.model, prompt: request.prompt, urls: [referenceData], key: provider.apiKey })
    ];
    for (const failure_reason of leaks) {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 0, data: { status: "failed", failure_reason } }));
      const error = await new GrsaiDrawAdapter({ fetchImpl: fetchMock })
        .recover(provider, request, { taskId: "task-1" }, () => undefined).catch((value: unknown) => value);
      expect((error as Error).message).toContain("GrsAI 任务失败");
      for (const secret of [provider.apiKey, request.prompt, referenceData, "data:image", resultUrl, '"urls"']) {
        expect((error as Error).message).not.toContain(secret);
      }
    }
  });

  it.each([
    ["submission", " "], ["submission", "\n\t"],
    ["query", " "], ["query", "\n\t"],
    ["failed", " "], ["failed", "\n\t"]
  ])("suppresses private prompt echoes with URLs in %s errors and separator %j", async (phase, separator) => {
    const parts = ["PRIVATE_TEXT_A", "https://example.invalid/guide", "PRIVATE_TEXT_B"];
    const request = { ...textRequest, prompt: parts.join(" ") };
    const message = `rejected prompt: ${parts.join(separator)}`;
    const response = phase === "failed"
      ? { code: 0, data: { status: "failed", failure_reason: message } }
      : { code: -1, msg: message };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response));
    const adapter = new GrsaiDrawAdapter({ fetchImpl: fetchMock });

    const error = await (phase === "submission"
      ? adapter.generate(provider, request, () => undefined)
      : adapter.recover(provider, request, { taskId: "task-1" }, () => undefined))
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("GrsAI");
    for (const part of parts) expect((error as Error).message).not.toContain(part);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

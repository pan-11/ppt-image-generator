import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { UnknownSubmissionError, type AdapterGenerationRequest, type ProviderRuntimeConfig } from "../src/providers/provider-adapter.js";
import { CangyuanImagesAdapter } from "../src/providers/cangyuan-images-adapter.js";

const provider: ProviderRuntimeConfig = {
  id: "cangyuan", name: "沧元", baseUrl: "https://ai.cangyuansuanli.cn/v1",
  apiKey: "cangyuan-test-secret", protocolType: "cangyuan-images",
  configRevision: "revision-1", maxConcurrency: 5
};
const request: AdapterGenerationRequest = {
  prompt: "classroom slide", model: "gpt-image-2-2k", aspectRatio: "16:9", resolution: "2K", references: []
};
const resultUrl = "https://images.example.com/slide.png";
const imageBytes = await sharp({ create: { width: 16, height: 9, channels: 3, background: "blue" } }).png().toBuffer();
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}
function picture() {
  return new Response(new Uint8Array(imageBytes), { headers: { "Content-Type": "image/png" } });
}

describe("CangyuanImagesAdapter", () => {
  it("rejects truncated image pixels even when the image header has valid dimensions", async () => {
    const complete = await sharp({ create: { width: 160, height: 90, channels: 3, background: "blue" } }).png().toBuffer();
    const truncated = complete.subarray(0, Math.floor(complete.length / 2));
    expect(await sharp(truncated).metadata()).toMatchObject({ width: 160, height: 90 });
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array(truncated), { headers: { "Content-Type": "image/png" } }));
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock });
    await expect(adapter.recover(provider, request, { resultUrl }, () => undefined)).rejects.toThrow("下载沧元结果失败");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["text/html", "<!doctype html><html>temporary CDN error</html>"],
    ["image/png", ""],
    ["image/png", "not an image"]
  ])("rejects invalid downloaded bytes (%s) while preserving the remote task for retry", async (mimeType, body) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ id: "invalid-image-task", status: "queued" }))
      .mockResolvedValueOnce(json({ id: "invalid-image-task", status: "completed", data: [{ url: resultUrl }] }))
      .mockResolvedValueOnce(new Response(body, { headers: { "Content-Type": mimeType } }))
      .mockResolvedValueOnce(picture());
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock });
    const onRemoteReference = vi.fn();
    await expect(adapter.generate(provider, request, onRemoteReference)).rejects.toThrow("下载沧元结果失败");
    expect(onRemoteReference.mock.calls).toEqual([[{ taskId: "invalid-image-task" }], [{ resultUrl }]]);
    await expect(adapter.recover(provider, request, { taskId: "invalid-image-task", resultUrl }, () => undefined))
      .resolves.toEqual({ buffer: imageBytes, mimeType: "image/png" });
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
  });

  it("uploads local references through official presigning and polls the edit path", async () => {
    const uploadUrl = "https://storage.example.com/upload?signature=opaque";
    const referenceUrl = "https://tmp.cangyuansuanli.cn/ref.png";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ uploadUrl, url: referenceUrl, contentType: "image/png", ttlHours: 2 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json({ id: "edit-1", status: "queued" }))
      .mockResolvedValueOnce(json({ id: "edit-1", status: "completed", data: [{ url: resultUrl }] }))
      .mockResolvedValueOnce(picture());
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock });
    const edit = { ...request, references: [{ id: "ref-1", filename: "source.png", mimeType: "image/png", buffer: Buffer.from("source-bytes") }] };
    await adapter.generate(provider, edit, () => undefined);
    const [presignUrl, presignInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(presignUrl).toBe("https://canvas.cangyuansuanli.cn/api/media/references");
    expect(JSON.parse(String(presignInit.body))).toEqual({ mimeType: "image/png", bytes: 12 });
    expect(new Headers(presignInit.headers).has("authorization")).toBe(false);
    const [putUrl, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(putUrl).toBe(uploadUrl);
    expect(putInit).toMatchObject({ method: "PUT", headers: { "Content-Type": "image/png" } });
    expect(await new Response(putInit.body).text()).toBe("source-bytes");
    expect(new Headers(putInit.headers).has("authorization")).toBe(false);
    const [editUrl, editInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(editUrl).toBe("https://ai.cangyuansuanli.cn/v1/images/edits");
    expect(JSON.parse(String(editInit.body))).toEqual({ model: request.model, prompt: request.prompt, n: 1, size: "16:9", response_format: "url", async: true, images: [referenceUrl] });
    expect(fetchMock.mock.calls[3][0]).toBe("https://ai.cangyuansuanli.cn/v1/images/edits/edit-1");
    expect(adapter.capabilities(provider, "image")).toHaveLength(4);
  });

  it("does not upload or generate when recovering an existing reference-image task", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ id: "edit-old", status: "completed", data: [{ url: resultUrl }] }))
      .mockResolvedValueOnce(picture());
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock });
    const edit = { ...request, references: [{ id: "ref-1", filename: "source.png", mimeType: "image/png", buffer: Buffer.from("source") }] };
    await adapter.recover(provider, edit, { taskId: "edit-old" }, () => undefined);
    expect(fetchMock.mock.calls[0][0]).toBe("https://ai.cangyuansuanli.cn/v1/images/edits/edit-old");
    expect(fetchMock.mock.calls.every(call => !["POST", "PUT"].includes(String(call[1]?.method)))).toBe(true);
  });

  it("caches uploaded references by provider revision and refreshes expired URLs", async () => {
    let now = 10_000;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/media/references")) return json({ uploadUrl: "https://storage.example.com/upload", url: "https://tmp.cangyuansuanli.cn/ref.png", expiresAt: now + 7_200_000 });
      if (init?.method === "PUT") return new Response(null, { status: 200 });
      if (init?.method === "POST") return json({ id: "task", status: "queued" });
      if (url.includes("/edits/task")) return json({ id: "task", status: "completed", data: [{ url: resultUrl }] });
      return picture();
    });
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock, now: () => now });
    const edit = { ...request, references: [{ id: "ref-1", filename: "source.png", mimeType: "image/png", buffer: Buffer.from("source") }] };
    await Promise.all([adapter.generate(provider, edit, () => undefined), adapter.generate(provider, edit, () => undefined)]);
    const uploads = () => fetchMock.mock.calls.filter(call => String(call[0]).includes("/api/media/references"));
    expect(uploads()).toHaveLength(1);
    now += 7_200_000;
    await adapter.generate(provider, edit, () => undefined);
    expect(uploads()).toHaveLength(2);
    await adapter.generate({ ...provider, configRevision: "revision-2" }, edit, () => undefined);
    expect(uploads()).toHaveLength(3);
  });

  it.each([
    { uploadUrl: "http://storage.example.com/upload", url: "https://tmp.cangyuansuanli.cn/ref.png" },
    { uploadUrl: "https://storage.example.com/upload", url: "data:image/png;base64,abc" }
  ])("rejects invalid presigned addresses before uploading or generating", async (metadata) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(metadata));
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock });
    const edit = { ...request, references: [{ id: "ref-1", filename: "source.png", mimeType: "image/png", buffer: Buffer.from("source") }] };
    await expect(adapter.generate(provider, edit, () => undefined)).rejects.toThrow("HTTPS");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not submit a billable generation after an upload failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ uploadUrl: "https://storage.example.com/upload", url: "https://tmp.cangyuansuanli.cn/ref.png" }))
      .mockResolvedValueOnce(new Response("failed", { status: 503 }));
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock });
    const edit = { ...request, references: [{ id: "ref-1", filename: "source.png", mimeType: "image/png", buffer: Buffer.from("source") }] };
    await expect(adapter.generate(provider, edit, () => undefined)).rejects.toThrow("上传参考图失败");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("submits one image, persists the ID before polling and downloads without credentials", async () => {
    const remotes: unknown[] = [];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ id: "task-1", status: "queued" }))
      .mockImplementationOnce(async () => {
        expect(remotes).toEqual([{ taskId: "task-1" }]);
        return json({ id: "task-1", status: "in_progress" });
      })
      .mockResolvedValueOnce(json({ id: "task-1", status: "completed", data: [{ url: resultUrl }] }))
      .mockResolvedValueOnce(picture());
    const sleep = vi.fn().mockResolvedValue(undefined);
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock, sleep });
    const image = await adapter.generate(provider, request, remote => remotes.push(remote));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.cangyuansuanli.cn/v1/images/generations");
    expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Bearer cangyuan-test-secret", "Content-Type": "application/json" } });
    expect(JSON.parse(String(init.body))).toEqual({ model: "gpt-image-2-2k", prompt: request.prompt, n: 1, size: "16:9", response_format: "url", async: true });
    expect(fetchMock.mock.calls[1][0]).toBe("https://ai.cangyuansuanli.cn/v1/images/generations/task-1");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET", headers: { Authorization: "Bearer cangyuan-test-secret" } });
    expect(remotes).toEqual([{ taskId: "task-1" }, { resultUrl }]);
    expect(image).toEqual({ buffer: imageBytes, mimeType: "image/png" });
    expect(new Headers(fetchMock.mock.calls[3][1]?.headers).has("authorization")).toBe(false);
    expect(sleep).toHaveBeenCalledWith(8000);
  });

  it.each([
    ["gpt-image-2", "standard"], ["gpt-image-2-1k", "1K"],
    ["gpt-image-2-2k", "2K"], ["gpt-image-2-4k", "4K"]
  ])("advertises and preserves the %s public model without guessing pixels", (model, resolution) => {
    const adapter = new CangyuanImagesAdapter();
    expect(adapter.capabilities(provider, "text")).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: model, resolutions: [resolution], aspectRatios: ["16:9"], maxN: 10 })
    ]));
    expect(adapter.resolveRequest(provider, { ...request, model, resolution })).toEqual({ requestSize: "16:9" });
  });

  it.each([
    { model: "gpt-image-2-vip" }, { model: "gpt-image-2", resolution: "4K" },
    { aspectRatio: "4:3" }, { resolution: "4K" }
  ])("rejects unsupported choices before submission: %j", async (overrides) => {
    const fetchMock = vi.fn();
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock });
    await expect(adapter.generate(provider, { ...request, ...overrides }, () => undefined)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["/docs", "/v2", "/?", "/#", "/?secret=abc", "/#hash", "https://user:password@relay.example.com"])("rejects unsupported Base URL %s before network", async (suffix) => {
    const fetchMock = vi.fn();
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock });
    const baseUrl = suffix.startsWith("https:") ? suffix : `https://relay.example.com${suffix}`;
    await expect(adapter.generate({ ...provider, baseUrl }, request, () => undefined)).rejects.toThrow("Base URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the official canvas outer data wrapper and task_id alias", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ code: 0, data: { task_id: "task-2", status: "queued" } }))
      .mockResolvedValueOnce(json({ code: 0, data: { id: "task-2", status: "completed", data: [{ url: resultUrl }] } }))
      .mockResolvedValueOnce(picture());
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock });
    await expect(adapter.generate({ ...provider, baseUrl: "https://ai.cangyuansuanli.cn/" }, request, () => undefined)).resolves.toMatchObject({ mimeType: "image/png" });
    expect(fetchMock.mock.calls[1][0]).toContain("/generations/task-2");
  });

  it.each([
    () => Promise.reject(new Error("timeout")),
    () => Promise.resolve(new Response("request timed out", { status: 408 })),
    () => Promise.resolve(new Response("upstream failed", { status: 503 })),
    () => Promise.resolve(new Response("invalid JSON")),
    () => Promise.resolve(json({ status: "queued" }))
  ])("does not repeat an ambiguous submit", async (respond) => {
    const fetchMock = vi.fn(respond);
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock });
    await expect(adapter.generate(provider, request, () => undefined)).rejects.toBeInstanceOf(UnknownSubmissionError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("excludes echoed keys and references from remote errors", async () => {
    const privateBody = `${provider.apiKey} data:image/png;base64,c2VjcmV0LXJlZmVyZW5jZQ==`;
    const adapter = new CangyuanImagesAdapter({ fetchImpl: vi.fn().mockResolvedValue(new Response(privateBody, { status: 400 })) });
    await expect(adapter.generate(provider, request, () => undefined)).rejects.toThrow("400");
    await expect(adapter.generate(provider, request, () => undefined)).rejects.not.toThrow(provider.apiKey);
    await expect(adapter.generate(provider, request, () => undefined)).rejects.not.toThrow("base64");
  });

  it("retries transient polling without submitting again and stops at the configured budget", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ id: "task-1", status: "queued" }))
      .mockResolvedValue(new Response("busy", { status: 503 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock, sleep, maxPollAttempts: 3 });
    await expect(adapter.generate(provider, request, () => undefined)).rejects.toThrow("轮询超时");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("retries an interrupted polling response body without repeating generation", async () => {
    const interrupted = new Response(new ReadableStream({
      start(controller) { controller.error(new TypeError("body terminated")); }
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ id: "task-1", status: "queued" }))
      .mockResolvedValueOnce(interrupted)
      .mockResolvedValueOnce(json({ id: "task-1", status: "completed", data: [{ url: resultUrl }] }))
      .mockResolvedValueOnce(picture());
    const sleep = vi.fn().mockResolvedValue(undefined);
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock, sleep });
    await expect(adapter.generate(provider, request, () => undefined)).resolves.toMatchObject({ mimeType: "image/png" });
    expect(sleep).toHaveBeenCalledWith(15000);
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
  });

  it.each([
    [{ id: "task-1", status: "failed", error: { message: "private" } }, "任务失败"],
    [{ id: "task-1", status: "completed", data: [] }, "未返回图片"],
    [{ id: "task-1", status: "unrecognized" }, "未知任务状态"]
  ])("reports terminal/invalid responses without a new generation", async (response, message) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(response));
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock });
    await expect(adapter.recover(provider, request, { taskId: "task-1" }, () => undefined)).rejects.toThrow(String(message));
    expect(fetchMock.mock.calls.every(call => call[1]?.method === "GET")).toBe(true);
  });

  it("recovers an expired URL by querying the same task and preserves the new URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("expired", { status: 403 }))
      .mockResolvedValueOnce(json({ id: "old-task", status: "completed", data: [{ url: resultUrl }] }))
      .mockResolvedValueOnce(picture());
    const onRemoteReference = vi.fn();
    const adapter = new CangyuanImagesAdapter({ fetchImpl: fetchMock });
    await expect(adapter.recover(provider, request, { taskId: "old-task", resultUrl: "https://images.example.com/expired.png" }, onRemoteReference)).resolves.toMatchObject({ mimeType: "image/png" });
    expect(fetchMock.mock.calls[1][0]).toContain("/generations/old-task");
    expect(onRemoteReference).toHaveBeenCalledWith({ resultUrl });
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(0);
  });
});

import { describe, expect, it, vi } from "vitest";
import { ToApisAsyncAdapter } from "../src/providers/toapis-async-adapter.js";
import type { AdapterGenerationRequest, ProviderRuntimeConfig } from "../src/providers/provider-adapter.js";
import type { ToApisClient } from "../src/services/toapis-client.js";

const provider: ProviderRuntimeConfig = {
  id: "toapis-a",
  name: "ToAPIs A",
  baseUrl: "https://relay.example.com/v1",
  apiKey: "secret",
  protocolType: "toapis-async",
  configRevision: "revision-a",
  maxConcurrency: 5
};

const request: AdapterGenerationRequest = {
  prompt: "wide classroom slide",
  model: "gpt-image-2",
  aspectRatio: "16:9",
  resolution: "2K",
  references: []
};

function fakeClient(overrides: Partial<ToApisClient> = {}) {
  return {
    uploadReferenceImage: vi.fn().mockResolvedValue("https://uploads.example.com/reference.png"),
    createImageTask: vi.fn().mockResolvedValue({ id: "remote-1" }),
    getImageTask: vi.fn().mockResolvedValue({
      status: "completed",
      result: { data: [{ url: "https://images.example.com/output.png" }] }
    }),
    downloadImage: vi.fn().mockResolvedValue({ buffer: Buffer.from("image"), mimeType: "image/png" }),
    ...overrides
  } as unknown as ToApisClient;
}

describe("ToApisAsyncAdapter", () => {
  it("submits one output and records a remote task before polling", async () => {
    const events: string[] = [];
    const client = fakeClient({
      getImageTask: vi.fn().mockImplementation(async () => {
        events.push("poll:remote-1");
        return {
          status: "completed",
          result: { data: [{ url: "https://images.example.com/output.png" }] }
        };
      }),
      downloadImage: vi.fn().mockImplementation(async () => {
        events.push("download");
        return { buffer: Buffer.from("image"), mimeType: "image/png" };
      })
    });
    const adapter = new ToApisAsyncAdapter(() => client);

    const result = await adapter.generate(provider, request, (remote) => {
      events.push(`remote:${remote.taskId}`);
    });

    expect(client.createImageTask).toHaveBeenCalledWith(expect.objectContaining({
      prompt: request.prompt,
      model: "gpt-image-2",
      size: "16:9",
      n: 1,
      metadata: { resolution: "2K", orientation: "landscape" }
    }));
    expect(events).toEqual(["remote:remote-1", "poll:remote-1", "download"]);
    expect(result).toEqual({ buffer: Buffer.from("image"), mimeType: "image/png" });
  });

  it("records a direct URL before downloading and decodes base64 locally", async () => {
    const directClient = fakeClient({
      createImageTask: vi.fn().mockResolvedValue({
        data: [{ url: "https://images.example.com/direct.png" }]
      })
    });
    const directAdapter = new ToApisAsyncAdapter(() => directClient);
    const remotes: unknown[] = [];

    await directAdapter.generate(provider, request, (remote) => remotes.push(remote));
    expect(remotes).toEqual([{ resultUrl: "https://images.example.com/direct.png" }]);
    expect(directClient.getImageTask).not.toHaveBeenCalled();

    const base64Client = fakeClient({
      createImageTask: vi.fn().mockResolvedValue({
        data: [{ b64_json: Buffer.from("base64-image").toString("base64") }]
      })
    });
    const base64Adapter = new ToApisAsyncAdapter(() => base64Client);
    const decoded = await base64Adapter.generate(provider, request, () => undefined);
    expect(decoded).toEqual({ buffer: Buffer.from("base64-image"), mimeType: "image/png" });
    expect(base64Client.downloadImage).not.toHaveBeenCalled();
  });

  it("uploads reference assets once per provider revision", async () => {
    const client = fakeClient({
      createImageTask: vi.fn().mockResolvedValue({
        data: [{ b64_json: Buffer.from("image").toString("base64") }]
      })
    });
    const adapter = new ToApisAsyncAdapter(() => client);
    const referenced = {
      ...request,
      references: [{
        id: "reference-1",
        filename: "source.png",
        mimeType: "image/png",
        buffer: Buffer.from("source")
      }]
    };

    await adapter.generate(provider, referenced, () => undefined);
    await adapter.generate(provider, referenced, () => undefined);

    expect(client.uploadReferenceImage).toHaveBeenCalledTimes(1);
    expect(client.createImageTask).toHaveBeenLastCalledWith(expect.objectContaining({
      imageUrls: ["https://uploads.example.com/reference.png"],
      n: 1
    }));
  });

  it("recovers a recorded task or result URL without creating a new generation", async () => {
    const client = fakeClient();
    const adapter = new ToApisAsyncAdapter(() => client);

    await adapter.recover(provider, request, { taskId: "remote-1" }, () => undefined);
    await adapter.recover(
      provider,
      request,
      { resultUrl: "https://images.example.com/direct.png" },
      () => undefined
    );

    expect(client.createImageTask).not.toHaveBeenCalled();
    expect(client.getImageTask).toHaveBeenCalledWith("remote-1");
    expect(client.downloadImage).toHaveBeenCalledTimes(2);
  });
});

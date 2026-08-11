import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderLabService } from "../src/lab/provider-lab-service.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function createProvider(service: ProviderLabService) {
  return service.saveProvider({
    name: "Relay A",
    baseUrl: "https://relay.example.com/v1",
    apiKey: "relay-key"
  });
}

describe("provider lab service", () => {
  it("runs one isolated benchmark and records returned billing fields", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-lab-service-"));
    tempDirs.push(appDataDir);
    const createImageTask = vi.fn().mockResolvedValue({ id: "remote-1", status: "queued" });
    const downloadImage = vi.fn().mockResolvedValue({ buffer: Buffer.from("image"), mimeType: "image/png" });
    const service = new ProviderLabService({
      appDataDir,
      isProductionBusy: () => false,
      clientFactory: () => ({ uploadReferenceImage: vi.fn(), createImageTask, getImageTask: vi.fn(), downloadImage }),
      pollTask: vi.fn().mockResolvedValue({
        status: "completed",
        result: { data: [{ url: "https://example.com/result.png" }], usage: { credits: 3 }, cost: 3 }
      })
    });
    const provider = createProvider(service);

    const result = await service.runBenchmark({
      providerId: provider.id,
      prompt: "精致的幼儿园课堂插画",
      model: "gpt-image-2",
      aspectRatio: "16:9",
      resolution: "1K"
    });

    expect(result).toMatchObject({
      providerId: provider.id,
      status: "completed",
      reportedUsage: { credits: 3 },
      reportedCost: 3
    });
    expect(result.imageUrl).toMatch(/^\/api\/lab\/benchmarks\/.+\/image$/);
    expect(createImageTask).toHaveBeenCalledTimes(1);
    expect(downloadImage).toHaveBeenCalledTimes(1);
    expect(service.listBenchmarks()).toHaveLength(1);
  });

  it("accepts a direct image response without polling an undefined task id", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-lab-direct-"));
    tempDirs.push(appDataDir);
    const createImageTask = vi.fn().mockResolvedValue({
      data: [{ url: "https://example.com/direct.png" }],
      usage: { credits: 1 },
      cost: 0.01
    });
    const downloadImage = vi.fn().mockResolvedValue({ buffer: Buffer.from("direct"), mimeType: "image/png" });
    const pollTask = vi.fn();
    const service = new ProviderLabService({
      appDataDir,
      isProductionBusy: () => false,
      clientFactory: () => ({ uploadReferenceImage: vi.fn(), createImageTask, getImageTask: vi.fn(), downloadImage }),
      pollTask
    });
    const provider = createProvider(service);

    const result = await service.runBenchmark({
      providerId: provider.id,
      prompt: "direct response test",
      model: "gpt-image-2",
      aspectRatio: "16:9",
      resolution: "1K"
    });

    expect(pollTask).not.toHaveBeenCalled();
    expect(downloadImage).toHaveBeenCalledWith("https://example.com/direct.png");
    expect(result).toMatchObject({
      status: "completed",
      generationMs: 0,
      reportedUsage: { credits: 1 },
      reportedCost: 0.01
    });
    expect(service.listBenchmarks()).toHaveLength(1);
  });

  it("accepts a direct base64 image response", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-lab-base64-"));
    tempDirs.push(appDataDir);
    const base64Image = Buffer.from("direct-base64").toString("base64");
    const createImageTask = vi.fn().mockResolvedValue({
      data: [{ b64_json: base64Image }],
      usage: { credits: 1 },
      cost: 0.01
    });
    const downloadImage = vi.fn().mockResolvedValue({ buffer: Buffer.from("direct-base64"), mimeType: "image/png" });
    const pollTask = vi.fn();
    const service = new ProviderLabService({
      appDataDir,
      isProductionBusy: () => false,
      clientFactory: () => ({ uploadReferenceImage: vi.fn(), createImageTask, getImageTask: vi.fn(), downloadImage }),
      pollTask
    });
    const provider = createProvider(service);

    const result = await service.runBenchmark({
      providerId: provider.id,
      prompt: "direct base64 response test",
      model: "gpt-image-2",
      aspectRatio: "16:9",
      resolution: "1K"
    });

    expect(pollTask).not.toHaveBeenCalled();
    expect(downloadImage).toHaveBeenCalledWith(`data:image/png;base64,${base64Image}`);
    expect(result).toMatchObject({ status: "completed", generationMs: 0 });
    expect(result.imageUrl).toMatch(/^\/api\/lab\/benchmarks\/.+\/image$/);
  });

  it("uploads a reference image and sends a manually entered model unchanged", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-lab-reference-"));
    tempDirs.push(appDataDir);
    const uploadReferenceImage = vi.fn().mockResolvedValue("https://relay.example.com/uploaded-reference.png");
    const createImageTask = vi.fn().mockResolvedValue({ id: "remote-reference-1", status: "queued" });
    const service = new ProviderLabService({
      appDataDir,
      isProductionBusy: () => false,
      clientFactory: () => ({
        uploadReferenceImage,
        createImageTask,
        getImageTask: vi.fn(),
        downloadImage: vi.fn().mockResolvedValue({ buffer: Buffer.from("result"), mimeType: "image/png" })
      }),
      pollTask: vi.fn().mockResolvedValue({
        status: "completed",
        result: { data: [{ url: "https://example.com/reference-result.png" }] }
      })
    });
    const provider = createProvider(service);

    const result = await service.runBenchmark({
      providerId: provider.id,
      prompt: "保持参考图构图并生成精致课件插画",
      model: "custom-relay-image-model",
      aspectRatio: "16:9",
      resolution: "2K",
      referenceImage: {
        filename: "reference.png",
        mimeType: "image/png",
        buffer: Buffer.from("reference")
      }
    });

    expect(uploadReferenceImage).toHaveBeenCalledWith(expect.objectContaining({ filename: "reference.png", mimeType: "image/png" }));
    expect(createImageTask).toHaveBeenCalledWith(expect.objectContaining({
      model: "custom-relay-image-model",
      size: "16:9",
      resolution: "2K",
      imageUrls: ["https://relay.example.com/uploaded-reference.png"]
    }));
    expect(result).toMatchObject({
      testMode: "reference-image",
      referenceFilename: "reference.png",
      status: "completed"
    });
  });

  it("refuses to run while production work is active", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-lab-busy-"));
    tempDirs.push(appDataDir);
    const clientFactory = vi.fn();
    const service = new ProviderLabService({ appDataDir, isProductionBusy: () => true, clientFactory });
    const provider = createProvider(service);

    await expect(service.runBenchmark({
      providerId: provider.id,
      prompt: "test",
      model: "gpt-image-2",
      aspectRatio: "1:1",
      resolution: "1K"
    })).rejects.toThrow("正式生图任务运行中");
    expect(clientFactory).not.toHaveBeenCalled();
    expect(service.listBenchmarks()).toHaveLength(0);
  });
});

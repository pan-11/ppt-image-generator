import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchService } from "../src/services/batch-service.js";
import { ProviderAdapterRegistry } from "../src/providers/provider-adapter-registry.js";
import {
  UnknownSubmissionError,
  type AdapterGenerationRequest,
  type ProviderAdapter,
  type ProviderRuntimeConfig
} from "../src/providers/provider-adapter.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function png(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function taskInput(overrides: Record<string, unknown> = {}) {
  return {
    prompt: "wide classroom",
    model: "gpt-image-2",
    aspectRatio: "16:9",
    resolution: "2K",
    size: "16:9",
    n: 1,
    referenceMode: "none",
    referenceImageId: null,
    ...overrides
  };
}

function fakeAdapter(
  protocolType: ProviderAdapter["protocolType"],
  generate: (provider: ProviderRuntimeConfig, request: AdapterGenerationRequest) => Promise<Buffer>
) {
  const calls: Array<{ provider: ProviderRuntimeConfig; request: AdapterGenerationRequest }> = [];
  const adapter: ProviderAdapter = {
    protocolType,
    capabilities: () => [{
      value: "gpt-image-2",
      label: "gpt-image-2",
      aspectRatios: ["16:9"],
      resolutions: ["1K", "2K", "4K"],
      maxN: 10,
      supportsReferenceImages: true
    }],
    resolveRequest: (request) => protocolType === "ym2-openai-images"
      ? {
          requestSize: request.resolution === "2K" ? "2048x1152" : "1280x720",
          expectedDimensions: request.resolution === "2K"
            ? { width: 2048, height: 1152 }
            : { width: 1280, height: 720 }
        }
      : { requestSize: request.aspectRatio },
    generate: async (provider, request) => {
      calls.push({ provider, request });
      return { buffer: await generate(provider, request), mimeType: "image/png" };
    },
    recover: async (provider, request) => {
      calls.push({ provider, request });
      return { buffer: await generate(provider, request), mimeType: "image/png" };
    }
  };
  return { adapter, calls };
}

function createHarness(overrides?: { ym2Bytes?: Buffer; ym2Error?: Error }) {
  const dir = mkdtempSync(join(tmpdir(), "image-generator-job-routing-"));
  tempDirs.push(dir);
  const toApis = fakeAdapter("toapis-async", async () => png(1280, 720));
  const ym2 = fakeAdapter("ym2-openai-images", async () => {
    if (overrides?.ym2Error) throw overrides.ym2Error;
    return overrides?.ym2Bytes ?? png(2048, 1152);
  });
  const service = new BatchService({
    envOverrides: { TOAPIS_API_KEY: "env-key", APP_DATA_DIR: dir },
    backgroundProcessing: false,
    adapterRegistry: new ProviderAdapterRegistry([toApis.adapter, ym2.adapter])
  });
  return { service, toApis, ym2 };
}

async function runJob(service: BatchService, jobId: string) {
  return (service as unknown as {
    runGenerationJob: (id: string) => Promise<{ outcome: "completed" | "failed" }>;
  }).runGenerationJob(jobId);
}

describe("generation job routing", () => {
  it("splits a three-image row into three independent current-role requests", async () => {
    const { service, ym2 } = createHarness();
    try {
      const provider = service.getProviderSettingsService().saveProvider({
        name: "YM2",
        baseUrl: "https://ym2.example.com/v1",
        apiKey: "ym2-key",
        protocolType: "ym2-openai-images",
        maxConcurrency: 100
      });
      service.getProviderSettingsService().setRoleProvider("text", provider.id);
      const created = service.createBatch({ name: "three", tasks: [taskInput({ n: 3 })] });
      const batch = service.getBatch(created.batch.id) as { jobs: Array<{ id: string }> };

      expect(batch.jobs).toHaveLength(3);
      for (const job of batch.jobs) await runJob(service, job.id);

      expect(ym2.calls).toHaveLength(3);
      expect(ym2.calls.every((call) => call.provider.id === provider.id)).toBe(true);
      const settled = service.getBatch(created.batch.id);
      expect(settled.tasks).toEqual([expect.objectContaining({ status: "completed" })]);
      expect(settled.images).toHaveLength(3);
    } finally {
      await service.close();
    }
  });

  it("uses the current image role for referenced root tasks", async () => {
    const { service, toApis, ym2 } = createHarness();
    try {
      const ym2Provider = service.getProviderSettingsService().saveProvider({
        name: "YM2",
        baseUrl: "https://ym2.example.com/v1",
        apiKey: "ym2-key",
        protocolType: "ym2-openai-images",
        maxConcurrency: 100
      });
      service.getProviderSettingsService().setRoleProvider("text", ym2Provider.id);
      service.getProviderSettingsService().setRoleProvider("image", "env:toapis");
      const reference = service.createReferenceImage({
        filename: "reference.png",
        mimeType: "image/png",
        buffer: png(1280, 720)
      });
      const created = service.createBatch({
        name: "referenced",
        tasks: [taskInput({ referenceMode: "row", referenceImageId: reference.id, resolution: "1K" })]
      });
      const [job] = (service.getBatch(created.batch.id) as { jobs: Array<{ id: string }> }).jobs;

      await runJob(service, job.id);

      expect(toApis.calls).toHaveLength(1);
      expect(toApis.calls[0].request.references).toHaveLength(1);
      expect(ym2.calls).toHaveLength(0);
    } finally {
      await service.close();
    }
  });

  it("resolves a switched provider when an unsent job starts", async () => {
    const { service, ym2 } = createHarness();
    try {
      const first = service.getProviderSettingsService().saveProvider({
        name: "YM2 A",
        baseUrl: "https://a.example.com/v1",
        apiKey: "key-a",
        protocolType: "ym2-openai-images",
        maxConcurrency: 100
      });
      const second = service.getProviderSettingsService().saveProvider({
        name: "YM2 B",
        baseUrl: "https://b.example.com/v1",
        apiKey: "key-b",
        protocolType: "ym2-openai-images",
        maxConcurrency: 100
      });
      service.getProviderSettingsService().setRoleProvider("text", first.id);
      const created = service.createBatch({ name: "switch", tasks: [taskInput()] });
      service.getProviderSettingsService().setRoleProvider("text", second.id);
      const [job] = (service.getBatch(created.batch.id) as { jobs: Array<{ id: string }> }).jobs;

      await runJob(service, job.id);

      expect(ym2.calls[0].provider.id).toBe(second.id);
    } finally {
      await service.close();
    }
  });

  it("retains a wrong-size image and fails its validation job", async () => {
    const { service } = createHarness({ ym2Bytes: png(1024, 1536) });
    try {
      const provider = service.getProviderSettingsService().saveProvider({
        name: "YM2",
        baseUrl: "https://ym2.example.com/v1",
        apiKey: "key",
        protocolType: "ym2-openai-images",
        maxConcurrency: 100
      });
      service.getProviderSettingsService().setRoleProvider("text", provider.id);
      const created = service.createBatch({ name: "mismatch", tasks: [taskInput()] });
      const [job] = (service.getBatch(created.batch.id) as { jobs: Array<{ id: string }> }).jobs;

      expect((await runJob(service, job.id)).outcome).toBe("failed");
      expect(service.getBatch(created.batch.id)).toMatchObject({
        jobs: [expect.objectContaining({
          status: "failed",
          requested_size: "2048x1152",
          actual_width: 1024,
          actual_height: 1536,
          error_stage: "validation"
        })],
        images: [expect.any(Object)]
      });
    } finally {
      await service.close();
    }
  });

  it("keeps ambiguous synchronous failures unknown without automatic resubmission", async () => {
    const { service, ym2 } = createHarness({ ym2Error: new UnknownSubmissionError("uncertain") });
    try {
      const provider = service.getProviderSettingsService().saveProvider({
        name: "YM2",
        baseUrl: "https://ym2.example.com/v1",
        apiKey: "key",
        protocolType: "ym2-openai-images",
        maxConcurrency: 100
      });
      service.getProviderSettingsService().setRoleProvider("text", provider.id);
      const created = service.createBatch({ name: "unknown", tasks: [taskInput()] });
      const [job] = (service.getBatch(created.batch.id) as { jobs: Array<{ id: string }> }).jobs;

      expect((await runJob(service, job.id)).outcome).toBe("failed");
      expect(ym2.calls).toHaveLength(1);
      expect(service.getBatch(created.batch.id)).toMatchObject({
        jobs: [expect.objectContaining({ status: "unknown", error_message: "uncertain" })]
      });
    } finally {
      await service.close();
    }
  });

  it("recovers a recorded remote task on retry instead of submitting a duplicate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "image-generator-job-recovery-"));
    tempDirs.push(dir);
    const generate = vi.fn<ProviderAdapter["generate"]>(async (_provider, _request, onRemoteReference) => {
      onRemoteReference({ taskId: "remote-task-1" });
      throw new Error("任务轮询超时");
    });
    const recover = vi.fn<ProviderAdapter["recover"]>(async (_provider, _request, remote) => {
      expect(remote).toEqual({ taskId: "remote-task-1", resultUrl: undefined });
      return { buffer: png(1280, 720), mimeType: "image/png" };
    });
    const adapter: ProviderAdapter = {
      protocolType: "toapis-async",
      capabilities: () => [{
        value: "gpt-image-2",
        label: "gpt-image-2",
        aspectRatios: ["16:9"],
        resolutions: ["1K", "2K"],
        maxN: 10,
        supportsReferenceImages: true
      }],
      resolveRequest: (request) => ({ requestSize: request.aspectRatio }),
      generate,
      recover
    };
    const service = new BatchService({
      envOverrides: { TOAPIS_API_KEY: "env-key", APP_DATA_DIR: dir },
      backgroundProcessing: false,
      adapterRegistry: new ProviderAdapterRegistry([adapter])
    });

    try {
      const created = service.createBatch({ name: "recover", tasks: [taskInput({ resolution: "1K" })] });
      const [job] = (service.getBatch(created.batch.id) as { jobs: Array<{ id: string }> }).jobs;

      expect((await runJob(service, job.id)).outcome).toBe("failed");
      expect(service.getBatch(created.batch.id)).toMatchObject({
        jobs: [expect.objectContaining({ status: "failed", remote_task_id: "remote-task-1" })]
      });

      expect(service.retryTasks([created.tasks[0].id])).toMatchObject({ retriedJobs: 1 });
      expect((await runJob(service, job.id)).outcome).toBe("completed");
      expect(generate).toHaveBeenCalledOnce();
      expect(recover).toHaveBeenCalledOnce();
    } finally {
      await service.close();
    }
  });
});

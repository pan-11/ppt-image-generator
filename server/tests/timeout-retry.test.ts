import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchService } from "../src/services/batch-service.js";
import { ProviderAdapterRegistry } from "../src/providers/provider-adapter-registry.js";
import type { ProviderAdapter } from "../src/providers/provider-adapter.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => {
    rmSync(dir, { recursive: true, force: true });
  });
});

function png() {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(1280, 16);
  buffer.writeUInt32BE(720, 20);
  return buffer;
}

describe("timeout retry", () => {
  it.each([
    "任务轮询超时",
    "查询任务失败：429 rate limit",
    "fetch failed"
  ])("continues the recorded remote task after %s", async (failureMessage) => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-timeout-"));
    tempDirs.push(appDataDir);
    const generate = vi.fn<ProviderAdapter["generate"]>(async (_provider, _request, onRemoteReference) => {
      onRemoteReference({ taskId: "remote-task-1" });
      throw new Error(failureMessage);
    });
    const recover = vi.fn<ProviderAdapter["recover"]>(async (_provider, _request, remote) => {
      expect(remote.taskId).toBe("remote-task-1");
      return { buffer: png(), mimeType: "image/png" };
    });
    const adapter: ProviderAdapter = {
      protocolType: "toapis-async",
      capabilities: () => [{
        value: "gpt-image-2",
        label: "gpt-image-2",
        aspectRatios: ["16:9"],
        resolutions: ["1K"],
        maxN: 10,
        supportsReferenceImages: true
      }],
      resolveRequest: () => ({ requestSize: "16:9" }),
      generate,
      recover
    };
    const service = new BatchService({
      envOverrides: { TOAPIS_API_KEY: "test-key", APP_DATA_DIR: appDataDir },
      backgroundProcessing: false,
      adapterRegistry: new ProviderAdapterRegistry([adapter])
    });

    try {
      const created = service.createBatch({
        name: "Timeout recovery",
        tasks: [{
          prompt: "wide classroom illustration",
          model: "gpt-image-2",
          aspectRatio: "16:9",
          resolution: "1K",
          size: "16:9",
          n: 1,
          referenceMode: "none",
          referenceImageId: null
        }]
      });
      const internals = service as unknown as {
        runGenerationJob: (jobId: string) => Promise<{ outcome: "completed" | "failed" }>;
      };
      const [job] = service.getBatch(created.batch.id).jobs;

      expect((await internals.runGenerationJob(job.id)).outcome).toBe("failed");
      service.retryTasks([created.tasks[0].id]);
      expect((await internals.runGenerationJob(job.id)).outcome).toBe("completed");

      expect(generate).toHaveBeenCalledOnce();
      expect(recover).toHaveBeenCalledOnce();
      expect(service.getBatch(created.batch.id).images).toHaveLength(1);
    } finally {
      await service.close();
    }
  });
});

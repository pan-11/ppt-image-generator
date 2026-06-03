import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchService } from "../src/services/batch-service.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => {
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("timeout retry", () => {
  it("continues polling an existing remote task after a local timeout instead of creating a duplicate", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-timeout-"));
    tempDirs.push(appDataDir);
    const service = new BatchService({
      envOverrides: {
        TOAPIS_API_KEY: "test-key",
        APP_DATA_DIR: appDataDir
      },
      backgroundProcessing: false
    });

    try {
      const created = service.createBatch({
        name: "Timeout recovery",
        tasks: [
          {
            prompt: "wide classroom illustration",
            model: "gpt-image-2",
            aspectRatio: "16:9",
            resolution: "1K",
            size: "16:9",
            n: 1,
            referenceMode: "none",
            referenceImageId: null
          }
        ]
      });
      const taskId = created.tasks[0].id;
      const internals = service as unknown as {
        tasksRepository: {
          updateState: (taskId: string, patch: Record<string, unknown>) => void;
        };
        toApisClient: {
          createImageTask: ReturnType<typeof vi.fn>;
          getImageTask: ReturnType<typeof vi.fn>;
          downloadImage: ReturnType<typeof vi.fn>;
        };
        runTask: (taskId: string) => Promise<{ outcome: "completed" | "failed" }>;
      };

      internals.tasksRepository.updateState(taskId, {
        status: "failed",
        remoteTaskId: "remote-task-1",
        errorMessage: "任务轮询超时"
      });
      internals.toApisClient = {
        createImageTask: vi.fn(),
        getImageTask: vi.fn().mockResolvedValue({
          status: "completed",
          result: { data: [{ url: "https://example.com/image.png" }] }
        }),
        downloadImage: vi.fn().mockResolvedValue({
          buffer: Buffer.from("image-bytes"),
          mimeType: "image/png"
        })
      };

      const result = await internals.runTask(taskId);
      const batch = service.getBatch(created.batch.id);

      expect(result.outcome).toBe("completed");
      expect(internals.toApisClient.createImageTask).not.toHaveBeenCalled();
      expect(internals.toApisClient.getImageTask).toHaveBeenCalledWith("remote-task-1");
      expect(batch.tasks[0]).toMatchObject({ status: "completed", remote_task_id: "remote-task-1" });
      expect(batch.images).toHaveLength(1);
    } finally {
      await service.close();
    }
  });

  it("continues polling an existing remote task after a local query rate-limit failure", async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-rate-limit-"));
    tempDirs.push(appDataDir);
    const service = new BatchService({
      envOverrides: {
        TOAPIS_API_KEY: "test-key",
        APP_DATA_DIR: appDataDir
      },
      backgroundProcessing: false
    });

    try {
      const created = service.createBatch({
        name: "Rate limit recovery",
        tasks: [
          {
            prompt: "wide classroom illustration",
            model: "gpt-image-2",
            aspectRatio: "16:9",
            resolution: "1K",
            size: "16:9",
            n: 1,
            referenceMode: "none",
            referenceImageId: null
          }
        ]
      });
      const taskId = created.tasks[0].id;
      const internals = service as unknown as {
        tasksRepository: {
          updateState: (taskId: string, patch: Record<string, unknown>) => void;
        };
        toApisClient: {
          createImageTask: ReturnType<typeof vi.fn>;
          getImageTask: ReturnType<typeof vi.fn>;
          downloadImage: ReturnType<typeof vi.fn>;
        };
        retryTasks: (taskIds: string[]) => { retried: number };
        runTask: (taskId: string) => Promise<{ outcome: "completed" | "failed" }>;
      };

      internals.tasksRepository.updateState(taskId, {
        status: "failed",
        remoteTaskId: "remote-task-1",
        errorMessage: "查询任务失败：429 rate limit"
      });
      internals.toApisClient = {
        createImageTask: vi.fn(),
        getImageTask: vi.fn().mockResolvedValue({
          status: "completed",
          result: { data: [{ url: "https://example.com/image.png" }] }
        }),
        downloadImage: vi.fn().mockResolvedValue({
          buffer: Buffer.from("image-bytes"),
          mimeType: "image/png"
        })
      };

      internals.retryTasks([taskId]);
      const result = await internals.runTask(taskId);
      const batch = service.getBatch(created.batch.id);

      expect(result.outcome).toBe("completed");
      expect(internals.toApisClient.createImageTask).not.toHaveBeenCalled();
      expect(internals.toApisClient.getImageTask).toHaveBeenCalledWith("remote-task-1");
      expect(batch.tasks[0]).toMatchObject({ status: "completed", remote_task_id: "remote-task-1" });
      expect(batch.images).toHaveLength(1);
    } finally {
      await service.close();
    }
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BatchService, BatchServiceError } from "../src/services/batch-service.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function createService() {
  const dir = mkdtempSync(join(tmpdir(), "image-generator-job-retry-"));
  tempDirs.push(dir);
  return new BatchService({
    envOverrides: { TOAPIS_API_KEY: "env-key", APP_DATA_DIR: dir },
    backgroundProcessing: false
  });
}

function taskInput() {
  return {
    prompt: "wide classroom",
    model: "gpt-image-2",
    aspectRatio: "16:9",
    resolution: "1K",
    size: "16:9",
    n: 3,
    referenceMode: "none",
    referenceImageId: null
  };
}

describe("generation job retry", () => {
  it("queues only failed siblings and never resets successful jobs", async () => {
    const service = createService();
    try {
      const created = service.createBatch({ name: "partial", tasks: [taskInput()] });
      const internals = service as unknown as {
        generationJobsRepository: {
          listByTaskId: (taskId: string) => Array<{ id: string }>;
          updateState: (jobId: string, patch: Record<string, unknown>) => void;
        };
      };
      const jobs = internals.generationJobsRepository.listByTaskId(created.tasks[0].id);
      internals.generationJobsRepository.updateState(jobs[0].id, { status: "completed" });
      internals.generationJobsRepository.updateState(jobs[1].id, { status: "completed" });
      internals.generationJobsRepository.updateState(jobs[2].id, { status: "failed", errorMessage: "failed" });

      expect(service.retryTasks([created.tasks[0].id])).toEqual({
        retriedJobs: 1,
        affectedTasks: 1
      });
      expect(internals.generationJobsRepository.listByTaskId(created.tasks[0].id).map((job: any) => job.status))
        .toEqual(["completed", "completed", "queued"]);
    } finally {
      await service.close();
    }
  });

  it("requires explicit duplicate-charge confirmation before retrying unknown jobs", async () => {
    const service = createService();
    try {
      const created = service.createBatch({ name: "unknown", tasks: [taskInput()] });
      const internals = service as unknown as {
        generationJobsRepository: {
          listByTaskId: (taskId: string) => Array<{ id: string }>;
          updateState: (jobId: string, patch: Record<string, unknown>) => void;
        };
      };
      const [job] = internals.generationJobsRepository.listByTaskId(created.tasks[0].id);
      internals.generationJobsRepository.updateState(job.id, {
        status: "unknown",
        errorMessage: "uncertain"
      });

      expect(() => service.retryTasks([created.tasks[0].id])).toThrowError(
        expect.objectContaining<Partial<BatchServiceError>>({
          statusCode: 409,
          code: "UNKNOWN_CHARGE_RISK"
        })
      );
      expect(service.retryTasks([created.tasks[0].id], { confirmUnknown: true }))
        .toMatchObject({ retriedJobs: 1, affectedTasks: 1 });
    } finally {
      await service.close();
    }
  });
});

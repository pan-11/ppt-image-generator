import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/database.js";
import { createBatchesRepository } from "../src/db/repositories/batches-repository.js";
import { createGenerationJobsRepository } from "../src/db/repositories/generation-jobs-repository.js";
import { createTasksRepository } from "../src/db/repositories/tasks-repository.js";

function createTask() {
  const db = createDatabase(":memory:");
  const batch = createBatchesRepository(db).create({
    name: "job repository",
    status: "draft",
    settingsSnapshot: "{}"
  });
  const [task] = createTasksRepository(db).createMany(batch.id, [{
    prompt: "wide classroom",
    model: "gpt-image-2",
    aspectRatio: "16:9",
    resolution: "2K",
    size: "16:9",
    n: 3,
    referenceMode: "none",
    referenceImageId: null
  }]);
  return { db, batch, task };
}

describe("generation jobs repository", () => {
  it("creates one ordered row per requested output", () => {
    const { db, task } = createTask();
    const repository = createGenerationJobsRepository(db);

    const jobs = repository.createForTask({ taskId: task.id, count: 3, mode: "text" });

    expect(jobs.map((job) => job.output_index)).toEqual([1, 2, 3]);
    expect(jobs.every((job) => job.status === "queued" && job.attempt_count === 0)).toBe(true);
    expect(repository.listByTaskId(task.id)).toHaveLength(3);
    expect(() => repository.createForTask({ taskId: task.id, count: 1, mode: "text" }))
      .toThrow(/unique/i);
    db.close();
  });

  it("binds provider recovery state and detects unsafe revision dependencies", () => {
    const { db, task } = createTask();
    const repository = createGenerationJobsRepository(db);
    const [job] = repository.createForTask({ taskId: task.id, count: 1, mode: "text" });

    repository.bindProvider(job.id, {
      providerId: "provider-a",
      providerRevision: "revision-a",
      protocolType: "toapis-async",
      requestedSize: "16:9"
    });
    expect(repository.startAttempt(job.id)).toBe(1);
    repository.updateState(job.id, {
      status: "remote_queued",
      remoteTaskId: "remote-1"
    });

    expect(repository.hasProviderRevisionDependency("provider-a", "revision-a")).toBe(true);
    expect(repository.getById(job.id)).toMatchObject({
      provider_id: "provider-a",
      provider_revision: "revision-a",
      protocol_type: "toapis-async",
      requested_size: "16:9",
      remote_task_id: "remote-1",
      attempt_count: 1,
      status: "remote_queued"
    });

    repository.updateState(job.id, { status: "completed" });
    expect(repository.hasProviderRevisionDependency("provider-a", "revision-a")).toBe(false);
    db.close();
  });

  it("creates only missing legacy output indexes", () => {
    const { db, task } = createTask();
    const repository = createGenerationJobsRepository(db);

    const jobs = repository.createMissingForLegacyTask({
      taskId: task.id,
      firstOutputIndex: 3,
      count: 1,
      mode: "text"
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ output_index: 3, mode: "text", status: "queued" });
    db.close();
  });
});

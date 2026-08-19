import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type GenerationMode = "text" | "image";

export type GenerationJobStatus =
  | "queued"
  | "submitting"
  | "remote_queued"
  | "downloading"
  | "completed"
  | "failed"
  | "unknown";

export type GenerationJobRecord = {
  id: string;
  task_id: string;
  output_index: number;
  mode: GenerationMode;
  status: GenerationJobStatus;
  provider_id: string | null;
  provider_revision: string | null;
  protocol_type: string | null;
  remote_task_id: string | null;
  remote_result_url: string | null;
  requested_size: string | null;
  attempt_count: number;
  actual_width: number | null;
  actual_height: number | null;
  error_stage: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type GenerationJobPatch = {
  status?: GenerationJobStatus;
  remoteTaskId?: string | null;
  remoteResultUrl?: string | null;
  actualWidth?: number | null;
  actualHeight?: number | null;
  errorStage?: string | null;
  errorMessage?: string | null;
};

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function createGenerationJobsRepository(db: Database.Database) {
  const insert = db.prepare(
    `insert into generation_jobs (
      id, task_id, output_index, mode, status, provider_id, provider_revision, protocol_type,
      remote_task_id, remote_result_url, requested_size, attempt_count, actual_width,
      actual_height, error_stage, error_message, created_at, updated_at
    ) values (
      @id, @taskId, @outputIndex, @mode, 'queued', null, null, null,
      null, null, null, 0, null, null, null, null, @createdAt, @updatedAt
    )`
  );

  function createRange(input: {
    taskId: string;
    firstOutputIndex: number;
    count: number;
    mode: GenerationMode;
  }) {
    const now = new Date().toISOString();
    const rows = Array.from({ length: input.count }, (_, offset) => ({
      id: randomUUID(),
      taskId: input.taskId,
      outputIndex: input.firstOutputIndex + offset,
      mode: input.mode,
      createdAt: now,
      updatedAt: now
    }));
    const create = db.transaction((records: typeof rows) => {
      records.forEach((record) => insert.run(record));
    });
    create(rows);
    return rows.map((row) => ({
      id: row.id,
      task_id: row.taskId,
      output_index: row.outputIndex,
      mode: row.mode,
      status: "queued" as const,
      provider_id: null,
      provider_revision: null,
      protocol_type: null,
      remote_task_id: null,
      remote_result_url: null,
      requested_size: null,
      attempt_count: 0,
      actual_width: null,
      actual_height: null,
      error_stage: null,
      error_message: null,
      created_at: row.createdAt,
      updated_at: row.updatedAt
    } satisfies GenerationJobRecord));
  }

  return {
    createForTask(input: { taskId: string; count: number; mode: GenerationMode }) {
      return createRange({ ...input, firstOutputIndex: 1 });
    },
    createMissingForLegacyTask(input: {
      taskId: string;
      firstOutputIndex: number;
      count: number;
      mode: GenerationMode;
    }) {
      return createRange(input);
    },
    getById(jobId: string) {
      return db.prepare("select * from generation_jobs where id = ?").get(jobId) as
        | GenerationJobRecord
        | undefined;
    },
    listByTaskId(taskId: string) {
      return db.prepare(
        "select * from generation_jobs where task_id = ? order by output_index asc"
      ).all(taskId) as GenerationJobRecord[];
    },
    listByTaskIds(taskIds: string[]) {
      if (taskIds.length === 0) return [];
      const placeholders = taskIds.map(() => "?").join(", ");
      return db.prepare(
        `select * from generation_jobs where task_id in (${placeholders}) order by task_id, output_index`
      ).all(...taskIds) as GenerationJobRecord[];
    },
    listByBatchId(batchId: string) {
      return db.prepare(
        `select generation_jobs.*
         from generation_jobs
         inner join tasks on tasks.id = generation_jobs.task_id
         where tasks.batch_id = ?
         order by tasks.created_at asc, generation_jobs.output_index asc`
      ).all(batchId) as GenerationJobRecord[];
    },
    bindProvider(jobId: string, input: {
      providerId: string;
      providerRevision: string;
      protocolType: string;
      requestedSize: string;
    }) {
      db.prepare(
        `update generation_jobs
         set provider_id = @providerId,
             provider_revision = @providerRevision,
             protocol_type = @protocolType,
             requested_size = @requestedSize,
             updated_at = @updatedAt
         where id = @id`
      ).run({ id: jobId, ...input, updatedAt: new Date().toISOString() });
    },
    clearProviderBinding(jobId: string) {
      db.prepare(
        `update generation_jobs
         set provider_id = null,
             provider_revision = null,
             protocol_type = null,
             remote_task_id = null,
             remote_result_url = null,
             requested_size = null,
             updated_at = @updatedAt
         where id = @id`
      ).run({ id: jobId, updatedAt: new Date().toISOString() });
    },
    startAttempt(jobId: string) {
      db.prepare(
        `update generation_jobs
         set attempt_count = attempt_count + 1,
             updated_at = @updatedAt
         where id = @id`
      ).run({ id: jobId, updatedAt: new Date().toISOString() });
      const row = db.prepare("select attempt_count from generation_jobs where id = ?").get(jobId) as
        | { attempt_count: number }
        | undefined;
      return row?.attempt_count ?? 0;
    },
    updateState(jobId: string, patch: GenerationJobPatch) {
      const current = db.prepare("select * from generation_jobs where id = ?").get(jobId) as
        | GenerationJobRecord
        | undefined;
      if (!current) return;
      db.prepare(
        `update generation_jobs
         set status = @status,
             remote_task_id = @remoteTaskId,
             remote_result_url = @remoteResultUrl,
             actual_width = @actualWidth,
             actual_height = @actualHeight,
             error_stage = @errorStage,
             error_message = @errorMessage,
             updated_at = @updatedAt
         where id = @id`
      ).run({
        id: jobId,
        status: patch.status ?? current.status,
        remoteTaskId: hasOwn(patch, "remoteTaskId") ? patch.remoteTaskId ?? null : current.remote_task_id,
        remoteResultUrl: hasOwn(patch, "remoteResultUrl") ? patch.remoteResultUrl ?? null : current.remote_result_url,
        actualWidth: hasOwn(patch, "actualWidth") ? patch.actualWidth ?? null : current.actual_width,
        actualHeight: hasOwn(patch, "actualHeight") ? patch.actualHeight ?? null : current.actual_height,
        errorStage: hasOwn(patch, "errorStage") ? patch.errorStage ?? null : current.error_stage,
        errorMessage: hasOwn(patch, "errorMessage") ? patch.errorMessage ?? null : current.error_message,
        updatedAt: new Date().toISOString()
      });
    },
    hasProviderRevisionDependency(providerId: string, providerRevision: string) {
      const row = db.prepare(
        `select 1
         from generation_jobs
         where provider_id = ?
           and provider_revision = ?
           and (
             status in ('submitting', 'remote_queued', 'downloading', 'unknown')
             or (status = 'failed' and (remote_task_id is not null or remote_result_url is not null))
           )
         limit 1`
      ).get(providerId, providerRevision);
      return Boolean(row);
    },
    countByTaskId(taskId: string) {
      const row = db.prepare(
        `select
           count(*) as total,
           sum(case when status = 'completed' then 1 else 0 end) as completed,
           sum(case when status = 'failed' then 1 else 0 end) as failed,
           sum(case when status = 'unknown' then 1 else 0 end) as unknown,
           sum(case when status in ('queued', 'submitting', 'remote_queued', 'downloading') then 1 else 0 end) as active
         from generation_jobs
         where task_id = ?`
      ).get(taskId) as Record<string, number | null>;
      return {
        total: row.total ?? 0,
        completed: row.completed ?? 0,
        failed: row.failed ?? 0,
        unknown: row.unknown ?? 0,
        active: row.active ?? 0
      };
    }
  };
}

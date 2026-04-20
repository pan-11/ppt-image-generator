import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type TaskDraftInput = {
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  size: string;
  n: number;
  referenceMode: string;
  referenceImageId: string | null;
};

export function createTasksRepository(db: Database.Database) {
  return {
    createMany(batchId: string, drafts: TaskDraftInput[]) {
      const now = new Date().toISOString();
      const insert = db.prepare(
        `insert into tasks (
          id, batch_id, prompt, model, aspect_ratio, resolution, size, n, reference_mode, reference_image_id,
          status, remote_task_id, error_message, retry_count, created_at, updated_at
        ) values (
          @id, @batchId, @prompt, @model, @aspectRatio, @resolution, @size, @n, @referenceMode, @referenceImageId,
          'queued', null, null, 0, @createdAt, @updatedAt
        )`
      );

      const created = drafts.map((draft) => ({
        id: randomUUID(),
        batchId,
        ...draft,
        createdAt: now,
        updatedAt: now,
        status: "queued"
      }));

      const transaction = db.transaction((rows: typeof created) => {
        rows.forEach((row) => insert.run(row));
      });

      transaction(created);
      return created;
    },
    listByBatchId(batchId: string) {
      return db.prepare("select * from tasks where batch_id = ? order by created_at asc").all(batchId);
    },
    listByIds(taskIds: string[]) {
      if (taskIds.length === 0) {
        return [];
      }

      const placeholders = taskIds.map(() => "?").join(", ");
      return db.prepare(`select * from tasks where id in (${placeholders}) order by created_at asc`).all(...taskIds);
    },
    getById(taskId: string) {
      return db.prepare("select * from tasks where id = ?").get(taskId);
    },
    updateState(taskId: string, patch: { status?: string; remoteTaskId?: string | null; errorMessage?: string | null; retryCount?: number }) {
      const current = db.prepare("select * from tasks where id = ?").get(taskId) as Record<string, unknown> | undefined;

      if (!current) {
        return;
      }

      db.prepare(
        `update tasks
         set status = @status,
             remote_task_id = @remoteTaskId,
             error_message = @errorMessage,
             retry_count = @retryCount,
             updated_at = @updatedAt
         where id = @id`
      ).run({
        id: taskId,
        status: patch.status ?? current.status,
        remoteTaskId: patch.remoteTaskId ?? current.remote_task_id ?? null,
        errorMessage: patch.errorMessage ?? current.error_message ?? null,
        retryCount: patch.retryCount ?? current.retry_count ?? 0,
        updatedAt: new Date().toISOString()
      });
    },
    deleteByBatchId(batchId: string) {
      db.prepare("delete from tasks where batch_id = ?").run(batchId);
    },
    countByBatchId(batchId: string) {
      const row = db.prepare(
        `select
          count(*) as total,
          sum(case when status = 'completed' then 1 else 0 end) as completed,
          sum(case when status = 'failed' then 1 else 0 end) as failed
         from tasks
         where batch_id = ?`
      ).get(batchId) as { total: number; completed: number | null; failed: number | null };

      return {
        total: row.total ?? 0,
        completed: row.completed ?? 0,
        failed: row.failed ?? 0
      };
    }
  };
}

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type BatchRecord = {
  id: string;
  name: string;
  status: string;
  settingsSnapshot: string;
  totalTasks: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
};

export function createBatchesRepository(db: Database.Database) {
  return {
    create(input: {
      name: string;
      status: string;
      settingsSnapshot: string;
    }): BatchRecord {
      const record: BatchRecord = {
        id: randomUUID(),
        name: input.name,
        status: input.status,
        settingsSnapshot: input.settingsSnapshot,
        totalTasks: 0,
        successCount: 0,
        failedCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.prepare(
        `insert into batches (
          id, name, status, settings_snapshot, total_tasks, success_count, failed_count, created_at, updated_at
        ) values (
          @id, @name, @status, @settingsSnapshot, @totalTasks, @successCount, @failedCount, @createdAt, @updatedAt
        )`
      ).run(record);

      return record;
    },
    updateCounts(batchId: string, counts: { totalTasks?: number; successCount?: number; failedCount?: number; status?: string }) {
      const current = db.prepare("select * from batches where id = ?").get(batchId) as Record<string, unknown> | undefined;

      if (!current) {
        return;
      }

      db.prepare(
        `update batches
         set total_tasks = @totalTasks,
             success_count = @successCount,
             failed_count = @failedCount,
             status = @status,
             updated_at = @updatedAt
         where id = @id`
      ).run({
        id: batchId,
        totalTasks: counts.totalTasks ?? current.total_tasks,
        successCount: counts.successCount ?? current.success_count,
        failedCount: counts.failedCount ?? current.failed_count,
        status: counts.status ?? current.status,
        updatedAt: new Date().toISOString()
      });
    },
    getById(batchId: string) {
      return db.prepare("select * from batches where id = ?").get(batchId);
    },
    list() {
      return db.prepare("select * from batches order by created_at desc").all();
    },
    delete(batchId: string) {
      db.prepare("delete from batches where id = ?").run(batchId);
    }
  };
}

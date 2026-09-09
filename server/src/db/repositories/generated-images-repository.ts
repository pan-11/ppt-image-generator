import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type GeneratedImageRow = {
  id: string;
  batch_id: string;
  task_id: string;
  filename: string;
  local_path: string;
  mime_type: string;
  created_at: string;
};

export function createGeneratedImagesRepository(db: Database.Database) {
  return {
    create(input: {
      batchId: string;
      taskId: string;
      filename: string;
      localPath: string;
      mimeType: string;
    }) {
      const record = {
        id: randomUUID(),
        ...input,
        createdAt: new Date().toISOString()
      };

      db.prepare(
        `insert into generated_images (
          id, batch_id, task_id, filename, local_path, mime_type, created_at
        ) values (
          @id, @batchId, @taskId, @filename, @localPath, @mimeType, @createdAt
        )`
      ).run(record);

      return record;
    },
    listByBatchId(batchId: string) {
      return db.prepare("select * from generated_images where batch_id = ? order by created_at asc").all(batchId) as GeneratedImageRow[];
    },
    listByTaskId(taskId: string) {
      return db.prepare("select * from generated_images where task_id = ? order by created_at asc").all(taskId) as GeneratedImageRow[];
    },
    listByIds(imageIds: string[]) {
      if (imageIds.length === 0) {
        return [];
      }

      const placeholders = imageIds.map(() => "?").join(", ");
      return db.prepare(`select * from generated_images where id in (${placeholders}) order by created_at asc`).all(...imageIds) as GeneratedImageRow[];
    },
    getById(imageId: string) {
      return db.prepare("select * from generated_images where id = ?").get(imageId) as GeneratedImageRow | undefined;
    },
    delete(imageId: string) {
      db.prepare("delete from generated_images where id = ?").run(imageId);
    },
    deleteByBatchId(batchId: string) {
      db.prepare("delete from generated_images where batch_id = ?").run(batchId);
    }
  };
}

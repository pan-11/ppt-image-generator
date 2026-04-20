import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export function createReferenceImagesRepository(db: Database.Database) {
  return {
    create(input: { filename: string; localPath: string; mimeType: string }) {
      const record = {
        id: randomUUID(),
        ...input,
        remoteUrl: null as string | null,
        createdAt: new Date().toISOString()
      };

      db.prepare(
        `insert into reference_images (id, filename, local_path, mime_type, remote_url, created_at)
         values (@id, @filename, @localPath, @mimeType, @remoteUrl, @createdAt)`
      ).run(record);

      return record;
    },
    getById(referenceImageId: string) {
      return db.prepare("select * from reference_images where id = ?").get(referenceImageId);
    },
    updateLocalPath(referenceImageId: string, localPath: string) {
      db.prepare("update reference_images set local_path = ? where id = ?").run(localPath, referenceImageId);
    },
    updateRemoteUrl(referenceImageId: string, remoteUrl: string) {
      db.prepare("update reference_images set remote_url = ? where id = ?").run(remoteUrl, referenceImageId);
    }
  };
}

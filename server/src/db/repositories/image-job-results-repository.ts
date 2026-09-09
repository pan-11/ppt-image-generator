import type Database from "better-sqlite3";
export function createImageJobResultsRepository(db: Database.Database) {
  return {
    create(input: { imageId: string; jobId: string; attemptNumber: number; validationStatus: "valid" | "invalid" | "unverified"; actualWidth: number | null; actualHeight: number | null }) {
      db.prepare("insert into image_job_results (image_id,job_id,attempt_number,validation_status,actual_width,actual_height,created_at) values (@imageId,@jobId,@attemptNumber,@validationStatus,@actualWidth,@actualHeight,@now)").run({ ...input, now: new Date().toISOString() });
    }
  };
}

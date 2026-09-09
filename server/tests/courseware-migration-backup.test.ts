import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/database.js";
import { createBatchesRepository } from "../src/db/repositories/batches-repository.js";
import { createTasksRepository } from "../src/db/repositories/tasks-repository.js";
import { createGeneratedImagesRepository } from "../src/db/repositories/generated-images-repository.js";
import { createGenerationJobsRepository } from "../src/db/repositories/generation-jobs-repository.js";
import { createReferenceImagesRepository } from "../src/db/repositories/reference-images-repository.js";

function legacyFixture() {
  const dir = mkdtempSync(join(tmpdir(), "courseware-backup-"));
  const filename = join(dir, "legacy.sqlite");
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.exec(readFileSync(new URL("../src/db/schema.sql", import.meta.url), "utf8").split("create table if not exists coursewares")[0]);
  const batch = createBatchesRepository(db).create({ name: "现有课件", status: "completed", settingsSnapshot: "{}" });
  const reference = createReferenceImagesRepository(db).create({ filename: "reference.png", localPath: "reference.png", mimeType: "image/png" });
  const [task] = createTasksRepository(db).createMany(batch.id, [{ prompt: "保留原有提示词", model: "gpt-image-1", aspectRatio: "1:1", resolution: "standard", size: "1024x1024", n: 1, referenceMode: "row", referenceImageId: reference.id }]);
  createGenerationJobsRepository(db).createForTask({ taskId: task.id, count: 1, mode: "image" });
  createGeneratedImagesRepository(db).create({ batchId: batch.id, taskId: task.id, filename: "original.png", localPath: "original.png", mimeType: "image/png" });
  return { db, dir, filename };
}
const oldTables = ["batches", "tasks", "generated_images", "reference_images", "generation_jobs"];

describe("consistent courseware migration backup", () => {
  it("backs up the five existing tables including committed WAL rows before adding tables, and only once", () => {
    const f = legacyFixture();
    const migrated = createDatabase(f.filename);
    try {
      const files = readdirSync(f.dir).filter(name => name.endsWith(".bak"));
      expect(files).toHaveLength(1);
      const backup = new Database(join(f.dir, files[0]), { readonly: true, fileMustExist: true });
      try {
        expect(backup.pragma("quick_check", { simple: true })).toBe("ok");
        expect(backup.prepare("select name from sqlite_master where name='coursewares'").get()).toBeUndefined();
        for (const name of oldTables) {
          expect(backup.prepare(`select * from ${name}`).all()).toEqual(migrated.prepare(`select * from ${name}`).all());
          expect(backup.prepare(`select count(*) as n from ${name}`).get()).toEqual({ n: 1 });
        }
      } finally { backup.close(); }
      expect(migrated.prepare("select name from sqlite_master where name='coursewares'").get()).toBeDefined();
    } finally { migrated.close(); f.db.close(); }
    createDatabase(f.filename).close();
    expect(readdirSync(f.dir).filter(name => name.endsWith(".bak"))).toHaveLength(1);
  });
  it("does not create a backup for fresh or in-memory databases", () => {
    const dir = mkdtempSync(join(tmpdir(), "courseware-fresh-"));
    createDatabase(join(dir, "fresh.sqlite")).close();
    createDatabase(":memory:").close();
    expect(readdirSync(dir).filter(name => name.endsWith(".bak"))).toHaveLength(0);
  });
  it("allows concurrent existing-database starts and retains a readable pre-migration snapshot", async () => {
    const f = legacyFixture();
    f.db.close();
    const script = `import { createDatabase } from './src/db/database.ts'; const db=createDatabase(process.argv[1]); db.close();`;
    await Promise.all(Array.from({ length: 6 }, () => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, f.filename], { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      let errors = "";
      child.stderr.on("data", chunk => { errors += String(chunk); });
      child.on("error", reject);
      child.on("exit", code => code === 0 ? resolve() : reject(new Error(errors)));
    })));
    const backups = readdirSync(f.dir).filter(name => name.endsWith(".bak"));
    expect(backups.length).toBeGreaterThan(0);
    let preMigration = 0;
    for (const filename of backups) {
      const db = new Database(join(f.dir, filename), { readonly: true });
      expect(db.pragma("quick_check", { simple: true })).toBe("ok");
      if (!db.prepare("select name from sqlite_master where name='coursewares'").get()) preMigration++;
      expect(db.prepare("select count(*) as n from tasks").get()).toEqual({ n: 1 });
      db.close();
    }
    expect(preMigration).toBeGreaterThan(0);
  }, 20000);
});

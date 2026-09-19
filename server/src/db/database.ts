import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

function backupBeforeCoursewareMigration(db: Database.Database, filename: string) {
  if (filename === ":memory:") return;
  const tables = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>;
  const names = new Set(tables.map(table => table.name));
  if (names.has("coursewares") || !names.has("tasks") || !names.has("batches")) return;

  const backupPath = `${resolve(filename)}.before-courseware-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.bak`;
  // VACUUM INTO takes a consistent SQLite snapshot, including committed WAL content.
  db.prepare("vacuum into ?").run(backupPath);
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    const checks = backup.pragma("quick_check") as Array<{ quick_check: string }>;
    if (checks.length !== 1 || checks[0].quick_check !== "ok") throw new Error("课件升级前的数据库备份校验失败，已停止升级");
    for (const name of ["batches", "tasks", "generated_images", "reference_images", "generation_jobs"]) {
      if (names.has(name)) backup.prepare(`select count(*) from ${name}`).get();
    }
  } finally {
    backup.close();
  }
}

function ensureTaskColumns(db: Database.Database) {
  const migrate = db.transaction(() => {
    const columns = db.prepare("pragma table_info(tasks)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("aspect_ratio")) {
      db.exec("alter table tasks add column aspect_ratio text");
    }

    if (!columnNames.has("resolution")) {
      db.exec("alter table tasks add column resolution text");
    }

    if (!columnNames.has("parent_image_id")) {
      db.exec("alter table tasks add column parent_image_id text");
    }

    if (!columnNames.has("note")) {
      db.exec("alter table tasks add column note text");
    }
  });

  migrate.exclusive();
}

function migrateExternalImages(db: Database.Database, filename: string, schema: string) {
  db.transaction(() => {
    const columns = db.prepare("pragma table_info(tasks)").all() as Array<{ name: string }>;
    const needsColumn = columns.length > 0 && !columns.some(column => column.name === "auxiliary_reference_image_id");
    const needsTable = !db.prepare("select name from sqlite_master where name='courseware_uploaded_images'").get();
    if (!needsColumn && !needsTable) { db.exec(schema); return; }
    const hasCoursewares = db.prepare("select name from sqlite_master where name='coursewares'").get();
    if (filename !== ":memory:" && hasCoursewares) {
      const backupPath = `${resolve(filename)}.before-external-images-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.bak`;
      // The exclusive transaction serializes startup and freezes committed WAL content.
      // serialize() reads SQLite's snapshot instead of copying just the main file.
      writeFileSync(backupPath, db.serialize(), { flag: "wx" });
      const backup = new Database(backupPath, { fileMustExist: true });
      try {
        // Make the retained snapshot independently readable without WAL sidecars.
        backup.pragma("journal_mode = DELETE");
        if (backup.pragma("quick_check", { simple: true }) !== "ok") throw new Error("外部图片升级前的数据库备份校验失败，已停止升级");
        backup.prepare("select count(*) from coursewares").get();
      } finally { backup.close(); }
    }
    if (needsColumn) db.exec("alter table tasks add column auxiliary_reference_image_id text");
    db.exec(schema);
  }).exclusive();
}

export function createDatabase(filename: string) {
  if (filename !== ":memory:") {
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  }

  const db = new Database(filename);
  try {
    db.pragma("foreign_keys = ON");
    backupBeforeCoursewareMigration(db, filename);
    const schemaPath = new URL("./schema.sql", import.meta.url);
    migrateExternalImages(db, filename, readFileSync(schemaPath, "utf8"));
    ensureTaskColumns(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

function ensureTaskColumns(db: Database.Database) {
  const columns = db.prepare("pragma table_info(tasks)").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("aspect_ratio")) {
    db.exec("alter table tasks add column aspect_ratio text");
  }

  if (!columnNames.has("resolution")) {
    db.exec("alter table tasks add column resolution text");
  }
}

export function createDatabase(filename: string) {
  if (filename !== ":memory:") {
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  const schemaPath = new URL("./schema.sql", import.meta.url);
  db.exec(readFileSync(schemaPath, "utf8"));
  ensureTaskColumns(db);
  return db;
}

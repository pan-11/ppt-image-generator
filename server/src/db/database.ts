import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export function createDatabase(filename: string) {
  if (filename !== ":memory:") {
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  const schemaPath = new URL("./schema.sql", import.meta.url);
  db.exec(readFileSync(schemaPath, "utf8"));
  return db;
}

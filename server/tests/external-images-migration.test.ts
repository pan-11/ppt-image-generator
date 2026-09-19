import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/database.js";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "external-images-migration-"));
  const filename = join(dir, "app.sqlite");
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  const schema = readFileSync(new URL("../src/db/schema.sql", import.meta.url), "utf8")
    .replace(/\s*auxiliary_reference_image_id text,/, "")
    .split("create table if not exists courseware_uploaded_images")[0];
  db.exec(schema);
  db.prepare("insert into coursewares values ('kept','保留课件','manual',null,null,null,null,'[]',3,'now','now')").run();
  db.exec("insert into batches values ('batch','既有批次','completed','{}',1,1,0,'now','now'); insert into tasks (id,batch_id,prompt,model,size,n,reference_mode,status,created_at,updated_at) values ('task','batch','原始提示词','gpt-image-1','1024x1024',1,'none','completed','now','now')");
  return { dir, filename, db };
}

describe("external-image additive migration", () => {
  it("retains a consistent pre-feature snapshot including committed WAL data and migrates once", () => {
    const f = fixture();
    const migrated = createDatabase(f.filename);
    try {
      expect(migrated.prepare("pragma table_info(tasks)").all().filter((r: any) => r.name === "auxiliary_reference_image_id")).toHaveLength(1);
      expect(migrated.prepare("select name from sqlite_master where name='courseware_uploaded_images'").get()).toBeDefined();
      expect(migrated.prepare("select prompt,auxiliary_reference_image_id from tasks").all()).toEqual([{ prompt: "原始提示词", auxiliary_reference_image_id: null }]);
      const backups = readdirSync(f.dir).filter(name => name.includes(".before-external-images-"));
      expect(backups).toHaveLength(1);
      const backup = new Database(join(f.dir, backups[0]), { readonly: true });
      try {
        expect(backup.pragma("quick_check", { simple: true })).toBe("ok");
        expect(backup.prepare("select * from coursewares").all()).toEqual(migrated.prepare("select * from coursewares").all());
        expect(backup.prepare("select prompt from tasks").all()).toEqual([{ prompt: "原始提示词" }]);
        expect(backup.prepare("select name from sqlite_master where name='courseware_uploaded_images'").get()).toBeUndefined();
        expect(backup.prepare("pragma table_info(tasks)").all().some((r: any) => r.name === "auxiliary_reference_image_id")).toBe(false);
      } finally { backup.close(); }
    } finally { migrated.close(); f.db.close(); }
    createDatabase(f.filename).close();
    expect(readdirSync(f.dir).filter(name => name.includes(".before-external-images-"))).toHaveLength(1);
  });
  it("serializes concurrent starts and makes exactly one pre-feature backup", async () => {
    const f = fixture(); f.db.close();
    await Promise.all(Array.from({ length: 6 }, () => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "import {createDatabase} from './src/db/database.ts'; createDatabase(process.argv[1]).close();", f.filename], { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      let errors = "";
      child.stderr.on("data", chunk => { errors += String(chunk); });
      child.on("error", reject);
      child.on("exit", code => code === 0 ? resolve() : reject(new Error(errors)));
    })));
    expect(readdirSync(f.dir).filter(name => name.includes(".before-external-images-"))).toHaveLength(1);
    const db = createDatabase(f.filename);
    expect(db.prepare("select revision from coursewares where id='kept'").get()).toEqual({ revision: 3 });
    db.close();
  }, 20000);
});

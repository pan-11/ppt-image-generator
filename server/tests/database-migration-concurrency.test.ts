import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("database migrations", () => {
  it("allows concurrent application starts to add the task note column once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "image-generator-concurrent-migration-"));
    tempDirs.push(dir);
    const filename = join(dir, "legacy.sqlite");
    const startFile = join(dir, "start");
    const legacy = new Database(filename);
    legacy.exec(`
      create table tasks (
        id text primary key,
        batch_id text not null,
        prompt text not null,
        model text not null,
        aspect_ratio text,
        resolution text,
        size text not null,
        n integer not null,
        reference_mode text not null,
        reference_image_id text,
        parent_image_id text,
        status text not null,
        remote_task_id text,
        error_message text,
        retry_count integer not null default 0,
        created_at text not null,
        updated_at text not null
      );
    `);
    legacy.close();

    const script = `
      (async () => {
        const { existsSync } = await import("node:fs");
        const { createDatabase } = await import("./src/db/database.ts");
        process.stdout.write("ready\\n");
        while (!existsSync(process.argv[2])) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        const db = createDatabase(process.argv[1]);
        db.close();
      })().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    `;

    const children = Array.from({ length: 12 }, () => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "-e", script, filename, startFile],
        { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      const ready = new Promise<void>((resolve, reject) => {
        child.stdout.on("data", (chunk) => {
          if (String(chunk).includes("ready")) {
            resolve();
          }
        });
        child.on("error", reject);
      });
      const done = new Promise<void>((resolve, reject) => {
        child.on("exit", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(stderr || `migration process exited with ${code}`));
          }
        });
      });

      return { ready, done };
    });

    await Promise.all(children.map((child) => child.ready));
    writeFileSync(startFile, "go");
    await expect(Promise.all(children.map((child) => child.done))).resolves.toBeDefined();

    const migrated = new Database(filename, { readonly: true });
    const noteColumns = (migrated.prepare("pragma table_info(tasks)").all() as Array<{ name: string }>)
      .filter((column) => column.name === "note");
    expect(noteColumns).toHaveLength(1);
    migrated.close();
  }, 20000);
});

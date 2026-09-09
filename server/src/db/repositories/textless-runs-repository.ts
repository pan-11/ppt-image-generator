import type Database from "better-sqlite3";
import type { TextlessRun } from "../../services/courseware-types.js";
export function createTextlessRunsRepository(db: Database.Database) {
  function decode(row: unknown): TextlessRun | undefined {
    if (!row) return;
    const r = row as Record<string, unknown>;
    return { id: String(r.id), coursewareId: String(r.courseware_id), requestId: String(r.request_id), sourceRevision: Number(r.source_revision), promptText: String(r.prompt_text), model: String(r.model), manifest: JSON.parse(String(r.manifest_json)) };
  }
  return {
    get(id: string) { return decode(db.prepare("select * from textless_runs where id=?").get(id)); },
    find(coursewareId: string, requestId: string) { return decode(db.prepare("select * from textless_runs where courseware_id=? and request_id=?").get(coursewareId, requestId)); },
    list(id: string) { return db.prepare("select * from textless_runs where courseware_id=? order by created_at desc,rowid desc").all(id).map(row => decode(row)!); },
    create(run: TextlessRun) { db.prepare("insert into textless_runs (id,courseware_id,request_id,source_revision,prompt_text,model,manifest_json,created_at) values (@id,@coursewareId,@requestId,@sourceRevision,@promptText,@model,@manifest,@now)").run({ ...run, manifest: JSON.stringify(run.manifest), now: new Date().toISOString() }); }
  };
}

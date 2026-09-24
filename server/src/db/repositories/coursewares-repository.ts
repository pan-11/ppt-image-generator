import type Database from "better-sqlite3";
import type { CoursewareDocument } from "../../services/courseware-types.js";

export function createCoursewaresRepository(db: Database.Database) {
  function get(id: string): CoursewareDocument | undefined {
    const row = db.prepare("select * from coursewares where id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return;
    return { id: String(row.id), name: String(row.name), sourceKind: row.source_kind as CoursewareDocument["sourceKind"], rawImportText: row.raw_import_text as string | null, importMode: row.import_mode as CoursewareDocument["importMode"], legacyBatchId: row.legacy_batch_id as string | null, globalReferenceImageId: row.global_reference_image_id as string | null, revision: Number(row.revision), pages: JSON.parse(String(row.pages_json)) };
  }
  return {
    get,
    list() { return db.prepare(`select c.id,c.name,c.source_kind as sourceKind,c.revision,c.updated_at as updatedAt,json_array_length(c.pages_json) as pageCount,
      (select count(*) from json_each(c.pages_json) p where json_extract(p.value,'$.selectedImageId') is not null) as selectedPageCount,
      (select json_extract(p.value,'$.selectedImageId') from json_each(c.pages_json) p where json_extract(p.value,'$.selectedImageId') is not null order by cast(p.key as integer) limit 1) as coverImageId
      from coursewares c order by c.updated_at desc`).all(); },
    byBatch(batchId: string) { const row = db.prepare("select id from coursewares where legacy_batch_id = ?").get(batchId) as { id: string } | undefined; return row ? get(row.id) : undefined; },
    create(doc: CoursewareDocument) {
      db.prepare("insert into coursewares (id,name,source_kind,raw_import_text,import_mode,legacy_batch_id,global_reference_image_id,pages_json,revision,created_at,updated_at) values (@id,@name,@sourceKind,@rawImportText,@importMode,@legacyBatchId,@globalReferenceImageId,@pages,0,@now,@now)").run({ ...doc, pages: JSON.stringify(doc.pages), now: new Date().toISOString() });
      return get(doc.id)!;
    },
    update(doc: CoursewareDocument, expectedRevision: number) {
      return db.prepare("update coursewares set name=@name,global_reference_image_id=@globalReferenceImageId,pages_json=@pages,revision=revision+1,updated_at=@now where id=@id and revision=@expectedRevision").run({ id: doc.id, name: doc.name, globalReferenceImageId: doc.globalReferenceImageId, pages: JSON.stringify(doc.pages), now: new Date().toISOString(), expectedRevision }).changes > 0;
    }
  };
}

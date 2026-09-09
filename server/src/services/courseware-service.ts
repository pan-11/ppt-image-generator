import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { createCoursewaresRepository } from "../db/repositories/coursewares-repository.js";
import { createCoursewareTaskLinksRepository } from "../db/repositories/courseware-task-links-repository.js";
import type { CoursewareDocument, CoursewarePage } from "./courseware-types.js";

export class CoursewareError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}
export type CoursewareImage = { id: string; task_id: string; batch_id: string; filename: string; local_path: string; mime_type: string; validation_status: string };

export class CoursewareService {
  readonly records;
  readonly links;
  constructor(private db: Database.Database, private maxPages: number) {
    this.records = createCoursewaresRepository(db);
    this.links = createCoursewareTaskLinksRepository(db);
  }
  require(id: string) {
    const doc = this.records.get(id);
    if (!doc) throw new CoursewareError(404, "COURSEWARE_NOT_FOUND", "课件不存在");
    return doc;
  }
  image(id: string) {
    return this.db.prepare("select i.*,coalesce(r.validation_status,'unverified') as validation_status from generated_images i left join image_job_results r on r.image_id=i.id where i.id=?").get(id) as CoursewareImage | undefined;
  }
  validatePages(id: string, pages: CoursewarePage[]) {
    if (pages.length > this.maxPages) throw new CoursewareError(413, "TOO_MANY_PAGES", `最多保存 ${this.maxPages} 页`);
    if (new Set(pages.map(p => p.id)).size !== pages.length || pages.some((p, index) => p.position !== index)) throw new CoursewareError(400, "INVALID_PAGE_ORDER", "页面 ID 必须唯一，顺序必须连续");
    for (const page of pages) {
      if (!page.selectedImageId) continue;
      const image = this.image(page.selectedImageId);
      const link = image && this.links.get(image.task_id);
      if (!image || !link || link.coursewareId !== id || link.pageId !== page.id || link.purpose === "textless" || image.validation_status === "invalid") throw new CoursewareError(409, "INVALID_SELECTION", `第 ${page.position + 1} 页的定稿图片不属于本页或不可用`);
    }
  }
  create(doc: CoursewareDocument) {
    if (doc.rawImportText !== null && Buffer.byteLength(doc.rawImportText, "utf8") > 2 * 1024 * 1024) throw new CoursewareError(413, "IMPORT_TOO_LARGE", "原文不能超过 2 MiB");
    const old = this.records.get(doc.id);
    if (old) {
      if (old.sourceKind !== doc.sourceKind || old.rawImportText !== doc.rawImportText || old.importMode !== doc.importMode) throw new CoursewareError(409, "SOURCE_CONFLICT", "此课件 ID 已用于其他来源");
      return old;
    }
    this.validatePages(doc.id, doc.pages);
    return this.records.create({ ...doc, revision: 0 });
  }
  update(id: string, patch: Pick<CoursewareDocument, "name" | "pages" | "globalReferenceImageId"> & { expectedRevision: number }) {
    const doc = this.require(id);
    this.validatePages(id, patch.pages);
    if (!this.records.update({ ...doc, ...patch }, patch.expectedRevision)) throw new CoursewareError(409, "REVISION_CONFLICT", "课件已被修改，请重新打开后保存");
    return this.require(id);
  }
  detail(id: string) {
    const courseware = this.require(id);
    const links = this.links.list(id);
    const tasks = this.db.prepare("select t.* from tasks t join courseware_task_links l on l.task_id=t.id where l.courseware_id=? order by t.rowid").all(id);
    const images = this.db.prepare("select i.*,coalesce(r.validation_status,'unverified') as validation_status from generated_images i join courseware_task_links l on l.task_id=i.task_id left join image_job_results r on r.image_id=i.id where l.courseware_id=? order by i.rowid").all(id) as CoursewareImage[];
    return { courseware, links, tasks, images };
  }
  selected(id: string, revision: number, pageIds: string[]) {
    const doc = this.require(id);
    if (doc.revision !== revision) throw new CoursewareError(409, "REVISION_CONFLICT", "课件已修改，请先保存再操作");
    if (!pageIds.length || new Set(pageIds).size !== pageIds.length) throw new CoursewareError(400, "EMPTY_SELECTION", "请选择不重复的页面");
    const pages = doc.pages.filter(p => pageIds.includes(p.id));
    if (pages.length !== pageIds.length || pages.some(p => !p.included)) throw new CoursewareError(409, "INVALID_PAGES", "页面不存在或未参与导出");
    this.validatePages(id, pages.map((p, position) => ({ ...p, position })));
    return pages.map(page => {
      const image = page.selectedImageId && this.image(page.selectedImageId);
      if (!image) throw new CoursewareError(409, "MISSING_IMAGE", `第 ${page.position + 1} 页尚未选择定稿图`);
      return { page, image };
    });
  }
  fromHistory(batchId: string) {
    const linked = this.db.prepare("select distinct l.courseware_id as id from courseware_task_links l join tasks t on t.id=l.task_id where t.batch_id=?").all(batchId) as Array<{ id: string }>;
    if (linked.length === 1) return this.detail(linked[0].id);
    if (linked.length > 1) throw new CoursewareError(409, "AMBIGUOUS_COURSEWARE", "该批次关联多个课件，请从课件列表打开");
    const existing = this.records.byBatch(batchId);
    if (existing) return this.detail(existing.id);
    const batch = this.db.prepare("select name from batches where id=?").get(batchId) as { name: string } | undefined;
    if (!batch) throw new CoursewareError(404, "BATCH_NOT_FOUND", "批次不存在");
    const tasks = this.db.prepare("select * from tasks where batch_id=? order by rowid").all(batchId) as Array<Record<string, any>>;
    const taskPages = new Map<string, string>();
    const pages: CoursewarePage[] = [];
    const findPage = (task: Record<string, any>, seen = new Set<string>()): string => {
      if (taskPages.has(task.id)) return taskPages.get(task.id)!;
      if (!seen.has(task.id) && task.parent_image_id) {
        seen.add(task.id);
        const parent = this.image(task.parent_image_id);
        const parentTask = tasks.find(t => t.id === parent?.task_id);
        if (parentTask) { const id = findPage(parentTask, seen); taskPages.set(task.id, id); return id; }
      }
      const id = randomUUID();
      taskPages.set(task.id, id);
      const candidates = this.db.prepare("select id from generated_images where task_id=? order by rowid").all(task.id) as { id: string }[];
      const selected = candidates.find(i => this.image(i.id)?.validation_status !== "invalid");
      pages.push({ id, position: pages.length, sourcePageNumber: "", sourcePageName: "", included: true, selectedImageId: selected?.id ?? null, draft: { prompt: task.prompt, note: task.note ?? "", model: task.model, aspectRatio: task.aspect_ratio ?? task.size, resolution: task.resolution ?? "1K", n: task.n, referenceMode: task.reference_mode, referenceImageId: task.reference_image_id } });
      return id;
    };
    tasks.forEach(t => findPage(t));
    const id = randomUUID();
    this.db.transaction(() => {
      this.records.create({ id, name: batch.name, sourceKind: "history", rawImportText: null, importMode: null, legacyBatchId: batchId, globalReferenceImageId: null, revision: 0, pages });
      tasks.forEach(task => this.links.create({ taskId: task.id, coursewareId: id, pageId: taskPages.get(task.id)!, purpose: task.parent_image_id ? "variation" : "original", textlessRunId: null, sourceImageId: task.parent_image_id }));
    })();
    return this.detail(id);
  }
}

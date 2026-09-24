import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { createCoursewaresRepository } from "../db/repositories/coursewares-repository.js";
import { createCoursewareTaskLinksRepository } from "../db/repositories/courseware-task-links-repository.js";
import type { CoursewareDocument, CoursewarePage } from "./courseware-types.js";

export class CoursewareError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}
type ImageFields = { id: string; filename: string; local_path: string; mime_type: string; validation_status: string; created_at: string };
export type CoursewareImage = ImageFields & ({ source: "generated"; task_id: string; batch_id: string } | { source: "upload"; task_id: null; batch_id: null; courseware_id: string; page_id: string; width: number; height: number });
const uploadedImageQuery = "select u.id,'upload' as source,null as task_id,null as batch_id,u.courseware_id,u.page_id,r.filename,r.local_path,r.mime_type,u.width,u.height,'valid' as validation_status,u.created_at from courseware_uploaded_images u join reference_images r on r.id=u.reference_image_id";

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
    return (this.db.prepare("select i.*,'generated' as source,coalesce(r.validation_status,'unverified') as validation_status from generated_images i left join image_job_results r on r.image_id=i.id where i.id=?").get(id)
      ?? this.db.prepare(`${uploadedImageQuery} where u.id=?`).get(id)) as CoursewareImage | undefined;
  }
  imageOwner(image: CoursewareImage) {
    return image.source === "upload"
      ? { coursewareId: image.courseware_id, pageId: image.page_id, purpose: "original" as const, textlessRunId: null, sourceImageId: null }
      : this.links.get(image.task_id);
  }
  validatePages(id: string, pages: CoursewarePage[]) {
    if (pages.length > this.maxPages) throw new CoursewareError(413, "TOO_MANY_PAGES", `最多保存 ${this.maxPages} 页`);
    if (new Set(pages.map(p => p.id)).size !== pages.length || pages.some((p, index) => p.position !== index)) throw new CoursewareError(400, "INVALID_PAGE_ORDER", "页面 ID 必须唯一，顺序必须连续");
    for (const page of pages) {
      if (!page.selectedImageId) continue;
      const image = this.image(page.selectedImageId);
      const link = image && this.imageOwner(image);
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
    const images = [
      ...this.db.prepare("select i.*,'generated' as source,coalesce(r.validation_status,'unverified') as validation_status from generated_images i join courseware_task_links l on l.task_id=i.task_id left join image_job_results r on r.image_id=i.id where l.courseware_id=? order by i.rowid").all(id),
      ...this.db.prepare(`${uploadedImageQuery} where u.courseware_id=? order by u.rowid`).all(id)
    ] as CoursewareImage[];
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
  fromEditor(doc: CoursewareDocument, roots: Array<{ pageId: string; taskId: string }>) {
    if (doc.sourceKind !== "legacy-session" || !roots.length || doc.pages.some(page => page.selectedImageId)) throw new CoursewareError(400, "INVALID_EDITOR", "旧会话保存参数无效");
    const existing = this.records.get(doc.id);
    if (existing) {
      const links = this.links.list(doc.id);
      if (existing.sourceKind !== "legacy-session" || roots.some(root => !links.some(link => link.pageId === root.pageId && link.taskId === root.taskId && link.purpose === "original"))) throw new CoursewareError(409, "SOURCE_CONFLICT", "此项目 ID 已用于其他内容");
      return this.detail(doc.id);
    }
    if (new Set(roots.map(root => root.pageId)).size !== roots.length || new Set(roots.map(root => root.taskId)).size !== roots.length || roots.some(root => !doc.pages.some(page => page.id === root.pageId))) throw new CoursewareError(400, "INVALID_EDITOR", "页面和任务对应关系无效");
    this.db.transaction(() => {
      const links = new Map<string, { pageId: string; purpose: "original" | "variation"; sourceImageId: string | null }>();
      const descendants = this.db.prepare(`with recursive tree(id,parent_image_id) as (
        select id,parent_image_id from tasks where id=?
        union
        select child.id,child.parent_image_id from tasks child join generated_images source on source.id=child.parent_image_id join tree parent on source.task_id=parent.id
      ) select id,parent_image_id from tree`);
      for (const root of roots) {
        const task = this.db.prepare("select id,parent_image_id from tasks where id=?").get(root.taskId) as { id: string; parent_image_id: string | null } | undefined;
        if (!task || task.parent_image_id) throw new CoursewareError(409, "INVALID_EDITOR", "原图任务已不存在或不是根任务");
        for (const item of descendants.all(root.taskId) as Array<{ id: string; parent_image_id: string | null }>) {
          if (links.has(item.id)) throw new CoursewareError(409, "AMBIGUOUS_EDITOR", "同一任务关联了多个页面，请检查历史记录");
          if (this.links.get(item.id)) throw new CoursewareError(409, "TASK_OWNED", "部分图片已属于其他项目，请从历史项目打开对应内容");
          links.set(item.id, { pageId: root.pageId, purpose: item.id === root.taskId ? "original" : "variation", sourceImageId: item.parent_image_id });
        }
      }
      this.create(doc);
      for (const [taskId, link] of links) this.links.create({ taskId, coursewareId: doc.id, pageId: link.pageId, purpose: link.purpose, textlessRunId: null, sourceImageId: link.sourceImageId });
    })();
    return this.detail(doc.id);
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

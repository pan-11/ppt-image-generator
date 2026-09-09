import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { createTextlessRunsRepository } from "../db/repositories/textless-runs-repository.js";
import type { TaskDraftInput } from "../db/repositories/tasks-repository.js";
import { CoursewareError, CoursewareService, type CoursewareImage } from "./courseware-service.js";
import type { ReferenceImageService } from "./reference-image-service.js";
import type { TextlessRun } from "./courseware-types.js";
import { TEXTLESS_PROMPT } from "../lib/textless-prompt.js";
import { preparePptxImage } from "../lib/pptx-image.js";
import { createImagePptx } from "../lib/pptx-service.js";

export class TextlessService {
  readonly runs;
  constructor(
    private db: Database.Database,
    private coursewares: CoursewareService,
    private references: ReferenceImageService,
    private createBatch: (input: { name: string; tasks: TaskDraftInput[] }, beforeEnqueue: (tasks: Array<{ id: string }>) => void) => unknown,
    private validateTask: (task: TaskDraftInput, image: CoursewareImage) => TaskDraftInput
  ) {
    this.runs = createTextlessRunsRepository(db);
  }
  detail(id: string) {
    const run = this.runs.get(id);
    if (!run) throw new CoursewareError(404, "RUN_NOT_FOUND", "去字记录不存在");
    const pages = run.manifest.map(page => {
      const task = this.db.prepare("select status,error_message from tasks where id=?").get(page.taskId) as { status: string; error_message: string | null } | undefined;
      const image = this.db.prepare("select i.id from generated_images i join image_job_results r on r.image_id=i.id join generation_jobs j on j.id=r.job_id where i.task_id=? and r.validation_status='valid' and j.status='completed' order by r.attempt_number desc,i.rowid desc limit 1").get(page.taskId) as { id: string } | undefined;
      return { ...page, status: task?.status ?? "missing", errorMessage: task?.error_message ?? null, imageId: image?.id ?? null };
    });
    const tasks = pages.map(p => this.db.prepare("select * from tasks where id=?").get(p.taskId)).filter(Boolean);
    const images = pages.flatMap(p => p.imageId ? [this.coursewares.image(p.imageId)!] : []);
    return { run, pages, tasks, images };
  }
  async create(coursewareId: string, input: { requestId: string; expectedRevision: number; pageIds: string[]; model: string; regenerate: boolean }) {
    const existing = this.runs.find(coursewareId, input.requestId);
    if (existing) return this.detail(existing.id);
    const selected = this.coursewares.selected(coursewareId, input.expectedRevision, input.pageIds);
    for (const { page, image } of selected) await preparePptxImage(image.local_path, `第 ${page.position + 1} 页`);
    // Decode is asynchronous: recheck the revision and idempotency key before writing anything.
    const repeated = this.runs.find(coursewareId, input.requestId);
    if (repeated) return this.detail(repeated.id);
    this.coursewares.selected(coursewareId, input.expectedRevision, input.pageIds);
    const run: TextlessRun = { id: randomUUID(), coursewareId, requestId: input.requestId, sourceRevision: input.expectedRevision, promptText: TEXTLESS_PROMPT, model: input.model, manifest: [] };
    const drafts = selected.map(({ page, image }) => {
      const sourceTask = this.db.prepare("select aspect_ratio,resolution,size from tasks where id=?").get(image.task_id) as { aspect_ratio: string | null; resolution: string | null; size: string };
      return { prompt: TEXTLESS_PROMPT, note: page.draft.note, model: input.model, aspectRatio: sourceTask.aspect_ratio ?? page.draft.aspectRatio, resolution: sourceTask.resolution ?? page.draft.resolution, size: sourceTask.size, n: 1, referenceMode: "row", referenceImageId: null as string | null, parentImageId: image.id };
    });

    const previous = this.runs.list(coursewareId).filter(r => r.model === input.model && r.promptText === TEXTLESS_PROMPT);
    const reused = selected.map(({ page, image }, index) => {
      for (const old of previous) {
        const candidate = old.manifest.find(p => p.pageId === page.id && p.sourceImageId === image.id && p.aspectRatio === drafts[index].aspectRatio && p.resolution === drafts[index].resolution);
        if (!candidate) continue;
        const result = this.detail(old.id).pages.find(p => p.taskId === candidate.taskId)!;
        const unknown = this.db.prepare("select id from generation_jobs where task_id=? and status='unknown' limit 1").get(candidate.taskId);
        if (unknown && input.regenerate) throw new CoursewareError(409, "UNKNOWN_CHARGE_RISK", "该页面提交状态未知，请使用重试操作确认费用风险后再生成");
        // An explicit regeneration never submits the same source twice while work is in flight.
        if (["queued", "running"].includes(result.status) || (!input.regenerate && result.imageId)) return candidate.taskId;
        // Failed/unknown jobs must go through the existing retry flow, including its charge warning.
        if (!input.regenerate && result.status === "failed") return candidate.taskId;
      }
      return null;
    });
    const pending = selected.map((_, index) => index).filter(index => !reused[index]);
    try { pending.forEach(index => this.validateTask(drafts[index], selected[index].image)); }
    catch (error) { throw new CoursewareError(422, "UNSUPPORTED_GENERATION", error instanceof Error ? error.message : "当前中转站不支持去字规格"); }
    // Capability checks cover every new page before reference files or task records are created.
    pending.forEach(index => {
      const image = selected[index].image;
      drafts[index].referenceImageId = this.references.createFromGeneratedImage({ filename: image.filename, localPath: image.local_path, mimeType: image.mime_type }).id;
    });
    const saveRun = (tasks: Array<{ id: string }>) => {
      const taskIds = selected.map((_, index) => reused[index] ?? tasks[pending.indexOf(index)].id);
      run.manifest = selected.map(({ page, image }, index) => ({ pageId: page.id, position: page.position, pageLabel: [page.sourcePageNumber, page.sourcePageName].filter(Boolean).join(" · ") || `第 ${page.position + 1} 页`, sourceImageId: image.id, taskId: taskIds[index], aspectRatio: drafts[index].aspectRatio, resolution: drafts[index].resolution }));
      this.runs.create(run);
      tasks.forEach((task, index) => this.coursewares.links.create({ taskId: task.id, coursewareId, pageId: selected[pending[index]].page.id, purpose: "textless", textlessRunId: run.id, sourceImageId: selected[pending[index]].image.id }));
    };
    if (pending.length) this.createBatch({ name: `${this.coursewares.require(coursewareId).name} · 无文字`, tasks: pending.map(index => drafts[index]) }, saveRun);
    else this.db.transaction(() => saveRun([]))();
    return this.detail(run.id);
  }
  async export(id: string, variant: "final" | "textless") {
    const detail = this.detail(id);
    const images = detail.pages.map(page => {
      const imageId = variant === "final" ? page.sourceImageId : page.imageId;
      const image = imageId && this.coursewares.image(imageId);
      if (!image || image.validation_status === "invalid") throw new CoursewareError(409, "MISSING_IMAGE", `${page.pageLabel} 尚无可用${variant === "final" ? "定稿" : "无文字"}图片`);
      if (variant === "textless") {
        const source = this.coursewares.image(page.sourceImageId);
        if (!source) throw new CoursewareError(409, "MISSING_IMAGE", `${page.pageLabel} 源图已不存在`);
        return { path: image.local_path, label: page.pageLabel, sourcePath: source.local_path };
      }
      return { path: image.local_path, label: page.pageLabel };
    });
    return createImagePptx(images);
  }
}

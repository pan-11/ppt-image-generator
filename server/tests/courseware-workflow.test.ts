import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import JSZip from "jszip";
import { createDatabase } from "../src/db/database.js";
import { CoursewareService } from "../src/services/courseware-service.js";
import type { CoursewareDocument } from "../src/services/courseware-types.js";
import { BatchService } from "../src/services/batch-service.js";
import { createGeneratedImagesRepository } from "../src/db/repositories/generated-images-repository.js";
import { createImagePptx } from "../src/lib/pptx-service.js";
import { TEXTLESS_PROMPT } from "../src/lib/textless-prompt.js";
import { buildApp } from "../src/app.js";
import { ProviderAdapterRegistry } from "../src/providers/provider-adapter-registry.js";
import type { ProviderAdapter } from "../src/providers/provider-adapter.js";

const draft = { prompt: "原始提示词", note: "P1", model: "gpt-image-1", aspectRatio: "1:1", resolution: "standard", n: 1, referenceMode: "none" as const, referenceImageId: null };
function document(id = "courseware"): CoursewareDocument {
  return { id, name: "课件", sourceKind: "import", rawImportText: "总标题\r\n\r\n  完整原文  ", importMode: "structured", legacyBatchId: null, globalReferenceImageId: null, revision: 0, pages: [{ id: "page-1", position: 0, sourcePageNumber: "P1", sourcePageName: "封面", draft, included: true, selectedImageId: null }] };
}
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "courseware-tests-"));
  const service = new BatchService({ envOverrides: { APP_DATA_DIR: dir, TOAPIS_API_KEY: "test-key" }, backgroundProcessing: false });
  const db = createDatabase(join(dir, "app.sqlite"));
  const courses = service.getCoursewareService();
  courses.create(document());
  const created = service.createBatch({ name: "original", coursewareId: "courseware", tasks: [{ ...draft, size: "1024x1024", pageId: "page-1" }] });
  const path = join(dir, "source.png");
  writeFileSync(path, await sharp({ create: { width: 32, height: 32, channels: 3, background: "red" } }).png().toBuffer());
  const image = createGeneratedImagesRepository(db).create({ batchId: created.batch.id, taskId: created.tasks[0].id, filename: "source.png", localPath: path, mimeType: "image/png" });
  const doc = courses.require("courseware");
  courses.update(doc.id, { expectedRevision: 0, name: doc.name, pages: doc.pages.map(p => ({ ...p, selectedImageId: image.id })), globalReferenceImageId: null });
  return { dir, service, db, courses, created, image, close: async () => { db.close(); await service.close(); } };
}

describe("courseware persistence and routes", () => {
  it("preserves raw CRLF text after reopening and edits, rejects stale revisions and changed source", () => {
    const path = join(mkdtempSync(join(tmpdir(), "courseware-persistence-")), "test.sqlite");
    let db = createDatabase(path);
    let service = new CoursewareService(db, 100);
    const original = document();
    service.create(original);
    db.close();
    db = createDatabase(path);
    service = new CoursewareService(db, 100);
    expect(service.require(original.id).rawImportText).toBe(original.rawImportText);
    service.update(original.id, { expectedRevision: 0, name: "改名", globalReferenceImageId: null, pages: original.pages.map(p => ({ ...p, draft: { ...p.draft, prompt: "新提示词" } })) });
    expect(service.require(original.id).rawImportText).toBe(original.rawImportText);
    expect(service.create(original).revision).toBe(1);
    expect(() => service.create({ ...original, rawImportText: "不同来源" })).toThrow("其他来源");
    expect(() => service.update(original.id, { ...original, expectedRevision: 0 })).toThrow("已被修改");
    db.close();
  });
  it("validates route requests and does not enqueue generation when saving", async () => {
    const dir = mkdtempSync(join(tmpdir(), "courseware-routes-"));
    const app = await buildApp({ envOverrides: { APP_DATA_DIR: dir, TOAPIS_API_KEY: "test-key" }, backgroundProcessing: false });
    try {
      const response = await app.inject({ method: "PUT", url: "/api/coursewares/courseware", payload: document() });
      expect(response.statusCode).toBe(200);
      expect(response.json().rawImportText).toBe(document().rawImportText);
      const bad = await app.inject({ method: "PATCH", url: "/api/coursewares/courseware", payload: { ...document(), expectedRevision: 0 } });
      expect(bad.statusCode).toBe(400);
      const huge = await app.inject({ method: "PUT", url: "/api/coursewares/huge", payload: { ...document(), rawImportText: "x".repeat(2 * 1024 * 1024 + 1) } });
      expect(huge.statusCode).toBe(413);
      const db = createDatabase(join(dir, "app.sqlite"));
      expect(db.prepare("select count(*) as count from generation_jobs").get()).toEqual({ count: 0 });
      db.close();
    } finally { await app.close(); }
  });
  it("keeps child candidates on the same page and rejects another page's image", async () => {
    const f = await fixture();
    try {
      const child = f.service.createChildTasksFromImage({ parentImageId: f.image.id, tasks: [{ ...draft, size: "1024x1024" }] });
      expect(f.courses.links.get((child.tasks[0] as { id: string }).id)).toMatchObject({ pageId: "page-1", purpose: "variation", sourceImageId: f.image.id });
      expect(f.courses.require("courseware").pages[0].selectedImageId).toBe(f.image.id);
      expect(f.courses.fromHistory(f.created.batch.id).courseware.id).toBe("courseware");
      expect(() => f.courses.create({ ...document("other"), pages: document().pages.map(p => ({ ...p, selectedImageId: f.image.id })) })).toThrow("不属于本页");
      const before = f.db.prepare("select count(*) as n from tasks").get();
      expect(() => f.service.createBatch({ name: "bad", coursewareId: "courseware", tasks: [{ ...draft, size: "1024x1024", pageId: "wrong" }] })).toThrow("不属于");
      expect(f.db.prepare("select count(*) as n from tasks").get()).toEqual(before);
    } finally { await f.close(); }
  });
  it("adopts a legacy batch only once without inventing original imported text", async () => {
    const f = await fixture();
    try {
      const batch = f.service.createBatch({ name: "legacy", tasks: [{ ...draft, size: "1024x1024" }] });
      const a = f.courses.fromHistory(batch.batch.id);
      const b = f.courses.fromHistory(batch.batch.id);
      expect(a.courseware.id).toBe(b.courseware.id);
      expect(a.courseware.rawImportText).toBeNull();
    } finally { await f.close(); }
  });
});

describe("textless snapshots", () => {
  it.each(["submitting", "downloading"])("repairs an interrupted %s job from its current local result without remote calls", async status => {
    const f = await fixture();
    const run = await f.service.getTextlessService().create("courseware", { requestId: "local-recovery", expectedRevision: 1, pageIds: ["page-1"], model: "gpt-image-1", regenerate: false });
    const task = run.tasks[0] as { id: string; batch_id: string };
    const job = f.db.prepare("select id from generation_jobs where task_id=?").get(task.id) as { id: string };
    const image = createGeneratedImagesRepository(f.db).create({ batchId: task.batch_id, taskId: task.id, filename: "saved.png", localPath: join(f.dir, "source.png"), mimeType: "image/png" });
    f.db.prepare("update generation_jobs set status=?,attempt_count=1,provider_id='missing-provider',provider_revision='old',remote_result_url=? where id=?").run(status, status === "downloading" ? "https://unused.invalid/result.png" : null, job.id);
    f.db.prepare("insert into image_job_results (image_id,job_id,attempt_number,validation_status,actual_width,actual_height,created_at) values (?,?,1,'valid',32,32,'now')").run(image.id, job.id);
    await f.service.close();
    const generate = vi.fn(async () => { throw new Error("Must use saved local result"); });
    const recover = vi.fn(async () => { throw new Error("Must use saved local result"); });
    const adapter: ProviderAdapter = { protocolType: "toapis-async", capabilities: () => [], resolveRequest: () => ({ requestSize: "1024x1024" }), generate, recover };
    const resumed = new BatchService({ envOverrides: { APP_DATA_DIR: f.dir, TOAPIS_API_KEY: "test-key" }, adapterRegistry: new ProviderAdapterRegistry([adapter]), backgroundProcessing: true });
    try {
      expect(resumed.getTextlessService().detail(run.run.id).pages[0]).toMatchObject({ status: "completed", imageId: image.id });
      expect(f.db.prepare("select status,attempt_count from generation_jobs where id=?").get(job.id)).toEqual({ status: "completed", attempt_count: 1 });
      expect(f.db.prepare("select status,success_count from batches where id=?").get(task.batch_id)).toEqual({ status: "completed", success_count: 1 });
      expect(generate).not.toHaveBeenCalled();
      expect(recover).not.toHaveBeenCalled();
    } finally { f.db.close(); await resumed.close(); }
  });
  it("runs a queued textless job through the shared adapter and records a valid independently exportable image", async () => {
    const f = await fixture();
    const run = await f.service.getTextlessService().create("courseware", { requestId: "mock-completion", expectedRevision: 1, pageIds: ["page-1"], model: "gpt-image-1", regenerate: false });
    await f.service.close();
    const buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: "blue" } }).png().toBuffer();
    const generate = vi.fn(async () => ({ buffer, mimeType: "image/png" }));
    const adapter: ProviderAdapter = {
      protocolType: "toapis-async",
      capabilities: () => [{ value: "gpt-image-1", label: "Mock", aspectRatios: ["1:1"], resolutions: ["standard"], maxN: 1, supportsReferenceImages: true }],
      resolveRequest: () => ({ requestSize: "1024x1024" }), generate,
      recover: async () => { throw new Error("No recovery expected"); }
    };
    const resumed = new BatchService({ envOverrides: { APP_DATA_DIR: f.dir, TOAPIS_API_KEY: "test-key" }, adapterRegistry: new ProviderAdapterRegistry([adapter]), backgroundProcessing: true });
    try {
      await expect.poll(() => resumed.getTextlessService().detail(run.run.id).pages[0].status).toBe("completed");
      expect(generate).toHaveBeenCalledOnce();
      const request = (generate.mock.calls[0] as unknown[])[1] as { prompt: string; references: unknown[] };
      expect(request.prompt).toBe(TEXTLESS_PROMPT);
      expect(request.references).toHaveLength(1);
      expect(f.db.prepare("select validation_status from image_job_results").all()).toEqual([{ validation_status: "valid" }]);
      expect((await resumed.getTextlessService().export(run.run.id, "textless")).length).toBeGreaterThan(1000);
      const repeated = await resumed.getTextlessService().create("courseware", { requestId: "reuse-completion", expectedRevision: 1, pageIds: ["page-1"], model: "gpt-image-1", regenerate: false });
      expect(repeated.run.manifest[0].taskId).toBe(run.run.manifest[0].taskId);
      expect(generate).toHaveBeenCalledOnce();
    } finally { f.db.close(); await resumed.close(); }
  });
  it("uses exactly the textless prompt and one selected source, deduplicates requests and freezes source after edits", async () => {
    const f = await fixture();
    try {
      const service = f.service.getTextlessService();
      const input = { requestId: "click-1", expectedRevision: 1, pageIds: ["page-1"], model: "gpt-image-1", regenerate: false };
      const run = await service.create("courseware", input);
      expect(run.tasks[0]).toMatchObject({ prompt: TEXTLESS_PROMPT, parent_image_id: f.image.id, n: 1 });
      expect(run.run.manifest[0].sourceImageId).toBe(f.image.id);
      expect((await service.create("courseware", input)).run.id).toBe(run.run.id);
      const duplicate = await service.create("courseware", { ...input, requestId: "click-2", regenerate: true });
      expect(duplicate.run.manifest[0].taskId).toBe(run.run.manifest[0].taskId);
      expect((await service.create("courseware", { ...input, requestId: "click-2" })).run.id).toBe(duplicate.run.id);
      const doc = f.courses.require("courseware");
      f.courses.update(doc.id, { ...doc, expectedRevision: 1, pages: doc.pages.map(p => ({ ...p, selectedImageId: null })) });
      expect(service.detail(run.run.id).run.manifest[0].sourceImageId).toBe(f.image.id);
      expect((await service.export(run.run.id, "final")).length).toBeGreaterThan(1000);
      await expect(service.export(run.run.id, "textless")).rejects.toThrow("尚无可用");
    } finally { await f.close(); }
  });
  it("marks interrupted submission without remote handle unknown on restart without any generation", async () => {
    const f = await fixture();
    const run = await f.service.getTextlessService().create("courseware", { requestId: "restart", expectedRevision: 1, pageIds: ["page-1"], model: "gpt-image-1", regenerate: false });
    f.db.prepare("update generation_jobs set status='submitting' where task_id=?").run(run.run.manifest[0].taskId);
    await f.service.close();
    const resumed = new BatchService({ envOverrides: { APP_DATA_DIR: f.dir, TOAPIS_API_KEY: "test-key" }, backgroundProcessing: true });
    try {
      expect(f.db.prepare("select status from generation_jobs where task_id=?").get(run.run.manifest[0].taskId)).toEqual({ status: "unknown" });
      expect(resumed.getTextlessService().detail(run.run.id).pages[0].status).toBe("failed");
    } finally { f.db.close(); await resumed.close(); }
  });
  it("preflights unsupported models before creating any reference or job", async () => {
    const f = await fixture();
    try {
      await expect(f.service.getTextlessService().create("courseware", { requestId: "bad-model", expectedRevision: 1, pageIds: ["page-1"], model: "unsupported", regenerate: false })).rejects.toThrow("不支持模型");
      expect(f.db.prepare("select count(*) as n from reference_images").get()).toEqual({ n: 0 });
      expect(f.db.prepare("select count(*) as n from textless_runs").get()).toEqual({ n: 0 });
    } finally { await f.close(); }
  });
  it("reuses a completed page when the next run selects only a subset of the previous run", async () => {
    const f = await fixture();
    try {
      const old = f.courses.require("courseware");
      const second = { ...old.pages[0], id: "page-2", position: 1, selectedImageId: null };
      f.courses.update(old.id, { ...old, expectedRevision: 1, pages: [...old.pages, second] });
      const batch = f.service.createBatch({ name: "second", coursewareId: old.id, tasks: [{ ...draft, size: "1024x1024", pageId: "page-2" }] });
      const image = createGeneratedImagesRepository(f.db).create({ batchId: batch.batch.id, taskId: batch.tasks[0].id, filename: "source.png", localPath: join(f.dir, "source.png"), mimeType: "image/png" });
      const doc = f.courses.require(old.id);
      f.courses.update(doc.id, { ...doc, expectedRevision: 2, pages: doc.pages.map(p => p.id === "page-2" ? { ...p, selectedImageId: image.id } : p) });
      const textless = f.service.getTextlessService();
      const run = await textless.create(doc.id, { requestId: "both", expectedRevision: 3, pageIds: ["page-2", "page-1"], model: "gpt-image-1", regenerate: false });
      expect(run.run.manifest.map(p => p.pageId)).toEqual(["page-1", "page-2"]);
      for (const manifest of run.run.manifest) {
        const task = f.db.prepare("select batch_id from tasks where id=?").get(manifest.taskId) as { batch_id: string };
        const result = createGeneratedImagesRepository(f.db).create({ batchId: task.batch_id, taskId: manifest.taskId, filename: "result.png", localPath: join(f.dir, "source.png"), mimeType: "image/png" });
        const job = f.db.prepare("select id from generation_jobs where task_id=?").get(manifest.taskId) as { id: string };
        f.db.prepare("update tasks set status='completed' where id=?").run(manifest.taskId);
        f.db.prepare("update generation_jobs set status='completed' where id=?").run(job.id);
        f.db.prepare("insert into image_job_results (image_id,job_id,attempt_number,validation_status,created_at) values (?,?,1,'valid','now')").run(result.id, job.id);
      }
      const before = f.db.prepare("select count(*) as n from generation_jobs").get();
      const subset = await textless.create(doc.id, { requestId: "subset", expectedRevision: 3, pageIds: ["page-2"], model: "gpt-image-1", regenerate: false });
      expect(subset.run.manifest[0].taskId).toBe(run.run.manifest[1].taskId);
      expect(f.db.prepare("select count(*) as n from generation_jobs").get()).toEqual(before);
    } finally { await f.close(); }
  });
  it("rejects a wrong-ratio textless image even for a one-page PPT", async () => {
    const f = await fixture();
    try {
      const run = await f.service.getTextlessService().create("courseware", { requestId: "bad-ratio", expectedRevision: 1, pageIds: ["page-1"], model: "gpt-image-1", regenerate: false });
      const task = run.tasks[0] as { id: string; batch_id: string };
      const path = join(f.dir, "wrong-ratio.png");
      writeFileSync(path, await sharp({ create: { width: 160, height: 90, channels: 3, background: "green" } }).png().toBuffer());
      const image = createGeneratedImagesRepository(f.db).create({ batchId: task.batch_id, taskId: task.id, filename: "wrong-ratio.png", localPath: path, mimeType: "image/png" });
      const job = f.db.prepare("select id from generation_jobs where task_id=?").get(task.id) as { id: string };
      f.db.prepare("update generation_jobs set status='completed' where id=?").run(job.id);
      f.db.prepare("insert into image_job_results (image_id,job_id,attempt_number,validation_status,created_at) values (?,?,1,'valid','now')").run(image.id, job.id);
      await expect(f.service.getTextlessService().export(run.run.id, "textless")).rejects.toThrow("与源图比例不同");
    } finally { await f.close(); }
  });
  it("fails recorded provider revision recovery without falling back to a new generation", async () => {
    const f = await fixture();
    const run = await f.service.getTextlessService().create("courseware", { requestId: "revision", expectedRevision: 1, pageIds: ["page-1"], model: "gpt-image-1", regenerate: false });
    const taskId = run.run.manifest[0].taskId;
    f.db.prepare("update generation_jobs set status='remote_queued',provider_id='missing-provider',provider_revision='old',remote_task_id='already-paid' where task_id=?").run(taskId);
    await f.service.close();
    const resumed = new BatchService({ envOverrides: { APP_DATA_DIR: f.dir, TOAPIS_API_KEY: "test-key" }, backgroundProcessing: true });
    try {
      expect(f.db.prepare("select status,remote_task_id,attempt_count from generation_jobs where task_id=?").get(taskId)).toEqual({ status: "failed", remote_task_id: "already-paid", attempt_count: 0 });
      expect(resumed.getTextlessService().detail(run.run.id).pages[0].errorMessage).toContain("无法安全恢复");
    } finally { f.db.close(); await resumed.close(); }
  });
});

describe("ordered fullbleed PPTX", () => {
  it("embeds each source once in order at the slide origin and full slide dimensions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pptx-tests-"));
    const a = join(dir, "a.png"); const b = join(dir, "b.png");
    writeFileSync(a, await sharp({ create: { width: 160, height: 90, channels: 3, background: "red" } }).png().toBuffer());
    writeFileSync(b, await sharp({ create: { width: 160, height: 90, channels: 3, background: "blue" } }).png().toBuffer());
    const zip = await JSZip.loadAsync(await createImagePptx([{ path: a, label: "1" }, { path: b, label: "2" }]));
    const slides = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p));
    expect(slides).toHaveLength(2);
    const first = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(first.match(/<p:pic>/g)).toHaveLength(1);
    expect(first).toContain('<a:off x="0" y="0"/>');
    const presentation = await zip.file("ppt/presentation.xml")!.async("string");
    const size = presentation.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/)!;
    expect(first).toContain(`<a:ext cx="${size[1]}" cy="${size[2]}"/>`);
    const media = Object.keys(zip.files).filter(p => /^ppt\/media\/image.*\.png$/.test(p));
    expect(media).toHaveLength(2);
  });
  it("rejects mixed aspect ratios and corrupt images instead of silently stretching or exporting", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pptx-invalid-"));
    const a = join(dir, "wide.png"); const b = join(dir, "square.png"); const bad = join(dir, "bad.png");
    writeFileSync(a, await sharp({ create: { width: 160, height: 90, channels: 3, background: "red" } }).png().toBuffer());
    writeFileSync(b, await sharp({ create: { width: 90, height: 90, channels: 3, background: "blue" } }).png().toBuffer());
    writeFileSync(bad, "broken");
    await expect(createImagePptx([{ path: a, label: "1" }, { path: b, label: "2" }])).rejects.toThrow("比例不同");
    await expect(createImagePptx([{ path: bad, label: "3" }])).rejects.toThrow("无法完整解码");
  });
});

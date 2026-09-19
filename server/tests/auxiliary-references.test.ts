import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { BatchService } from "../src/services/batch-service.js";
import { createDatabase } from "../src/db/database.js";
import { ProviderAdapterRegistry } from "../src/providers/provider-adapter-registry.js";
import type { AdapterGenerationRequest, ProviderAdapter } from "../src/providers/provider-adapter.js";

const draft = { prompt: "只改变角色", note: "", model: "gpt-image-1", aspectRatio: "1:1", resolution: "standard", size: "1024x1024", n: 1, referenceMode: "none" as const, referenceImageId: null };
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "auxiliary-references-"));
  const buffer = await sharp({ create: { width: 128, height: 128, channels: 3, background: "red" } }).png().toBuffer();
  const auxiliary = await sharp(buffer).tint("blue").png().toBuffer();
  const generate = vi.fn(async () => ({ buffer, mimeType: "image/png" }));
  const recover = vi.fn(async () => ({ buffer, mimeType: "image/png" }));
  const adapter: ProviderAdapter = { protocolType: "toapis-async", capabilities: () => [{ value: "gpt-image-1", label: "Mock", aspectRatios: ["1:1"], resolutions: ["standard"], maxN: 3, supportsReferenceImages: true }], resolveRequest: () => ({ requestSize: "128x128" }), generate, recover };
  const options = { envOverrides: { APP_DATA_DIR: dir, TOAPIS_API_KEY: "fixture-key" }, backgroundProcessing: false, adapterRegistry: new ProviderAdapterRegistry([adapter]) };
  const service = new BatchService(options);
  const db = createDatabase(join(dir, "app.sqlite"));
  service.getCoursewareService().create({ id: "courseware", name: "课件", sourceKind: "manual", rawImportText: null, importMode: null, legacyBatchId: null, globalReferenceImageId: null, revision: 0, pages: [{ id: "page-1", position: 0, sourcePageNumber: "", sourcePageName: "", draft, included: true, selectedImageId: null }] });
  const detail = await service.getCoursewareImageService().upload("courseware", "page-1", { filename: "original.png", mimeType: "image/png", buffer, uploadId: randomUUID(), expectedRevision: 0 });
  const reference = service.createReferenceImage({ filename: "auxiliary.png", mimeType: "image/png", buffer: auxiliary });
  return { service, db, buffer, auxiliary, reference, image: detail.images[0], options, generate, recover, close: async () => { db.close(); await service.close(); } };
}

describe("ordered auxiliary image inputs", () => {
  it("creates a real new batch from an upload, persists both inputs and keeps independent child drafts", async () => {
    const f = await fixture();
    try {
      const children = f.service.createChildTasksFromImage({ parentImageId: f.image.id, tasks: [{ ...draft, auxiliaryReferenceImageId: f.reference.id }, draft] });
      expect(children.tasks).toHaveLength(2);
      expect(children.tasks[0]).toMatchObject({ parent_image_id: f.image.id, auxiliary_reference_image_id: f.reference.id });
      expect(children.tasks[1].auxiliary_reference_image_id).toBeNull();
      expect(f.db.prepare("select count(*) as n from batches").get()).toEqual({ n: 1 });
      for (const task of children.tasks) expect(f.service.getCoursewareService().links.get(task.id)).toMatchObject({ coursewareId: "courseware", pageId: "page-1", purpose: "variation", sourceImageId: f.image.id });
      const internal = f.service as any;
      for (const job of children.jobs) await internal.runGenerationJob(job.id);
      const requests = f.generate.mock.calls.map(call => (call as unknown[])[1] as AdapterGenerationRequest);
      expect(requests[0].references.map(r => r.buffer)).toEqual([f.buffer, f.auxiliary]);
      expect(requests[1].references.map(r => r.buffer)).toEqual([f.buffer]);
      expect(f.service.getCoursewareService().require("courseware").pages[0].selectedImageId).toBe(f.image.id);
      const generated = f.service.getCoursewareService().detail("courseware").images.find(image => image.source === "generated")!;
      const next = f.service.createChildTasksFromImage({ parentImageId: generated.id, tasks: [{ ...draft, auxiliaryReferenceImageId: f.reference.id }] });
      expect(next.tasks[0].batch_id).toBe(children.tasks[0].batch_id);
      await internal.runGenerationJob(next.jobs[0].id);
      const nextRequest = (f.generate.mock.calls[2] as unknown[])[1] as AdapterGenerationRequest;
      expect(nextRequest.references.map(r => r.buffer)).toEqual([f.buffer, f.auxiliary]);
    } finally { await f.close(); }
  });
  it("keeps both inputs across restart and failed-only recovery despite changed page/global settings", async () => {
    const f = await fixture();
    const children = f.service.createChildTasksFromImage({ parentImageId: f.image.id, tasks: [{ ...draft, n: 2, auxiliaryReferenceImageId: f.reference.id }] });
    await (f.service as any).runGenerationJob(children.jobs[0].id);
    const provider = f.service.getProviderSettingsService().getRoleProvider("image");
    f.db.prepare("update generation_jobs set status='failed',provider_id=?,provider_revision=?,protocol_type=?,remote_task_id='remote-paid',error_stage='polling' where id=?").run(provider.id, provider.configRevision, provider.protocolType, children.jobs[1].id);
    const doc = f.service.getCoursewareService().require("courseware");
    f.service.getCoursewareService().update(doc.id, { ...doc, globalReferenceImageId: "different-global", expectedRevision: doc.revision, pages: doc.pages.map(p => ({ ...p, draft: { ...p.draft, referenceImageId: "different-row", referenceMode: "row" } })) });
    await f.service.close();
    const resumed = new BatchService(f.options);
    try {
      expect(resumed.retryTasks([children.tasks[0].id])).toEqual({ retriedJobs: 1, affectedTasks: 1 });
      await (resumed as any).runGenerationJob(children.jobs[1].id);
      expect(f.generate).toHaveBeenCalledOnce();
      expect(f.recover).toHaveBeenCalledOnce();
      const request = (f.recover.mock.calls[0] as unknown[])[1] as AdapterGenerationRequest;
      expect(request.references.map(r => r.buffer)).toEqual([f.buffer, f.auxiliary]);
      expect(f.db.prepare("select status from generation_jobs order by output_index").all()).toEqual([{ status: "completed" }, { status: "completed" }]);
      f.db.prepare("update generation_jobs set status='failed',error_stage='remote_failure' where id=?").run(children.jobs[1].id);
      expect(resumed.retryTasks([children.tasks[0].id]).retriedJobs).toBe(1);
      await (resumed as any).runGenerationJob(children.jobs[1].id);
      expect(f.generate).toHaveBeenCalledTimes(2);
      const retryRequest = (f.generate.mock.calls[1] as unknown[])[1] as AdapterGenerationRequest;
      expect(retryRequest.references.map(r => r.buffer)).toEqual([f.buffer, f.auxiliary]);
      expect(f.db.prepare("select attempt_count from generation_jobs where id=?").get(children.jobs[0].id)).toEqual({ attempt_count: 1 });
    } finally { f.db.close(); await resumed.close(); }
  });
  it("blocks missing auxiliary file before creating any batch or job", async () => {
    const f = await fixture();
    try {
      f.db.prepare("update reference_images set local_path='missing-reference.png' where id=?").run(f.reference.id);
      expect(() => f.service.createChildTasksFromImage({ parentImageId: f.image.id, tasks: [{ ...draft, auxiliaryReferenceImageId: f.reference.id }] })).toThrow("参考图不可用");
      expect(f.db.prepare("select count(*) as n from tasks").get()).toEqual({ n: 0 });
      expect(f.db.prepare("select count(*) as n from batches").get()).toEqual({ n: 0 });
    } finally { await f.close(); }
  });
  it("uses page settings for uploaded-source textless jobs and exports frozen original bytes", async () => {
    const f = await fixture();
    try {
      const run = await f.service.getTextlessService().create("courseware", { requestId: "textless-upload", expectedRevision: 1, pageIds: ["page-1"], model: "gpt-image-1", regenerate: false });
      expect(run.run.manifest[0]).toMatchObject({ sourceImageId: f.image.id, aspectRatio: "1:1", resolution: "standard" });
      expect(run.tasks[0]).toMatchObject({ parent_image_id: f.image.id, auxiliary_reference_image_id: null });
      const job = f.db.prepare("select id from generation_jobs").get() as { id: string };
      await (f.service as any).runGenerationJob(job.id);
      expect(f.service.getTextlessService().detail(run.run.id).pages[0].status).toBe("completed");
      expect((await f.service.getTextlessService().export(run.run.id, "final")).length).toBeGreaterThan(1000);
      expect((await f.service.getTextlessService().export(run.run.id, "textless")).length).toBeGreaterThan(1000);
    } finally { await f.close(); }
  });
});

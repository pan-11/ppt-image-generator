import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import sharp from "sharp";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchService } from "../src/services/batch-service.js";
import { createDatabase } from "../src/db/database.js";
import { createGeneratedImagesRepository } from "../src/db/repositories/generated-images-repository.js";
import { registerCoursewareRoutes } from "../src/routes/courseware-routes.js";
import { createImagePptx } from "../src/lib/pptx-service.js";

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "blue" } }).png().toBuffer();

async function fixture(pageCount = 1) {
  const dir = mkdtempSync(join(tmpdir(), "textless-recovery-"));
  const service = new BatchService({ envOverrides: { APP_DATA_DIR: dir, TOAPIS_API_KEY: "test-key" }, backgroundProcessing: false });
  const db = createDatabase(join(dir, "app.sqlite"));
  const api = Fastify();
  registerCoursewareRoutes(api, service);
  const providers = service.getProviderSettingsService();
  const relay = providers.saveProvider({ name: "GrsAI", baseUrl: "https://original.example.com", apiKey: "mock-key", protocolType: "grsai-draw", maxConcurrency: 2 });
  providers.setRoleProvider("text", relay.id);
  providers.setRoleProvider("image", relay.id);
  const courses = service.getCoursewareService();
  const draft = { prompt: "Saved prompt", note: "", model: "gpt-image-2", aspectRatio: "16:9", resolution: "1K", n: 1, referenceMode: "none" as const, referenceImageId: null };
  const pages = Array.from({ length: pageCount }, (_, position) => ({ id: `page-${position + 1}`, position, sourcePageNumber: "", sourcePageName: "", included: true, selectedImageId: null, draft }));
  courses.create({ id: "course", name: "Course", sourceKind: "manual", rawImportText: null, importMode: null, revision: 0, globalReferenceImageId: null, legacyBatchId: null, pages });
  const original = service.createBatch({ name: "Original", coursewareId: "course", tasks: pages.map(page => ({ ...draft, pageId: page.id, size: "16:9" })) });
  const sourcePath = join(dir, "source.png");
  writeFileSync(sourcePath, await png(1280, 720));
  const sources = original.tasks.map(task => createGeneratedImagesRepository(db).create({ batchId: original.batch.id, taskId: task.id, filename: "source.png", localPath: sourcePath, mimeType: "image/png" }));
  courses.update("course", { expectedRevision: 0, name: "Course", globalReferenceImageId: null, pages: pages.map((page, i) => ({ ...page, selectedImageId: sources[i].id })) });
  const run = await service.getTextlessService().create("course", { requestId: "run", expectedRevision: 1, pageIds: pages.map(p => p.id), model: "gpt-image-2", regenerate: false });
  const batchId = (run.tasks[0] as { batch_id: string }).batch_id;
  const jobs = service.getBatch(batchId).jobs;
  const runJob = (id: string) => (service as unknown as { runGenerationJob(id: string): Promise<{ outcome: string }> }).runGenerationJob(id);
  const saveResult = (index: number, buffer: Buffer, valid = false) => {
    const job = jobs[index];
    const path = join(dir, `result-${index}.png`);
    writeFileSync(path, buffer);
    const image = createGeneratedImagesRepository(db).create({ batchId, taskId: job.task_id, filename: `result-${index}.png`, localPath: path, mimeType: "image/png" });
    db.prepare("update generation_jobs set status=?,attempt_count=1,requested_size='1672x941',error_stage=?,error_message=?,provider_id=?,provider_revision=?,protocol_type='grsai-draw',remote_task_id=?,remote_result_url=? where id=?")
      .run(valid ? "completed" : "failed", valid ? null : "validation", valid ? null : "去字结果与源图比例不同", relay.id, providers.getConfiguredProvider(relay.id).configRevision, `remote-${index}`, `https://results.example.com/${index}.png`, job.id);
    db.prepare("update tasks set status=?,error_message=? where id=?").run(valid ? "completed" : "failed", valid ? null : "去字结果与源图比例不同", job.task_id);
    db.prepare("insert into image_job_results (image_id,job_id,attempt_number,validation_status,created_at) values (?,?,1,?,?)").run(image.id, job.id, valid ? "valid" : "invalid", new Date().toISOString());
    return { ...image, local_path: path };
  };
  return { dir, service, db, api, providers, relay, sourcePath, run, batchId, jobs, runJob, saveResult, close: async () => { await api.close(); db.close(); await service.close(); } };
}

describe("textless rounded results", () => {
  it.each([[1671, 941], [1670, 942], [1670, 943], [1674, 939]])("accepts a %ix%i return for a 1672x941 request and 1280x720 source", async (width, height) => {
    const result = await png(width, height);
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ code: 0, data: { id: "remote" } }))
      .mockResolvedValueOnce(json({ code: 0, data: { status: "succeeded", results: [{ url: "https://results.example.com/image.png" }] } }))
      .mockResolvedValueOnce(new Response(new Uint8Array(result), { headers: { "Content-Type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture();
    try {
      expect(await f.runJob(f.jobs[0].id)).toEqual({ outcome: "completed" });
      const detail = f.service.getTextlessService().detail(f.run.run.id);
      expect(detail.pages[0]).toMatchObject({ status: "completed", errorMessage: null });
      expect(detail.pages[0].imageId).toBeTruthy();
      const decks = [];
      for (const variant of ["final", "textless"] as const) {
        const zip = await JSZip.loadAsync(await f.service.getTextlessService().export(f.run.run.id, variant as "final" | "textless"));
        decks.push((await zip.file("ppt/presentation.xml")!.async("string")).match(/<p:sldSz[^>]+>/)![0]);
      }
      expect(decks[0]).toBe(decks[1]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally { await f.close(); }
  });

  it.each([[1671, 941], [1670, 942]])("restores a saved %ix%i image in place without a remote call or another attempt", async (width, height) => {
    const fetchMock = vi.fn(() => { throw new Error("Local restore must not use the network"); });
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture(2);
    const result = await png(width, height);
    const saved = f.saveResult(0, result);
    const successful = f.saveResult(1, await png(1672, 941), true);
    const snapshot = f.db.prepare("select * from generation_jobs where id=?").get(f.jobs[1].id);
    // Local recovery remains possible even after the old provider configuration is unavailable.
    f.db.prepare("update generation_jobs set provider_id='missing',provider_revision='old' where id=?").run(f.jobs[0].id);
    try {
      const response = await f.api.inject({ method: "POST", url: `/api/textless-runs/${f.run.run.id}/restore-results` });
      expect(response.statusCode).toBe(200);
      expect(response.json().pages.map((p: { status: string; imageId: string }) => [p.status, p.imageId])).toEqual([["completed", saved.id], ["completed", successful.id]]);
      expect(f.db.prepare("select status,attempt_count,error_message from generation_jobs where id=?").get(f.jobs[0].id)).toEqual({ status: "completed", attempt_count: 1, error_message: null });
      expect(f.db.prepare("select status,success_count,failed_count from batches where id=?").get(f.batchId)).toEqual({ status: "completed", success_count: 2, failed_count: 0 });
      expect(f.db.prepare("select * from generation_jobs where id=?").get(f.jobs[1].id)).toEqual(snapshot);
      expect(readFileSync(saved.local_path)).toEqual(result);
      expect(f.service.getTextlessService().detail(f.run.run.id).run.manifest).toEqual(f.run.run.manifest);
      expect((await f.api.inject({ method: "POST", url: `/api/textless-runs/${f.run.run.id}/restore-results` })).statusCode).toBe(200);
      expect(f.service.getBatch(f.batchId).images).toHaveLength(2);
      const ppt = await f.api.inject({ method: "POST", url: `/api/textless-runs/${f.run.run.id}/export-pptx`, payload: { variant: "textless" } });
      expect(ppt.statusCode).toBe(200);
      const zip = await JSZip.loadAsync(ppt.rawPayload);
      expect(Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))).toHaveLength(2);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });

  it.each(["wrong-ratio", "wrong-size", "corrupt"])("keeps a saved %s image failed", async kind => {
    const f = await fixture();
    const result = kind === "corrupt" ? Buffer.from("not an image") : await png(kind === "wrong-ratio" ? 941 : 1280, kind === "wrong-ratio" ? 941 : 720);
    f.saveResult(0, result);
    const snapshot = f.db.prepare("select * from generation_jobs where id=?").get(f.jobs[0].id);
    try {
      const response = await f.api.inject({ method: "POST", url: `/api/textless-runs/${f.run.run.id}/restore-results` });
      expect(response.statusCode).toBe(200);
      expect(response.json().pages[0]).toMatchObject({ status: "failed", imageId: null });
      expect(f.db.prepare("select * from generation_jobs where id=?").get(f.jobs[0].id)).toEqual(snapshot);
    } finally { await f.close(); }
  });

  it("does not restore an old attempt over a newly queued retry", async () => {
    const f = await fixture();
    f.saveResult(0, await png(1671, 941));
    let release!: () => void;
    let decoded!: () => void;
    const decoding = new Promise<void>(resolve => { decoded = resolve; });
    const pause = new Promise<void>(resolve => { release = resolve; });
    const internals = f.service as unknown as { validateJobImage(...args: unknown[]): Promise<unknown> };
    const original = internals.validateJobImage.bind(f.service);
    vi.spyOn(internals, "validateJobImage").mockImplementation(async (...args) => {
      const value = await original(...args);
      decoded();
      await pause;
      return value;
    });
    try {
      const pending = f.api.inject({ method: "POST", url: `/api/textless-runs/${f.run.run.id}/restore-results` }).then(response => response);
      await decoding;
      f.service.retryTasks([f.jobs[0].task_id]);
      release();
      expect((await pending).statusCode).toBe(200);
      expect(f.service.getBatch(f.batchId).jobs[0].status).toBe("queued");
      expect(f.db.prepare("select validation_status from image_job_results where job_id=?").get(f.jobs[0].id)).toEqual({ validation_status: "invalid" });
    } finally { await f.close(); }
  });

  it("exports rounded images at the original slide ratio with unchanged embedded bytes", async () => {
    const f = await fixture();
    const result = await png(1671, 941);
    const saved = f.saveResult(0, result);
    try {
      const zip = await JSZip.loadAsync(await createImagePptx([{ path: saved.local_path, label: "1", sourcePath: f.sourcePath }, { path: f.sourcePath, label: "2" }]));
      const presentation = await zip.file("ppt/presentation.xml")!.async("string");
      const size = presentation.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/)!;
      expect(Number(size[1]) / Number(size[2])).toBeCloseTo(16 / 9, 5);
      const media = Object.keys(zip.files).filter(p => /^ppt\/media\/image.*\.png$/.test(p));
      expect(await zip.file(media[0])!.async("nodebuffer")).toEqual(result);
    } finally { await f.close(); }
  });

  it.each([false, true])("exports mixed rounding directions in either page order (reversed: %s)", async reversed => {
    const f = await fixture(3);
    const buffers = await Promise.all([[1674, 939], [1670, 943], [1670, 942]].map(([width, height]) => png(width, height)));
    if (reversed) buffers.reverse();
    const saved = buffers.map((buffer, index) => f.saveResult(index, buffer));
    try {
      const zip = await JSZip.loadAsync(await createImagePptx(saved.map((image, index) => ({ path: image.local_path, label: String(index + 1), sourcePath: f.sourcePath }))));
      const presentation = await zip.file("ppt/presentation.xml")!.async("string");
      const size = presentation.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/)!;
      expect(Number(size[1]) / Number(size[2])).toBeCloseTo(16 / 9, 5);
      const media = Object.keys(zip.files).filter(p => /^ppt\/media\/image.*\.png$/.test(p));
      expect(media).toHaveLength(3);
      for (const [index, file] of media.entries()) expect(await zip.file(file)!.async("nodebuffer")).toEqual(buffers[index]);
    } finally { await f.close(); }
  });
});

describe("explicit failed-page retry", () => {
  it("submits only the confirmed failed page through the current provider and keeps the successful page", async () => {
    const result = await png(1672, 941);
    let submissions = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://results.example.com/")) return new Response(new Uint8Array(result), { headers: { "Content-Type": "image/png" } });
      if (url.endsWith("/draw/result")) {
        const id = JSON.parse(String(init?.body)).id;
        return json({ code: 0, data: id === "remote-1" ? { status: "failed", failure_reason: "error", error: "generate image failed" } : { status: "succeeded", results: [{ url: `https://results.example.com/${id}.png` }] } });
      }
      submissions += 1;
      expect(url).toBe(submissions <= 2 ? "https://original.example.com/v1/draw/completions" : "https://current.example.com/v1/draw/completions");
      return json({ code: 0, data: { id: `remote-${submissions}` } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const f = await fixture(2);
    try {
      await f.runJob(f.jobs[0].id);
      await f.runJob(f.jobs[1].id);
      expect(f.service.getBatch(f.batchId).jobs.map(j => j.status)).toEqual(["failed", "completed"]);
      expect(f.service.getBatch(f.batchId).jobs[0].error_stage).toBe("remote_failure");
      const successful = f.db.prepare("select * from generation_jobs where id=?").get(f.jobs[1].id);
      const successfulId = f.service.getTextlessService().detail(f.run.run.id).pages[1].imageId;
      const relay = f.providers.saveProvider({ name: "Current", baseUrl: "https://current.example.com", apiKey: "new-mock-key", protocolType: "grsai-draw", maxConcurrency: 1 });
      f.providers.setRoleProvider("image", relay.id);
      expect(f.service.retryTasks(f.jobs.map(j => j.task_id))).toMatchObject({ retriedJobs: 1 });
      expect(f.service.retryTasks(f.jobs.map(j => j.task_id))).toMatchObject({ retriedJobs: 0 });
      expect(await f.runJob(f.jobs[0].id)).toEqual({ outcome: "completed" });
      expect(submissions).toBe(3);
      expect(f.db.prepare("select * from generation_jobs where id=?").get(f.jobs[1].id)).toEqual(successful);
      expect(f.service.getTextlessService().detail(f.run.run.id).pages[1].imageId).toBe(successfulId);
      expect(f.service.getBatch(f.batchId).jobs[0].provider_id).toBe(relay.id);
    } finally { await f.close(); }
  });

  it("recognizes the old GrsAI terminal failure without clearing a download failure", async () => {
    const f = await fixture(2);
    try {
      for (const [index, stage, message] of [[0, "polling", "GrsAI 任务失败：error"], [1, "download", "下载 GrsAI 结果失败：HTTP 503"]] as const) {
        f.db.prepare("update generation_jobs set status='failed',error_stage=?,error_message=?,protocol_type='grsai-draw',provider_id=?,provider_revision=?,remote_task_id=? where id=?")
          .run(stage, message, f.relay.id, f.providers.getConfiguredProvider(f.relay.id).configRevision, `remote-${index}`, f.jobs[index].id);
      }
      expect(f.service.retryTasks(f.jobs.map(j => j.task_id))).toMatchObject({ retriedJobs: 2 });
      expect(f.service.getBatch(f.batchId).jobs.map(j => j.remote_task_id)).toEqual([null, "remote-1"]);
    } finally { await f.close(); }
  });
});

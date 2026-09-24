import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import JSZip from "jszip";
import { buildApp } from "../src/app.js";
import { createDatabase } from "../src/db/database.js";
import { createGeneratedImagesRepository } from "../src/db/repositories/generated-images-repository.js";

const draft = { prompt: "原文", note: "", model: "gpt-image-1", aspectRatio: "1:1", resolution: "standard", n: 1, referenceMode: "none", referenceImageId: null };
function document() {
  return { name: "课件", sourceKind: "manual", rawImportText: null, importMode: null, globalReferenceImageId: null, pages: [{ id: "page-1", position: 0, sourcePageNumber: "", sourcePageName: "", included: true, selectedImageId: null, draft }] };
}
function multipart(buffer: Buffer, mime = "image/png", fields: Record<string, string> = {}) {
  const boundary = "external-images-boundary";
  return { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="slide.png"\r\nContent-Type: ${mime}\r\n\r\n`), buffer,
    ...Object.entries(fields).map(([name, value]) => Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}`)),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]) };
}
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "external-images-routes-"));
  const app = await buildApp({ envOverrides: { APP_DATA_DIR: dir, TOAPIS_API_KEY: "fixture-key" }, backgroundProcessing: false });
  await app.inject({ method: "PUT", url: "/api/coursewares/courseware", payload: document() });
  const db = createDatabase(join(dir, "app.sqlite"));
  const buffer = await sharp({ create: { width: 128, height: 128, channels: 3, background: "red" } }).png().toBuffer();
  const upload = (data = buffer, revision = 0, uploadId = randomUUID(), pageId = "page-1", mime = "image/png") => app.inject({ method: "POST", url: `/api/coursewares/courseware/pages/${pageId}/images`, ...multipart(data, mime, { uploadId, expectedRevision: String(revision) }) });
  return { app, db, buffer, upload, close: async () => { db.close(); await app.close(); } };
}

describe("external final images", () => {
  it("attaches an uploaded project's textless run only to that project and its current selection", async () => {
    const f = await fixture();
    try {
      const sourceA = (await f.upload()).json().images[0];
      const projectB = { ...document(), name: "项目 B", pages: [{ ...document().pages[0], id: "page-b", sourcePageName: "封面 B" }] };
      expect((await f.app.inject({ method: "PUT", url: "/api/coursewares/project-b", payload: projectB })).statusCode).toBe(200);
      const uploadB = await f.app.inject({ method: "POST", url: "/api/coursewares/project-b/pages/page-b/images", ...multipart(f.buffer, "image/png", { uploadId: randomUUID(), expectedRevision: "0" }) });
      expect(uploadB.statusCode).toBe(201);
      const sourceB = uploadB.json().images[0];
      const runResponse = await f.app.inject({ method: "POST", url: "/api/coursewares/project-b/textless-runs", payload: { expectedRevision: 1, requestId: randomUUID(), pageIds: ["page-b"], model: "gpt-image-1", regenerate: false } });
      expect(runResponse.statusCode).toBe(200);
      const run = runResponse.json().run;
      expect(run).toMatchObject({ coursewareId: "project-b", manifest: [{ pageId: "page-b", sourceImageId: sourceB.id }] });
      expect(run.manifest[0].sourceImageId).not.toBe(sourceA.id);
      expect((await f.app.inject("/api/coursewares/project-b/textless-runs")).json().runs.map((item: { id: string }) => item.id)).toEqual([run.id]);
      expect((await f.app.inject("/api/coursewares/courseware/textless-runs")).json().runs).toEqual([]);
      expect((await f.app.inject({ method: "POST", url: "/api/coursewares/courseware/textless-runs", payload: { expectedRevision: 1, requestId: randomUUID(), pageIds: ["page-b"], model: "gpt-image-1", regenerate: false } })).statusCode).toBe(409);
    } finally { await f.close(); }
  });
  it("preserves generated candidates, permits switching back, and rejects cross-page or colliding selections", async () => {
    const f = await fixture();
    try {
      const batch = (await f.app.inject({ method: "POST", url: "/api/batches", payload: { name: "original", coursewareId: "courseware", tasks: [{ ...draft, size: "1024x1024", pageId: "page-1" }] } })).json();
      const uploaded = (await f.upload()).json();
      const generated = createGeneratedImagesRepository(f.db).create({ batchId: batch.batch.id, taskId: batch.tasks[0].id, filename: "old.png", localPath: uploaded.images[0].local_path, mimeType: "image/png" });
      const patch = { name: "课件", globalReferenceImageId: null, pages: uploaded.courseware.pages.map((p: any) => ({ ...p, selectedImageId: generated.id })), expectedRevision: 1 };
      expect((await f.app.inject({ method: "PATCH", url: "/api/coursewares/courseware", payload: patch })).statusCode).toBe(200);
      expect((await f.upload(f.buffer, 2, generated.id)).statusCode).toBe(409);
      const restored = (await f.app.inject("/api/coursewares/courseware")).json();
      expect(restored.images).toHaveLength(2);
      expect(restored.courseware.pages[0].selectedImageId).toBe(generated.id);
      expect((await f.app.inject({ method: "PUT", url: "/api/coursewares/other", payload: { ...document(), pages: uploaded.courseware.pages } })).statusCode).toBe(409);
    } finally { await f.close(); }
  });
  it("serializes concurrent duplicate uploads, and enforces child auxiliary fields through HTTP", async () => {
    const f = await fixture();
    try {
      const id = randomUUID();
      const responses = await Promise.all([f.upload(f.buffer, 0, id), f.upload(f.buffer, 0, id)]);
      expect(responses.map(r => r.statusCode)).toEqual([201, 201]);
      expect(responses[0].json()).toEqual(responses[1].json());
      const reference = (await f.app.inject({ method: "POST", url: "/api/reference-images", ...multipart(f.buffer) })).json();
      const child = await f.app.inject({ method: "POST", url: `/api/images/${id}/children`, payload: { tasks: [{ ...draft, size: "1024x1024", auxiliaryReferenceImageId: reference.id }] } });
      expect(child.statusCode).toBe(201);
      expect(child.json().tasks[0]).toMatchObject({ parent_image_id: id, auxiliary_reference_image_id: reference.id });
      expect((await f.app.inject({ method: "POST", url: `/api/images/${id}/children`, payload: { tasks: [{ ...draft, size: "1024x1024", auxiliaryReferenceImageId: 123 }] } })).statusCode).toBe(400);
      expect((await f.app.inject({ method: "POST", url: "/api/batches", payload: { name: "missing-reference", tasks: [{ ...draft, size: "1024x1024", referenceMode: "row", referenceImageId: "unavailable" }] } })).statusCode).toBe(409);
      expect(f.db.prepare("select count(*) as n from generation_jobs").get()).toEqual({ n: 1 });
    } finally { await f.close(); }
  });
  it("persists exact bytes, selects a real uploaded candidate without creating tasks, restores and exports it", async () => {
    const f = await fixture();
    try {
      const response = await f.upload();
      expect(response.statusCode).toBe(201);
      const detail = response.json();
      const image = detail.images[0];
      expect(image).toMatchObject({ source: "upload", courseware_id: "courseware", page_id: "page-1", task_id: null, batch_id: null, width: 128, height: 128, validation_status: "valid" });
      expect(detail.courseware.pages[0].selectedImageId).toBe(image.id);
      expect(readFileSync(image.local_path)).toEqual(f.buffer);
      expect(f.db.prepare("select count(*) as n from tasks").get()).toEqual({ n: 0 });
      expect(f.db.prepare("select count(*) as n from generation_jobs").get()).toEqual({ n: 0 });
      expect((await f.app.inject(`/api/download/images/${image.id}`)).rawPayload).toEqual(f.buffer);
      expect((await f.app.inject("/api/coursewares/courseware")).json().images).toEqual(detail.images);
      const ppt = await f.app.inject({ method: "POST", url: "/api/coursewares/courseware/export-pptx", payload: { expectedRevision: 1, pageIds: ["page-1"] } });
      expect(ppt.statusCode).toBe(200);
      const zip = await JSZip.loadAsync(ppt.rawPayload);
      const media = Object.keys(zip.files).filter(p => /^ppt\/media\/image.*\.png$/.test(p));
      expect(media).toHaveLength(1);
      expect(await zip.file(media[0])!.async("nodebuffer")).toEqual(f.buffer);
    } finally { await f.close(); }
  });
  it("deduplicates a lost-response retry without reselecting over a later explicit selection", async () => {
    const f = await fixture();
    try {
      const uploadId = randomUUID();
      const first = await f.upload(f.buffer, 0, uploadId);
      expect(first.statusCode).toBe(201);
      const second = (await f.upload(f.buffer, 1)).json();
      expect(second.images).toHaveLength(2);
      const retry = await f.upload(f.buffer, 0, uploadId);
      expect(retry.statusCode).toBe(201);
      expect(retry.json().images).toHaveLength(2);
      expect(retry.json().courseware).toEqual(second.courseware);
      expect((await f.upload(f.buffer, 0)).statusCode).toBe(409);
      expect((await f.upload(f.buffer, 2, uploadId, "other-page")).statusCode).toBe(409);
    } finally { await f.close(); }
  });
  it.each(["jpeg", "webp"] as const)("accepts fully decoded %s files", async format => {
    const f = await fixture();
    try {
      const buffer = await sharp(f.buffer).toFormat(format).toBuffer();
      const response = await f.upload(buffer, 0, randomUUID(), "page-1", `image/${format}`);
      expect(response.statusCode).toBe(201);
      expect(response.json().images[0].mime_type).toBe(`image/${format}`);
    } finally { await f.close(); }
  });
  it("rejects corrupt, wrong-ratio, wrong-format, missing-page and oversized uploads without changing selection", async () => {
    const f = await fixture();
    try {
      const selected = (await f.upload()).json();
      expect(selected.courseware).toBeDefined();
      const wide = await sharp({ create: { width: 160, height: 90, channels: 3, background: "blue" } }).png().toBuffer();
      for (const [buffer, mime, status] of [[Buffer.from("corrupt"), "image/png", 422], [wide, "image/png", 422], [f.buffer, "image/gif", 415], [Buffer.alloc(20 * 1024 * 1024 + 1), "image/png", 413]] as const) {
        expect((await f.upload(buffer, 1, randomUUID(), "page-1", mime)).statusCode).toBe(status);
      }
      expect((await f.upload(f.buffer, 1, randomUUID(), "missing")).statusCode).toBe(409);
      expect((await f.app.inject("/api/coursewares/courseware")).json()).toEqual(selected);
    } finally { await f.close(); }
  });
  it("returns validated reference metadata and content; refuses corrupt and oversized references", async () => {
    const f = await fixture();
    try {
      const response = await f.app.inject({ method: "POST", url: "/api/reference-images", ...multipart(f.buffer) });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ filename: "slide.png", width: 128, height: 128, mimeType: "image/png" });
      const id = response.json().id;
      expect((await f.app.inject(`/api/reference-images/${id}`)).json()).toMatchObject(response.json());
      expect((await f.app.inject(`/api/reference-images/${id}/content`)).rawPayload).toEqual(f.buffer);
      expect((await f.app.inject({ method: "POST", url: "/api/reference-images", ...multipart(Buffer.from("bad")) })).statusCode).toBe(422);
      expect((await f.app.inject({ method: "POST", url: "/api/reference-images", ...multipart(Buffer.alloc(20 * 1024 * 1024 + 1)) })).statusCode).toBe(413);
    } finally { await f.close(); }
  });
});

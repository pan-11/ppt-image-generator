import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchService } from "../src/services/batch-service.js";
import { TEXTLESS_PROMPT } from "../src/lib/textless-prompt.js";

afterEach(() => vi.unstubAllGlobals());

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

async function runJobs(service: BatchService, batchId: string, taskIds: string[]) {
  const jobs = service.getBatch(batchId).jobs.filter(job => taskIds.includes(job.task_id) && job.status === "queued");
  for (const job of jobs) {
    const result = await (service as unknown as {
      runGenerationJob(id: string): Promise<{ outcome: string }>;
    }).runGenerationJob(job.id);
    expect(result.outcome).toBe("completed");
  }
}

describe("new provider courseware workflow", () => {
  it("keeps a Cangyuan invalid download failed and retries its existing result without generating again", async () => {
    const image = await sharp({ create: { width: 160, height: 90, channels: 3, background: "blue" } }).png().toBuffer();
    const resultUrl = "https://results.example.com/invalid-first.png";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ id: "existing-task", status: "queued" }))
      .mockResolvedValueOnce(json({ id: "existing-task", status: "completed", data: [{ url: resultUrl }] }))
      .mockResolvedValueOnce(new Response("<!doctype html>CDN unavailable", { headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response(new Uint8Array(image), { headers: { "Content-Type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new BatchService({ envOverrides: { TOAPIS_API_KEY: "unused-env", APP_DATA_DIR: mkdtempSync(join(tmpdir(), "new-relay-invalid-image-")) }, backgroundProcessing: false });
    try {
      const providers = service.getProviderSettingsService();
      const relay = providers.saveProvider({ name: "Cangyuan", baseUrl: "https://relay.example.com", apiKey: "mock-key", protocolType: "cangyuan-images", maxConcurrency: 1 });
      providers.setRoleProvider("text", relay.id);
      const batch = service.createBatch({ name: "Invalid download", tasks: [{ prompt: "Slide", model: "gpt-image-2-1k", aspectRatio: "16:9", resolution: "1K", size: "16:9", n: 1, referenceMode: "none", referenceImageId: null }] });
      const job = service.getBatch(batch.batch.id).jobs[0];
      await (service as unknown as { runGenerationJob(id: string): Promise<unknown> }).runGenerationJob(job.id);
      const failed = service.getBatch(batch.batch.id);
      expect(failed.jobs[0]).toMatchObject({ status: "failed", remote_task_id: "existing-task", remote_result_url: resultUrl });
      expect(failed.images).toHaveLength(0);
      expect(service.retryTasks([batch.tasks[0].id])).toMatchObject({ retriedJobs: 1 });
      await runJobs(service, batch.batch.id, [batch.tasks[0].id]);
      expect(service.getBatch(batch.batch.id).images).toHaveLength(1);
      expect(fetchMock.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
    } finally { await service.close(); }
  });

  it.each([
    ["grsai-draw", "gpt-image-2-vip"], ["cangyuan-images", "gpt-image-2-1k"]
  ] as const)("keeps %s HTTP408 unknown until the existing charge confirmation is used", async (protocolType, model) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("timeout", { status: 408 }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new BatchService({ envOverrides: { TOAPIS_API_KEY: "unused-env", APP_DATA_DIR: mkdtempSync(join(tmpdir(), "new-relay-unknown-")) }, backgroundProcessing: false });
    try {
      const providers = service.getProviderSettingsService();
      const relay = providers.saveProvider({ name: "Relay", baseUrl: "https://relay.example.com", apiKey: "mock-key", protocolType, maxConcurrency: 1 });
      providers.setRoleProvider("text", relay.id);
      const batch = service.createBatch({ name: "Timeout", tasks: [{ prompt: "Slide", model, aspectRatio: "16:9", resolution: "1K", size: "16:9", n: 1, referenceMode: "none", referenceImageId: null }] });
      const job = service.getBatch(batch.batch.id).jobs[0];
      await (service as unknown as { runGenerationJob(id: string): Promise<unknown> }).runGenerationJob(job.id);
      expect(service.getBatch(batch.batch.id).jobs[0].status).toBe("unknown");
      expect(() => service.retryTasks([batch.tasks[0].id])).toThrow(expect.objectContaining({ code: "UNKNOWN_CHARGE_RISK" }));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { await service.close(); }
  });

  it.each([
    ["grsai-draw", "gpt-image-2-vip"], ["cangyuan-images", "gpt-image-2-1k"]
  ] as const)("recovers only failed %s siblings through the original provider after role switching", async (protocolType, model) => {
    const image = await sharp({ create: { width: 1280, height: 720, channels: 3, background: "blue" } }).png().toBuffer();
    let submitted = 0;
    let downloadingFailed = true;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://results.example.com/")) {
        if (url.endsWith("task-2.png") && downloadingFailed) return new Response("expired", { status: 403 });
        return new Response(new Uint8Array(image), { headers: { "Content-Type": "image/png" } });
      }
      expect(url).toContain("https://original.example.com/");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer original-mock-key");
      const query = url.endsWith("/draw/result") || init?.method === "GET";
      if (query) {
        const id = protocolType === "grsai-draw" ? JSON.parse(String(init?.body)).id : url.split("/").at(-1);
        return protocolType === "grsai-draw"
          ? json({ code: 0, data: { id, status: "succeeded", results: [{ url: `https://results.example.com/${id}.png` }] } })
          : json({ id, status: "completed", data: [{ url: `https://results.example.com/${id}.png` }] });
      }
      const id = `task-${++submitted}`;
      return protocolType === "grsai-draw" ? json({ code: 0, data: { id } }) : json({ id, status: "queued" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new BatchService({ envOverrides: { TOAPIS_API_KEY: "unused-env", APP_DATA_DIR: mkdtempSync(join(tmpdir(), "new-relay-recover-")) }, backgroundProcessing: false });
    try {
      const providers = service.getProviderSettingsService();
      const relay = providers.saveProvider({ name: "Original relay", baseUrl: "https://original.example.com", apiKey: "original-mock-key", protocolType, maxConcurrency: 2 });
      providers.setRoleProvider("text", relay.id);
      const batch = service.createBatch({ name: "Partial", tasks: [{ prompt: "Slide", model, aspectRatio: "16:9", resolution: "1K", size: "16:9", n: 2, referenceMode: "none", referenceImageId: null }] });
      const jobs = service.getBatch(batch.batch.id).jobs;
      for (const job of jobs) await (service as unknown as { runGenerationJob(id: string): Promise<unknown> }).runGenerationJob(job.id);
      expect(service.getBatch(batch.batch.id).jobs.map(job => job.status)).toEqual(["completed", "failed"]);
      const completedId = service.getBatch(batch.batch.id).images[0].id;
      expect(() => providers.saveProvider({ id: relay.id, name: relay.name, baseUrl: "https://different.example.com", protocolType })).toThrow("仍有远程任务");
      providers.setRoleProvider("text", "env:toapis");
      downloadingFailed = false;
      expect(service.retryTasks([batch.tasks[0].id])).toMatchObject({ retriedJobs: 1 });
      await runJobs(service, batch.batch.id, [batch.tasks[0].id]);
      const finished = service.getBatch(batch.batch.id);
      expect(finished.jobs.every(job => job.provider_id === relay.id && job.status === "completed")).toBe(true);
      expect(finished.images).toHaveLength(2);
      expect(finished.images.some(image => image.id === completedId)).toBe(true);
      expect(submitted).toBe(2);
    } finally { await service.close(); }
  });

  it.each([
    ["grsai-draw", "gpt-image-2-vip", "https://grsai.dakka.com.cn"],
    ["grsai-draw", "gpt-image-2.5", "https://grsai.dakka.com.cn"],
    ["cangyuan-images", "gpt-image-2-1k", "https://ai.cangyuansuanli.cn"]
  ] as const)("runs %s originals, variations and textless export through the default registry", async (protocolType, model, baseUrl) => {
    const dimensions = model === "gpt-image-2.5" ? { width: 1672, height: 941 } : { width: 1280, height: 720 };
    const image = await sharp({ create: { ...dimensions, channels: 3, background: "#74b3cf" } }).png().toBuffer();
    const submissions: Array<{ url: string; body: Record<string, unknown> }> = [];
    const uploaded: Buffer[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === "https://canvas.cangyuansuanli.cn/api/media/references") {
        expect(new Headers(init?.headers).has("authorization")).toBe(false);
        return json({ uploadUrl: "https://uploads.example.com/ref", url: "https://tmp.cangyuansuanli.cn/ref.png", contentType: "image/png", ttlHours: 2 });
      }
      if (init?.method === "PUT") {
        uploaded.push(Buffer.from(await new Response(init.body).arrayBuffer()));
        return new Response(null);
      }
      if (url.startsWith("https://results.example.com/")) {
        expect(new Headers(init?.headers).has("authorization")).toBe(false);
        return new Response(new Uint8Array(image), { headers: { "Content-Type": "image/png" } });
      }
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer mock-relay-key");
      if (url.endsWith("/v1/draw/result")) {
        const id = JSON.parse(String(init?.body)).id;
        return json({ code: 0, data: { id, status: "succeeded", results: [{ url: `https://results.example.com/${id}.png` }] } });
      }
      if (init?.method === "GET") {
        const id = url.split("/").at(-1);
        return json({ id, status: "completed", data: [{ url: `https://results.example.com/${id}.png` }] });
      }
      const body = JSON.parse(String(init?.body));
      submissions.push({ url, body });
      const id = `remote-${submissions.length}`;
      return protocolType === "grsai-draw" ? json({ code: 0, data: { id } }) : json({ id, status: "queued" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const dir = mkdtempSync(join(tmpdir(), "new-provider-workflow-"));
    const service = new BatchService({ envOverrides: { TOAPIS_API_KEY: "unused-env", APP_DATA_DIR: dir }, backgroundProcessing: false });
    try {
      const providers = service.getProviderSettingsService();
      const relay = providers.saveProvider({ name: "New relay", baseUrl, apiKey: "mock-relay-key", protocolType, maxConcurrency: 4 });
      providers.setRoleProvider("text", relay.id);
      providers.setRoleProvider("image", relay.id);
      const courses = service.getCoursewareService();
      const draft = { prompt: "Original reusable slide prompt", note: "Page1", model, aspectRatio: "16:9", resolution: "1K", n: 2, referenceMode: "none" as const, referenceImageId: null };
      courses.create({
        id: "course", name: "Relay course", sourceKind: "import", rawImportText: draft.prompt,
        importMode: "lines", legacyBatchId: null, globalReferenceImageId: null, revision: 0,
        pages: [{ id: "page", position: 0, sourcePageNumber: "P1", sourcePageName: "Cover", draft, included: true, selectedImageId: null }]
      });
      const original = service.createBatch({ name: "Original", coursewareId: "course", tasks: [{ ...draft, size: "16:9", pageId: "page" }] });
      await runJobs(service, original.batch.id, original.tasks.map(task => task.id));
      let batch = service.getBatch(original.batch.id);
      expect(batch.images).toHaveLength(2);
      expect(submissions).toHaveLength(2);
      const child = service.createChildTasksFromImage({ parentImageId: batch.images[0].id, tasks: [{ ...draft, prompt: "Improve this slide", size: "16:9", n: 1 }] });
      const childTasks = child.tasks as Array<{ id: string }>;
      await runJobs(service, original.batch.id, childTasks.map(task => task.id));
      batch = service.getBatch(original.batch.id);
      const chosen = batch.images.find(candidate => candidate.task_id === childTasks[0].id)!;
      const course = courses.require("course");
      courses.update("course", { name: course.name, expectedRevision: course.revision, globalReferenceImageId: null, pages: course.pages.map(page => ({ ...page, selectedImageId: chosen.id })) });
      const run = await service.getTextlessService().create("course", { requestId: "textless", expectedRevision: courses.require("course").revision, pageIds: ["page"], model, regenerate: false });
      const textlessTasks = run.tasks as Array<{ id: string; batch_id: string }>;
      await runJobs(service, textlessTasks[0].batch_id, textlessTasks.map(task => task.id));
      const detail = service.getTextlessService().detail(run.run.id);
      expect(detail.pages[0]).toMatchObject({ status: "completed", sourceImageId: chosen.id });
      expect(submissions).toHaveLength(4);
      expect(submissions.every(call => call.body.model === model)).toBe(true);
      expect(submissions[3].body.prompt).toBe(TEXTLESS_PROMPT);
      expect(courses.require("course").rawImportText).toBe(draft.prompt);
      expect(courses.require("course").pages[0].selectedImageId).toBe(chosen.id);
      if (protocolType === "grsai-draw") {
        expect(submissions.every(call => call.body.shutProgress === true && call.body.webHook === "-1")).toBe(true);
        expect(submissions[3].body.urls).toEqual([`data:image/png;base64,${image.toString("base64")}`]);
      } else {
        expect(submissions.map(call => new URL(call.url).pathname)).toEqual(["/v1/images/generations", "/v1/images/generations", "/v1/images/edits", "/v1/images/edits"]);
        expect(submissions.every(call => call.body.async === true && call.body.n === 1)).toBe(true);
        expect(uploaded).toHaveLength(2);
        expect(uploaded.every(buffer => buffer.equals(image))).toBe(true);
      }
      for (const variant of ["final", "textless"] as const) {
        const zip = await JSZip.loadAsync(await service.getTextlessService().export(run.run.id, variant));
        const slides = Object.keys(zip.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path));
        expect(slides).toHaveLength(1);
        expect((await zip.file(slides[0])!.async("string")).match(/<p:pic>/g)).toHaveLength(1);
      }
    } finally { await service.close(); }
  });
});

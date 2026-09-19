import { afterEach, expect, it, vi } from "vitest";
import { createBatch, createChildTasks, fetchReferenceImage } from "../lib/api";
import { uploadCoursewareImage } from "../lib/courseware-api";
import { createTaskDraft } from "../lib/task-draft";
import { validateImageUpload } from "../lib/image-upload";

afterEach(() => vi.unstubAllGlobals());
const defaults = { model: "gpt-image-2", aspectRatio: "16:9", resolution: "1K", n: 1, globalReferenceImageId: null };

it("new pages follow a shared reference added later while explicit opt-outs remain possible", () => {
  expect(createTaskDraft(defaults)).toMatchObject({ referenceMode: "global", referenceImageId: null });
  expect(createTaskDraft(defaults, { referenceMode: "none" }).referenceMode).toBe("none");
});

it("does not send a stale row reference when the user explicitly selected no reference", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ batch: { id: "b" }, tasks: [] })));
  vi.stubGlobal("fetch", fetchMock);
  await createBatch({ name: "course", globalReferenceImageId: "global", tasks: [createTaskDraft(defaults, { prompt: "page", referenceMode: "none", referenceImageId: "old" })] });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).tasks[0]).toMatchObject({ referenceMode: "none", referenceImageId: null });
});

it("passes the auxiliary reference separately from the fixed original in child requests", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tasks: [] })));
  vi.stubGlobal("fetch", fetchMock);
  await createChildTasks("original", [createTaskDraft(defaults, { prompt: "keep layout", auxiliaryReferenceImageId: "character" })]);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/images/original/children");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).tasks[0]).toMatchObject({ prompt: "keep layout", auxiliaryReferenceImageId: "character" });
});

it("uploads a final image with page identity, saved revision and a stable retry ID", async () => {
  const detail = { courseware: { id: "course", revision: 8 }, images: [{ id: "upload" }], tasks: [], links: [] };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(detail)));
  vi.stubGlobal("fetch", fetchMock);
  const file = new File(["png"], "final.png", { type: "image/png" });
  expect(await uploadCoursewareImage("course", "page", file, "retry-id", 7)).toEqual(detail);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/coursewares/course/pages/page/images");
  const form = fetchMock.mock.calls[0][1].body as FormData;
  expect(form.get("uploadId")).toBe("retry-id");
  expect(form.get("expectedRevision")).toBe("7");
  expect(form.get("file")).toBe(file);
  expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
});

it("preserves revision error codes for upload recovery", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "REVISION_CONFLICT", message: "课件已发生变化" }), { status: 409 })));
  await expect(uploadCoursewareImage("c", "p", new File(["png"], "a.png"), "upload-id", 0)).rejects.toMatchObject({ code: "REVISION_CONFLICT", status: 409, message: "课件已发生变化" });
});

it("fetches saved reference metadata for restored thumbnails", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "r", filename: "ref.png", localPath: "", width: 512, height: 512 })));
  vi.stubGlobal("fetch", fetchMock);
  expect(await fetchReferenceImage("r")).toMatchObject({ id: "r", filename: "ref.png" });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/reference-images/r");
});

it("rejects unsupported formats and oversized uploads before a request", () => {
  expect(validateImageUpload(new File(["image"], "a.png", { type: "image/png" }))).toBeNull();
  expect(validateImageUpload(new File(["gif"], "a.gif", { type: "image/gif" }))).toMatch(/PNG/);
  const file = new File(["image"], "a.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "size", { value: 20 * 1024 * 1024 + 1 });
  expect(validateImageUpload(file)).toMatch(/20/);
});

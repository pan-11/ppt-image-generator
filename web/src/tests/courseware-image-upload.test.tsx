import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCourseware } from "../hooks/use-courseware";
import { createCourseware, fetchCourseware, patchCourseware, uploadCoursewareImage, type CoursewareDetail, type CoursewareDocument } from "../lib/courseware-api";

vi.mock("../lib/courseware-api", () => ({ createCourseware: vi.fn(), fetchCourseware: vi.fn(), patchCourseware: vi.fn(), uploadCoursewareImage: vi.fn() }));
const doc: CoursewareDocument = { id: "course-a", name: "课件", sourceKind: "manual", rawImportText: null, importMode: null, legacyBatchId: null, globalReferenceImageId: null, revision: 0, pages: [{ id: "p", position: 0, sourcePageNumber: "", sourcePageName: "封面", included: true, selectedImageId: "old", draft: { prompt: "原始提示词", note: "", model: "gpt-image-2", aspectRatio: "16:9", resolution: "1K", n: 1, referenceMode: "none", referenceImageId: null } }] };
const file = new File(["bytes"], "final.png", { type: "image/png" });
function detail(document = doc, uploadId?: string): CoursewareDetail {
  return { courseware: document, tasks: [], links: [], images: uploadId ? [{ id: uploadId, filename: file.name, local_path: "local", source: "upload", courseware_id: document.id, page_id: "p" }] : [] };
}
function uploaded(id = "upload-1", revision = 1) { return detail({ ...doc, revision, pages: doc.pages.map(page => ({ ...page, selectedImageId: id })) }, id); }
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  vi.mocked(createCourseware).mockImplementation(async value => value);
  vi.mocked(fetchCourseware).mockResolvedValue(detail());
  vi.mocked(patchCourseware).mockImplementation(async value => ({ ...value, revision: value.revision + 1 }));
  vi.mocked(uploadCoursewareImage).mockResolvedValue(uploaded());
});
afterEach(cleanup);
async function setup() {
  const hook = renderHook(() => useCourseware());
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await act(async () => { await hook.result.current.create(doc); });
  return hook;
}

it("flushes pending changes before uploading and adopts the server-selected final", async () => {
  const { result } = await setup();
  act(() => result.current.edit({ ...doc, name: "已编辑课件" }));
  vi.mocked(uploadCoursewareImage).mockResolvedValue({ ...uploaded("upload-1", 2), courseware: { ...uploaded("upload-1", 2).courseware, name: "已编辑课件" } });
  await act(async () => { await result.current.uploadImage("p", file, "upload-1"); });
  expect(uploadCoursewareImage).toHaveBeenCalledWith("course-a", "p", file, "upload-1", 1);
  expect(result.current.document).toMatchObject({ name: "已编辑课件", revision: 2, pages: [{ selectedImageId: "upload-1" }] });
});

it("keeps prompt edits made during the upload and saves them with the returned revision", async () => {
  const { result } = await setup();
  let release!: (value: CoursewareDetail) => void;
  vi.mocked(uploadCoursewareImage).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.uploadImage("p", file, "upload-1"); await Promise.resolve(); });
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledTimes(1));
  act(() => result.current.edit({ ...doc, pages: doc.pages.map(page => ({ ...page, draft: { ...page.draft, prompt: "上传期间的新提示词" } })) }));
  await act(async () => { release(uploaded()); await pending; });
  expect(result.current.document?.pages[0]).toMatchObject({ selectedImageId: "upload-1", draft: { prompt: "上传期间的新提示词" } });
  expect(patchCourseware).toHaveBeenCalledWith(expect.objectContaining({ revision: 1, pages: [expect.objectContaining({ selectedImageId: "upload-1", draft: expect.objectContaining({ prompt: "上传期间的新提示词" }) })] }));
});

it("preserves a deliberate final selection made after uploading started", async () => {
  const { result } = await setup();
  let release!: (value: CoursewareDetail) => void;
  vi.mocked(uploadCoursewareImage).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.uploadImage("p", file, "upload-1"); await Promise.resolve(); });
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledTimes(1));
  act(() => result.current.edit({ ...doc, pages: doc.pages.map(page => ({ ...page, selectedImageId: "other" })) }));
  await act(async () => { release(uploaded()); await pending; });
  expect(result.current.document?.pages[0].selectedImageId).toBe("other");
  expect(result.current.detail?.images[0].id).toBe("upload-1");
});

it("does not install a late upload into a different opened courseware", async () => {
  const { result } = await setup();
  let release!: (value: CoursewareDetail) => void;
  vi.mocked(uploadCoursewareImage).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.uploadImage("p", file, "upload-1"); await Promise.resolve(); });
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledTimes(1));
  act(() => result.current.install({ ...doc, id: "course-b", name: "另一课件" }));
  await act(async () => { release(uploaded()); await pending; });
  expect(result.current.document).toMatchObject({ id: "course-b", revision: 0 });
  expect(result.current.document?.pages[0].selectedImageId).toBe("old");
});

it("recovers a committed upload after a lost response without duplicating its request", async () => {
  const { result } = await setup();
  vi.mocked(uploadCoursewareImage).mockRejectedValueOnce(new TypeError("network failed"));
  vi.mocked(fetchCourseware).mockResolvedValue(uploaded());
  await act(async () => { await result.current.uploadImage("p", file, "upload-1"); });
  expect(result.current.document?.pages[0].selectedImageId).toBe("upload-1");
  expect(uploadCoursewareImage).toHaveBeenCalledTimes(1);
});

it("serializes uploads and uses the revision from the previous completed operation", async () => {
  const { result } = await setup();
  let release!: (value: CoursewareDetail) => void;
  vi.mocked(uploadCoursewareImage).mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValueOnce(uploaded("upload-2", 2));
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => { first = result.current.uploadImage("p", file, "upload-1"); second = result.current.uploadImage("p", file, "upload-2"); await Promise.resolve(); });
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledTimes(1));
  await act(async () => { release(uploaded()); await first; await second; });
  expect(vi.mocked(uploadCoursewareImage).mock.calls[1]).toEqual(["course-a", "p", file, "upload-2", 1]);
  expect(result.current.document?.pages[0].selectedImageId).toBe("upload-2");
});

it("does not replace imported candidates with an older in-flight poll", async () => {
  const { result } = await setup();
  let release!: (value: CoursewareDetail) => void;
  vi.mocked(fetchCourseware).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  let poll!: Promise<void>;
  act(() => { poll = result.current.refresh(); });
  await act(async () => { await result.current.uploadImage("p", file, "upload-1"); });
  await act(async () => { release(detail()); await poll; });
  expect(result.current.detail?.images[0]?.id).toBe("upload-1");
});

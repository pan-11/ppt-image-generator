import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCourseware } from "../hooks/use-courseware";
import { createCourseware, fetchCourseware, patchCourseware, uploadCoursewareImage, type CoursewareDetail, type CoursewareDocument } from "../lib/courseware-api";

vi.mock("../lib/courseware-api", () => ({ createCourseware: vi.fn(), fetchCourseware: vi.fn(), patchCourseware: vi.fn(), uploadCoursewareImage: vi.fn() }));
const doc: CoursewareDocument = { id: "course-a", name: "课件", sourceKind: "manual", rawImportText: null, importMode: null, legacyBatchId: null, globalReferenceImageId: null, revision: 0, pages: [{ id: "p", position: 0, sourcePageNumber: "", sourcePageName: "", included: true, selectedImageId: "old", draft: { prompt: "原提示词", note: "", model: "gpt-image-2", aspectRatio: "16:9", resolution: "1K", n: 1, referenceMode: "none", referenceImageId: null } }] };
const file = new File(["bytes"], "final.png", { type: "image/png" });
const initial: CoursewareDetail = { courseware: doc, tasks: [], links: [], images: [] };
const uploaded: CoursewareDetail = { ...initial, courseware: { ...doc, revision: 1, pages: doc.pages.map(page => ({ ...page, selectedImageId: "upload-1" })) }, images: [{ id: "upload-1", filename: "final.png", local_path: "local", source: "upload", courseware_id: doc.id, page_id: "p" }] };
beforeEach(() => {
  localStorage.clear(); vi.resetAllMocks();
  vi.mocked(createCourseware).mockImplementation(async value => value);
  vi.mocked(fetchCourseware).mockResolvedValue(initial);
  vi.mocked(patchCourseware).mockImplementation(async value => ({ ...value, revision: value.revision + 1 }));
  vi.mocked(uploadCoursewareImage).mockResolvedValue(uploaded);
});
afterEach(cleanup);
async function setup() {
  const hook = renderHook(() => useCourseware());
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await act(async () => { await hook.result.current.create(doc); });
  return hook;
}

it("recovers an uncertain committed upload before flushing dirty edits on a same-ID retry", async () => {
  const { result } = await setup();
  let rejectUpload!: (reason: Error) => void;
  vi.mocked(uploadCoursewareImage).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectUpload = reject; }));
  let failure!: Promise<unknown>;
  await act(async () => { failure = result.current.uploadImage("p", file, "upload-1").catch(error => error); await Promise.resolve(); });
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledTimes(1));
  act(() => result.current.edit({ ...doc, pages: doc.pages.map(page => ({ ...page, draft: { ...page.draft, prompt: "上传过程中编辑的提示词" } })) }));
  vi.mocked(fetchCourseware).mockRejectedValueOnce(new TypeError("recovery connection failed"));
  await act(async () => { rejectUpload(new TypeError("upload response lost")); expect(await failure).toBeInstanceOf(TypeError); });
  await expect(result.current.flush()).rejects.toThrow("先重试");
  await expect(result.current.uploadImage("p", file, "different-upload")).rejects.toThrow("先重试");
  expect(patchCourseware).not.toHaveBeenCalled();
  // The server committed revision 1, but both responses were lost. Network now recovers.
  vi.mocked(fetchCourseware).mockResolvedValue(uploaded);
  vi.mocked(patchCourseware).mockImplementation(async value => {
    if (value.revision === 0) throw Object.assign(new Error("stale revision after committed upload"), { code: "REVISION_CONFLICT" });
    return { ...value, revision: value.revision + 1 };
  });
  await act(async () => { await expect(result.current.uploadImage("p", file, "upload-1")).resolves.toBeUndefined(); });
  expect(result.current.document?.pages[0]).toMatchObject({ selectedImageId: "upload-1", draft: { prompt: "上传过程中编辑的提示词" } });
  expect(result.current.document?.revision).toBe(2);
});

it("does not overwrite another window's newer edits when resolving a committed upload", async () => {
  const { result } = await setup();
  let rejectUpload!: (reason: Error) => void;
  vi.mocked(uploadCoursewareImage).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectUpload = reject; }));
  let failure!: Promise<unknown>;
  await act(async () => { failure = result.current.uploadImage("p", file, "upload-1").catch(error => error); await Promise.resolve(); });
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledTimes(1));
  act(() => result.current.edit({ ...doc, name: "本地未保存标题" }));
  vi.mocked(fetchCourseware).mockResolvedValue({ ...uploaded, courseware: { ...uploaded.courseware, revision: 2, name: "另一窗口的标题" } });
  await act(async () => { rejectUpload(new TypeError("response lost")); expect(await failure).toMatchObject({ code: "REVISION_CONFLICT" }); });
  expect(result.current.document?.name).toBe("本地未保存标题");
  expect(patchCourseware).not.toHaveBeenCalled();
  await expect(result.current.flush()).rejects.toThrow("其他窗口");
});

it("preserves a deliberate return to the original selection while upload is pending", async () => {
  const { result } = await setup();
  let release!: (value: CoursewareDetail) => void;
  vi.mocked(uploadCoursewareImage).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.uploadImage("p", file, "upload-1"); await Promise.resolve(); });
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledTimes(1));
  act(() => result.current.edit({ ...doc, pages: doc.pages.map(page => ({ ...page, selectedImageId: "other" })) }));
  act(() => result.current.edit({ ...doc, pages: doc.pages.map(page => ({ ...page, selectedImageId: "old" })) }));
  await act(async () => { release(uploaded); await pending; });
  expect(result.current.document?.pages[0].selectedImageId).toBe("old");
});

it("keeps uploaded candidates when a same-courseware open returns an older snapshot", async () => {
  const { result } = await setup();
  let release!: (value: CoursewareDetail) => void;
  vi.mocked(fetchCourseware).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  let opening!: Promise<CoursewareDocument>;
  await act(async () => { opening = result.current.open(doc.id); await Promise.resolve(); });
  await waitFor(() => expect(release).toBeTypeOf("function"));
  await act(async () => { await result.current.uploadImage("p", file, "upload-1"); });
  await act(async () => { release(initial); await opening; });
  expect(result.current.document).toMatchObject({ revision: 1, pages: [{ selectedImageId: "upload-1" }] });
  expect(result.current.detail?.images).toEqual(uploaded.images);
});

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import { fallbackSettings } from "../hooks/use-settings";
import { createBatch, fetchSettings, fetchHistory, fetchActiveBatch, uploadReferenceImage, fetchReferenceImage } from "../lib/api";
import { adoptEditor, createCourseware, createTextlessRun, fetchCourseware, listCoursewares, patchCourseware, uploadCoursewareImage, type CoursewareDocument } from "../lib/courseware-api";
import { saveEditorSession } from "../lib/editor-session";
vi.mock("../lib/api", () => ({ createBatch: vi.fn(), createChildTasks: vi.fn(), deleteBatch: vi.fn(), deleteImage: vi.fn(), exportBatch: vi.fn(), fetchActiveBatch: vi.fn(), fetchHistory: vi.fn(), fetchSettings: vi.fn(), pauseBatch: vi.fn(), resumeBatch: vi.fn(), retryTasks: vi.fn(), uploadReferenceImage: vi.fn(), fetchReferenceImage: vi.fn() }));
vi.mock("../lib/courseware-api", async (original) => ({ ...(await original<typeof import("../lib/courseware-api")>()), adoptEditor: vi.fn(), createCourseware: vi.fn(), createTextlessRun: vi.fn(), fetchCourseware: vi.fn(), listCoursewares: vi.fn(), patchCourseware: vi.fn(), uploadCoursewareImage: vi.fn(), listTextlessRuns: vi.fn().mockResolvedValue({ runs: [] }) }));
const model = fallbackSettings.roles.text.models[0];
const doc = (id = "a"): CoursewareDocument => ({ id, name: `课件-${id}`, sourceKind: "manual", rawImportText: null, importMode: null, legacyBatchId: null, globalReferenceImageId: null, revision: 0, pages: [{ id: `page-${id}`, position: 0, sourcePageNumber: "", sourcePageName: "", selectedImageId: null, included: true, draft: { prompt: `正文-${id}`, note: "", model: model.value, aspectRatio: model.aspectRatios[0], resolution: model.resolutions[0], referenceMode: "none", referenceImageId: null, n: 1 } }] });
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  localStorage.setItem("image-generator-courseware-session", JSON.stringify({ document: doc(), dirty: false }));
  vi.mocked(fetchSettings).mockResolvedValue(fallbackSettings);
  vi.mocked(fetchHistory).mockResolvedValue([]);
  vi.mocked(createCourseware).mockImplementation(async value => value);
  vi.mocked(uploadReferenceImage).mockResolvedValue({ id: "ref-a", filename: "reference.png", localPath: "local" });
  vi.mocked(fetchReferenceImage).mockResolvedValue({ id: "ref-a", filename: "reference.png", localPath: "local" });
  vi.mocked(fetchCourseware).mockImplementation(async (id) => ({ courseware: doc(id), tasks: [], images: [], links: [] }));
  vi.mocked(patchCourseware).mockImplementation(async (value) => ({ ...value, revision: value.revision + 1 }));
  vi.mocked(listCoursewares).mockResolvedValue({ coursewares: [{ id: "b", name: "课件-b", pageCount: 1, sourceKind: "manual", revision: 0, updatedAt: new Date().toISOString() }] });
  vi.mocked(fetchActiveBatch).mockResolvedValue({ batch: { id: "batch-a", name: "a", status: "completed", total_tasks: 1, success_count: 1, failed_count: 0, created_at: "" }, tasks: [], jobs: [], images: [], scheduler: { queued: 0, running: 0, completed: 1, failed: 0, unknown: 0, paused: false } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows pending save until the edited project reaches the server", async () => {
  let release!: (value: CoursewareDocument) => void;
  vi.mocked(patchCourseware).mockImplementationOnce(value => new Promise(resolve => { release = () => resolve({ ...value, revision: value.revision + 1 }); }));
  render(<App />);
  await screen.findByDisplayValue("正文-a");
  fireEvent.change(screen.getByLabelText("课件名称"), { target: { value: "尚未落盘" } });
  expect(screen.getByText("待保存")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "保存项目" }));
  await waitFor(() => expect(patchCourseware).toHaveBeenCalled());
  expect(screen.getByText("正在保存…")).toBeInTheDocument();
  await act(async () => release(doc("a")));
  expect(await screen.findByText("已保存到本机")).toBeInTheDocument();
});
it("keeps a retry control when first upload creates and remounts the courseware page", async () => {
  localStorage.clear();
  let saved: CoursewareDocument | null = null;
  vi.mocked(createCourseware).mockImplementation(async value => { saved = value; return value; });
  vi.mocked(fetchCourseware).mockImplementation(async () => ({ courseware: saved ?? doc(), tasks: [], links: [], images: [] }));
  vi.mocked(uploadCoursewareImage).mockRejectedValueOnce(new TypeError("首次上传连接中断")).mockImplementationOnce(async (_course, pageId, file, uploadId, revision) => ({ courseware: { ...saved!, revision: revision + 1, pages: saved!.pages.map(page => page.id === pageId ? { ...page, selectedImageId: uploadId } : page) }, tasks: [], links: [], images: [{ id: uploadId, source: "upload", courseware_id: saved!.id, page_id: pageId, filename: file.name, local_path: "local", validation_status: "valid" }] }));
  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: /^批量生成/ })).toBeDisabled());
  fireEvent.change(screen.getAllByLabelText("上传成品图")[0], { target: { files: [new File(["bytes"], "first-final.png", { type: "image/png" })] } });
  fireEvent.click(await screen.findByRole("button", { name: "重试上传 first-final.png" }));
  expect(await screen.findByRole("radio", { name: "上传图1 · 已选定稿" })).toBeChecked();
  expect(vi.mocked(uploadCoursewareImage).mock.calls[0][3]).toBe(vi.mocked(uploadCoursewareImage).mock.calls[1][3]);
});
it("persists shared references before the first generation in a new workspace", async () => {
  localStorage.clear();
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /^共用参考图$/ }));
  fireEvent.change(screen.getByLabelText("上传共用参考图"), { target: { files: [new File(["bytes"], "reference.png", { type: "image/png" })] } });
  const apply = screen.getByRole("button", { name: "应用共用参考图" });
  await waitFor(() => expect(apply).not.toBeDisabled());
  fireEvent.click(apply);
  await waitFor(() => expect(createCourseware).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(patchCourseware).toHaveBeenCalledWith(expect.objectContaining({ globalReferenceImageId: "ref-a" })));
  expect(createBatch).not.toHaveBeenCalled();
});
it("uploads an external final into the current page without generating an AI task", async () => {
  vi.mocked(uploadCoursewareImage).mockImplementation(async (_course, pageId, file, uploadId, revision) => ({ courseware: { ...doc(), revision: revision + 1, pages: doc().pages.map(page => ({ ...page, selectedImageId: uploadId })) }, tasks: [], links: [], images: [{ id: uploadId, source: "upload", courseware_id: "a", page_id: pageId, filename: file.name, local_path: "local", validation_status: "valid" }] }));
  render(<App />);
  await screen.findByDisplayValue("正文-a");
  const file = new File(["bytes"], "external.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("上传成品图"), { target: { files: [file] } });
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledWith("a", "page-a", file, expect.any(String), 0));
  expect(await screen.findByRole("radio", { name: "上传图1 · 已选定稿" })).toBeChecked();
  expect(createBatch).not.toHaveBeenCalled();
});
it("does not let a late settings/legacy restore overwrite the saved courseware", async () => {
  saveEditorSession({ rows: [{ id: "legacy", ...doc().pages[0].draft, prompt: "旧会话正文" }], editorResults: { tasks: [], images: [] }, activeBatchId: null });
  let release!: (value: typeof fallbackSettings) => void;
  vi.mocked(fetchSettings).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  render(<App />);
  await screen.findByDisplayValue("课件-a");
  await act(async () => release(fallbackSettings));
  await screen.findByDisplayValue("正文-a");
  expect(screen.queryByDisplayValue("旧会话正文")).not.toBeInTheDocument();
});
it("keeps prompt edits made while generation submission is pending", async () => {
  let release!: (value: Awaited<ReturnType<typeof createBatch>>) => void;
  vi.mocked(createBatch).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  render(<App />);
  const input = await screen.findByDisplayValue("正文-a");
  fireEvent.click(screen.getByText("生成这张图"));
  await waitFor(() => expect(createBatch).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: "提交期间的新正文" } });
  await act(async () => release({ batch: { id: "batch-a" }, tasks: [{ id: "task-a" }] }));
  expect(screen.getByDisplayValue("提交期间的新正文")).toBeInTheDocument();
});
it("does not insert a late generation response from A into newly opened B", async () => {
  let release!: (value: Awaited<ReturnType<typeof createBatch>>) => void;
  vi.mocked(createBatch).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  render(<App />);
  await screen.findByDisplayValue("正文-a");
  fireEvent.click(screen.getByText("生成这张图"));
  await waitFor(() => expect(createBatch).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "历史项目" }));
  fireEvent.click(await screen.findByText("课件-b"));
  await screen.findByDisplayValue("正文-b");
  await act(async () => release({ batch: { id: "batch-a" }, tasks: [{ id: "task-a" }] }));
  expect(screen.getByDisplayValue("正文-b")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("正文-a")).not.toBeInTheDocument();
});

it("saves A before creating a blank B and restores B without old rows", async () => {
  let savedB: CoursewareDocument | null = null;
  vi.mocked(createCourseware).mockImplementation(async value => { savedB = value; return value; });
  vi.mocked(fetchCourseware).mockImplementation(async id => ({ courseware: id === savedB?.id ? savedB : doc(id), tasks: [], images: [], links: [] }));
  const view = render(<App />);
  await screen.findByDisplayValue("正文-a");
  fireEvent.change(screen.getByLabelText("课件名称"), { target: { value: "项目 A 已保存" } });
  fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
  fireEvent.change(screen.getByLabelText("新项目名称"), { target: { value: "项目 B" } });
  fireEvent.click(screen.getByRole("button", { name: "创建空白项目" }));
  await waitFor(() => expect(createCourseware).toHaveBeenCalledWith(expect.objectContaining({ name: "项目 B", pages: [], globalReferenceImageId: null })));
  expect(patchCourseware).toHaveBeenCalledWith(expect.objectContaining({ name: "项目 A 已保存" }));
  expect(await screen.findByText("还没有页面")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("正文-a")).not.toBeInTheDocument();
  expect(screen.queryByText("第 5 页")).not.toBeInTheDocument();
  view.unmount();
  render(<App />);
  expect(await screen.findByDisplayValue("项目 B")).toBeInTheDocument();
  expect(screen.getByText("还没有页面")).toBeInTheDocument();
});

it("keeps A active if its save fails before creating B", async () => {
  vi.mocked(patchCourseware).mockRejectedValue(new Error("保存失败"));
  render(<App />);
  await screen.findByDisplayValue("正文-a");
  fireEvent.change(screen.getByLabelText("课件名称"), { target: { value: "未保存的 A" } });
  fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
  fireEvent.change(screen.getByLabelText("新项目名称"), { target: { value: "项目 B" } });
  fireEvent.click(screen.getByRole("button", { name: "创建空白项目" }));
  expect(await screen.findByDisplayValue("未保存的 A")).toBeInTheDocument();
  expect(createCourseware).not.toHaveBeenCalled();
});

it("saves images from two old generation batches before opening a new project", async () => {
  localStorage.clear();
  const draft = doc().pages[0].draft;
  const rows = [
    { id: "page-old-a", ...draft, prompt: "旧图 A", submittedTaskId: "task-old-a" },
    { id: "page-old-b", ...draft, prompt: "旧图 B", submittedTaskId: "task-old-b" }
  ];
  const task = (id: string, batch_id: string) => ({ id, batch_id, prompt: id, model: draft.model, size: draft.aspectRatio, n: 1, status: "completed" });
  saveEditorSession({ rows, editorResults: { tasks: [task("task-old-a", "batch-old-a"), task("task-old-b", "batch-old-b")], images: [] }, activeBatchId: "batch-old-b" });
  let savedOld: CoursewareDocument | null = null;
  vi.mocked(adoptEditor).mockImplementation(async (document) => { savedOld = document; return document; });
  vi.mocked(fetchCourseware).mockImplementation(async id => ({ courseware: id === savedOld?.id ? savedOld : doc(id), tasks: [], images: [], links: [] }));
  render(<App />);
  await screen.findByDisplayValue("旧图 A");
  fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
  fireEvent.change(screen.getByLabelText("新项目名称"), { target: { value: "新项目" } });
  fireEvent.click(screen.getByRole("button", { name: "创建空白项目" }));
  await waitFor(() => expect(adoptEditor).toHaveBeenCalledWith(expect.objectContaining({ sourceKind: "legacy-session", pages: [expect.objectContaining({ id: "page-old-a" }), expect.objectContaining({ id: "page-old-b" })] }), [{ pageId: "page-old-a", taskId: "task-old-a" }, { pageId: "page-old-b", taskId: "task-old-b" }]));
  expect(vi.mocked(adoptEditor).mock.calls[0][0].pages).toHaveLength(2);
  expect(await screen.findByText("还没有页面")).toBeInTheDocument();
});

it("creates an independent image project and submits textless from that project's selected images", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1920, height: 1080, close() {} })));
  let savedB: CoursewareDocument = doc("uncreated");
  const images: Array<{ id: string; source: "upload"; courseware_id: string; page_id: string; filename: string; local_path: string; validation_status: "valid" }> = [];
  vi.mocked(createCourseware).mockImplementation(async value => { savedB = value; return value; });
  vi.mocked(fetchCourseware).mockImplementation(async id => ({ courseware: id === savedB.id ? savedB : doc(id), tasks: [], links: [], images }));
  vi.mocked(uploadCoursewareImage).mockImplementation(async (id, pageId, file, uploadId, revision) => {
    savedB = { ...savedB!, revision: revision + 1, pages: savedB!.pages.map(page => page.id === pageId ? { ...page, selectedImageId: uploadId } : page) };
    images.push({ id: uploadId, source: "upload", courseware_id: id, page_id: pageId, filename: file.name, local_path: "local", validation_status: "valid" });
    return { courseware: savedB, tasks: [], links: [], images: [...images] };
  });
  vi.mocked(createTextlessRun).mockImplementation(async (current, _model, requestId, pageIds) => ({ run: { id: "run-b", coursewareId: current.id, model: "image", requestId, sourceRevision: current.revision, promptText: "去字", manifest: [] }, pages: [], tasks: [], images: [] }));
  render(<App />);
  await screen.findByDisplayValue("正文-a");
  fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
  fireEvent.change(screen.getByLabelText("新项目名称"), { target: { value: "项目 B" } });
  fireEvent.click(screen.getByRole("button", { name: "从成品图片创建" }));
  fireEvent.change(screen.getByLabelText("批量成品图片"), { target: { files: [new File(["a"], "10.png", { type: "image/png" }), new File(["b"], "2.png", { type: "image/png" })] } });
  expect(await screen.findByText("2.png")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "创建项目并导入 2 张" }));
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledTimes(2));
  const imported = savedB;
  expect(imported.id).not.toBe("a");
  expect(imported.pages.map(page => page.sourcePageName)).toEqual(["2", "10"]);
  expect(imported.pages.map(page => page.selectedImageId)).toEqual(images.map(image => image.id));
  expect(createBatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "关闭导入" }));
  fireEvent.click(screen.getByRole("button", { name: "无文字版本" }));
  fireEvent.click(await screen.findByRole("button", { name: "生成无文字版" }));
  await waitFor(() => expect(createTextlessRun).toHaveBeenCalledWith(expect.objectContaining({ id: imported.id, pages: expect.arrayContaining([expect.objectContaining({ selectedImageId: images[0].id })]) }), expect.any(String), expect.any(String), imported.pages.map(page => page.id), false));
});

it("stops after the current upload and keeps completed pages for continuation", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1920, height: 1080, close() {} })));
  let savedB: CoursewareDocument = doc("uncreated");
  let finishFirst!: () => void;
  const firstPending = new Promise<void>(resolve => { finishFirst = resolve; });
  const images: Array<{ id: string; source: "upload"; courseware_id: string; page_id: string; filename: string; local_path: string; validation_status: "valid" }> = [];
  vi.mocked(createCourseware).mockImplementation(async value => { savedB = value; return value; });
  vi.mocked(fetchCourseware).mockImplementation(async id => ({ courseware: id === savedB.id ? savedB : doc(id), tasks: [], links: [], images }));
  vi.mocked(uploadCoursewareImage).mockImplementation(async (id, pageId, file, uploadId, revision) => {
    if (file.name === "1.png") await firstPending;
    savedB = { ...savedB, revision: revision + 1, pages: savedB.pages.map(page => page.id === pageId ? { ...page, selectedImageId: uploadId } : page) };
    images.push({ id: uploadId, source: "upload", courseware_id: id, page_id: pageId, filename: file.name, local_path: "local", validation_status: "valid" });
    return { courseware: savedB, tasks: [], links: [], images: [...images] };
  });
  render(<App />);
  await screen.findByDisplayValue("正文-a");
  fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
  fireEvent.click(screen.getByRole("button", { name: "从成品图片创建" }));
  fireEvent.change(screen.getByLabelText("批量成品图片"), { target: { files: [new File(["a"], "1.png", { type: "image/png" }), new File(["b"], "2.png", { type: "image/png" })] } });
  await screen.findByText("1.png");
  fireEvent.click(screen.getByRole("button", { name: "创建项目并导入 2 张" }));
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "停止后续上传" }));
  await act(async () => finishFirst());
  expect(await screen.findByText(/已成功 1 张.*已停止后续上传/)).toBeInTheDocument();
  expect(uploadCoursewareImage).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "继续导入剩余图片" }));
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledTimes(2));
  expect(images.map(image => image.filename)).toEqual(["1.png", "2.png"]);
});

it("resumes only a failed image after refreshing the new project", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1920, height: 1080, close() {} })));
  let savedB: CoursewareDocument = doc("uncreated");
  const images: Array<{ id: string; source: "upload"; courseware_id: string; page_id: string; filename: string; local_path: string; validation_status: "valid" }> = [];
  let failSecond = true;
  vi.mocked(createCourseware).mockImplementation(async value => { savedB = value; return value; });
  vi.mocked(fetchCourseware).mockImplementation(async id => ({ courseware: id === savedB.id ? savedB : doc(id), tasks: [], links: [], images: id === savedB.id ? images : [] }));
  vi.mocked(uploadCoursewareImage).mockImplementation(async (id, pageId, file, uploadId, revision) => {
    if (file.name === "2.png" && failSecond) { failSecond = false; throw new Error("临时上传失败"); }
    savedB = { ...savedB, revision: revision + 1, pages: savedB.pages.map(page => page.id === pageId ? { ...page, selectedImageId: uploadId } : page) };
    images.push({ id: uploadId, source: "upload", courseware_id: id, page_id: pageId, filename: file.name, local_path: "local", validation_status: "valid" });
    return { courseware: savedB, tasks: [], links: [], images: [...images] };
  });
  const first = new File(["a"], "1.png", { type: "image/png", lastModified: 100 });
  const second = new File(["b"], "2.png", { type: "image/png", lastModified: 200 });
  const view = render(<App />);
  await screen.findByDisplayValue("正文-a");
  fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
  fireEvent.click(screen.getByRole("button", { name: "从成品图片创建" }));
  fireEvent.change(screen.getByLabelText("批量成品图片"), { target: { files: [second, first] } });
  await screen.findByText("1.png");
  fireEvent.click(screen.getByRole("button", { name: "创建项目并导入 2 张" }));
  expect(await screen.findByText(/已成功 1 张.*失败 1 张/)).toBeInTheDocument();
  const failedUploadId = vi.mocked(uploadCoursewareImage).mock.calls[1][3];
  view.unmount();
  render(<App />);
  await screen.findByDisplayValue(savedB.name);
  fireEvent.click(screen.getByRole("button", { name: "继续导入图片" }));
  fireEvent.change(screen.getByLabelText("批量成品图片"), { target: { files: [second] } });
  fireEvent.click(await screen.findByRole("button", { name: "重试失败项" }));
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledTimes(3));
  expect(vi.mocked(uploadCoursewareImage).mock.calls[2][3]).toBe(failedUploadId);
  expect(vi.mocked(createCourseware)).toHaveBeenCalledTimes(1);
  expect(images.map(image => image.filename)).toEqual(["1.png", "2.png"]);
});

it("fills the current blank project with images without creating another project", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1920, height: 1080, close() {} })));
  let savedB: CoursewareDocument = doc("uncreated");
  const images: Array<{ id: string; source: "upload"; courseware_id: string; page_id: string; filename: string; local_path: string; validation_status: "valid" }> = [];
  vi.mocked(createCourseware).mockImplementation(async value => { savedB = value; return value; });
  vi.mocked(patchCourseware).mockImplementation(async value => { savedB = { ...value, revision: value.revision + 1 }; return savedB; });
  vi.mocked(fetchCourseware).mockImplementation(async id => ({ courseware: id === savedB.id ? savedB : doc(id), tasks: [], links: [], images }));
  vi.mocked(uploadCoursewareImage).mockImplementation(async (id, pageId, file, uploadId, revision) => {
    savedB = { ...savedB, revision: revision + 1, pages: savedB.pages.map(page => page.id === pageId ? { ...page, selectedImageId: uploadId } : page) };
    images.push({ id: uploadId, source: "upload", courseware_id: id, page_id: pageId, filename: file.name, local_path: "local", validation_status: "valid" });
    return { courseware: savedB, tasks: [], links: [], images: [...images] };
  });
  render(<App />);
  await screen.findByDisplayValue("正文-a");
  fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
  fireEvent.change(screen.getByLabelText("新项目名称"), { target: { value: "空白 B" } });
  fireEvent.click(screen.getByRole("button", { name: "创建空白项目" }));
  await screen.findByText("还没有页面");
  const projectId = savedB.id;
  fireEvent.click(screen.getByRole("button", { name: "批量上传成品图" }));
  fireEvent.change(screen.getByLabelText("批量成品图片"), { target: { files: [new File(["a"], "cover.png", { type: "image/png" })] } });
  await screen.findByText("cover.png");
  fireEvent.click(screen.getByRole("button", { name: "导入 1 张到当前项目" }));
  await waitFor(() => expect(uploadCoursewareImage).toHaveBeenCalledTimes(1));
  expect(vi.mocked(createCourseware)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(uploadCoursewareImage).mock.calls[0][0]).toBe(projectId);
  expect(savedB).toMatchObject({ id: projectId, name: "空白 B", pages: [{ selectedImageId: images[0].id }] });
});

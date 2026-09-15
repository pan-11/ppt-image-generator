import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TextlessPanel } from "../components/courseware/textless-panel";
import { createTextlessRun, listTextlessRuns, fetchTextlessRun, restoreTextlessRun, type CoursewareDocument, type TextlessDetail } from "../lib/courseware-api";
import { retryTasks } from "../lib/api";
vi.mock("../lib/api", () => ({ retryTasks: vi.fn() }));
vi.mock("../lib/courseware-api", async (original) => ({ ...(await original<typeof import("../lib/courseware-api")>()), createTextlessRun: vi.fn(), listTextlessRuns: vi.fn(), fetchTextlessRun: vi.fn(), restoreTextlessRun: vi.fn() }));
const models = [{ value: "gpt-image-2", label: "模型", aspectRatios: ["16:9"], resolutions: ["1K"], maxN: 1, supportsReferenceImages: true }];
const doc = (id: string): CoursewareDocument => ({ id, name: id, sourceKind: "manual", revision: 0, rawImportText: null, importMode: null, globalReferenceImageId: null, legacyBatchId: null, pages: [{ id: `page-${id}`, position: 0, sourcePageNumber: "", sourcePageName: id, selectedImageId: `source-${id}`, included: true, draft: { prompt: id, note: "", model: "gpt-image-2", aspectRatio: "16:9", resolution: "1K", n: 1, referenceMode: "none", referenceImageId: null } }] });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(listTextlessRuns).mockResolvedValue({ runs: [] }); });
afterEach(cleanup);
it("ignores a late textless response after the courseware changes", async () => {
  let release!: (detail: TextlessDetail) => void;
  vi.mocked(createTextlessRun).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const { rerender } = render(<TextlessPanel open document={doc("a")} models={models} flush={async () => doc("a")} onClose={() => {}} />);
  fireEvent.click(screen.getByText("生成无文字版"));
  await waitFor(() => expect(createTextlessRun).toHaveBeenCalledTimes(1));
  rerender(<TextlessPanel open document={doc("b")} models={models} flush={async () => doc("b")} onClose={() => {}} />);
  await act(async () => release({ run: { id: "run-a", coursewareId: "a", model: "旧课件模型", requestId: "r", sourceRevision: 0, promptText: "去字", manifest: [] }, pages: [], images: [], tasks: [] }));
  expect(screen.queryByText(/旧课件模型/)).not.toBeInTheDocument();
  expect(screen.queryByText("导出本次定稿 PPT")).not.toBeInTheDocument();
});
it("reuses the request ID after an uncertain network response", async () => {
  vi.mocked(createTextlessRun).mockRejectedValue(new Error("网络中断"));
  render(<TextlessPanel open document={doc("a")} models={models} flush={async () => doc("a")} onClose={() => {}} />);
  fireEvent.click(screen.getByText("生成无文字版"));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("生成无文字版"));
  await waitFor(() => expect(createTextlessRun).toHaveBeenCalledTimes(2));
  expect(vi.mocked(createTextlessRun).mock.calls[1][2]).toBe(vi.mocked(createTextlessRun).mock.calls[0][2]);
});

it("summarizes included pages before controls and collapses the full manifest", async () => {
  const document = doc("a");
  document.pages = Array.from({ length: 24 }, (_, position) => ({ ...document.pages[0], id: `page-${position}`, position, included: position < 23, selectedImageId: position < 20 ? `source-${position}` : null }));
  render(<TextlessPanel open document={document} models={models} flush={async () => document} onClose={() => {}} />);
  await waitFor(() => expect(listTextlessRuns).toHaveBeenCalled());
  expect(screen.getByText("参与 23 页")).toBeInTheDocument();
  expect(screen.getByText("已选定稿 20 页")).toBeInTheDocument();
  expect(screen.getByText("待选定稿 3 页")).toBeInTheDocument();
  const manifest = screen.getByText("查看 23 页明细").closest("details")!;
  expect(manifest.open).toBe(false);
  expect(screen.getByText("生成无文字版").compareDocumentPosition(manifest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByText("查看 23 页明细"));
  expect(manifest.querySelectorAll("li")).toHaveLength(23);
  expect(createTextlessRun).not.toHaveBeenCalled();
});

function loadedRun(statuses: string[]): TextlessDetail {
  const pages = statuses.map((status, i) => ({ pageId: `page-${i}`, position: i, pageLabel: `第 ${i + 1} 页`, sourceImageId: `source-${i}`, taskId: `task-${i}`, aspectRatio: "16:9", resolution: "1K", status, imageId: status === "completed" ? `result-${i}` : null }));
  return { run: { id: "loaded-run", coursewareId: "a", model: "gpt-image-2", requestId: "saved", sourceRevision: 0, promptText: "去字", manifest: pages }, pages, images: [], tasks: [] };
}

it("restores saved results on opening and displays their successful images", async () => {
  const detail = loadedRun(["completed"]);
  vi.mocked(listTextlessRuns).mockResolvedValue({ runs: [detail.run] });
  vi.mocked(restoreTextlessRun).mockResolvedValue(detail);
  vi.mocked(fetchTextlessRun).mockResolvedValue(loadedRun(["failed"]));
  render(<TextlessPanel open document={doc("a")} models={models} flush={async () => doc("a")} onClose={() => {}} />);
  expect(await screen.findByAltText("第 1 页无文字图")).toHaveAttribute("src", "/api/download/images/result-0");
  expect(restoreTextlessRun).toHaveBeenCalledWith("loaded-run");
  expect(screen.getByText("第 1 页 · 成功")).toBeInTheDocument();
  expect(retryTasks).not.toHaveBeenCalled();
});

it("retries only failed pages once and preserves successful and running pages", async () => {
  const detail = loadedRun(["failed", "completed", "running", "failed"]);
  vi.mocked(listTextlessRuns).mockResolvedValue({ runs: [detail.run] });
  vi.mocked(restoreTextlessRun).mockResolvedValue(detail);
  vi.mocked(fetchTextlessRun).mockResolvedValue(loadedRun(["queued", "completed", "running", "queued"]));
  let release!: (value: { retriedJobs: number; affectedTasks: number }) => void;
  vi.mocked(retryTasks).mockImplementation(() => new Promise(resolve => { release = resolve; }));
  render(<TextlessPanel open document={doc("a")} models={models} flush={async () => doc("a")} onClose={() => {}} />);
  const button = await screen.findByRole("button", { name: "重试失败页（2）" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(retryTasks).toHaveBeenCalledExactlyOnceWith(["task-0", "task-3"]));
  expect(screen.getByLabelText("处理记录")).toBeDisabled();
  await act(async () => release({ retriedJobs: 2, affectedTasks: 2 }));
  await waitFor(() => expect(screen.getByRole("button", { name: "重试失败页（0）" })).toBeDisabled());
  expect(screen.getByAltText("第 2 页无文字图")).toHaveAttribute("src", "/api/download/images/result-1");
  expect(createTextlessRun).not.toHaveBeenCalled();
});

it("disables bulk retry when every page is successful", async () => {
  const detail = loadedRun(["completed", "completed"]);
  vi.mocked(listTextlessRuns).mockResolvedValue({ runs: [detail.run] });
  vi.mocked(restoreTextlessRun).mockResolvedValue(detail);
  render(<TextlessPanel open document={doc("a")} models={models} flush={async () => doc("a")} onClose={() => {}} />);
  expect(await screen.findByRole("button", { name: "重试失败页（0）" })).toBeDisabled();
  expect(retryTasks).not.toHaveBeenCalled();
});

it("ignores a restored record after switching courseware", async () => {
  const detail = loadedRun(["completed"]);
  vi.mocked(listTextlessRuns).mockResolvedValueOnce({ runs: [detail.run] }).mockResolvedValue({ runs: [] });
  let release!: (value: TextlessDetail) => void;
  vi.mocked(restoreTextlessRun).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const view = render(<TextlessPanel open document={doc("a")} models={models} flush={async () => doc("a")} onClose={() => {}} />);
  await waitFor(() => expect(restoreTextlessRun).toHaveBeenCalled());
  view.rerender(<TextlessPanel open document={doc("b")} models={models} flush={async () => doc("b")} onClose={() => {}} />);
  await act(async () => release(detail));
  expect(screen.queryByAltText("第 1 页无文字图")).not.toBeInTheDocument();
});

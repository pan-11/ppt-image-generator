import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TextlessPanel } from "../components/courseware/textless-panel";
import { createTextlessRun, listTextlessRuns, type CoursewareDocument, type TextlessDetail } from "../lib/courseware-api";
vi.mock("../lib/courseware-api", async (original) => ({ ...(await original<typeof import("../lib/courseware-api")>()), createTextlessRun: vi.fn(), listTextlessRuns: vi.fn(), fetchTextlessRun: vi.fn() }));
const models = [{ value: "gpt-image-2", label: "模型", aspectRatios: ["16:9"], resolutions: ["1K"], maxN: 1, supportsReferenceImages: true }];
const doc = (id: string): CoursewareDocument => ({ id, name: id, sourceKind: "manual", revision: 0, rawImportText: null, importMode: null, globalReferenceImageId: null, legacyBatchId: null, pages: [{ id: `page-${id}`, position: 0, sourcePageNumber: "", sourcePageName: id, selectedImageId: `source-${id}`, included: true, draft: { prompt: id, note: "", model: "gpt-image-2", aspectRatio: "16:9", resolution: "1K", n: 1, referenceMode: "none", referenceImageId: null } }] });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(listTextlessRuns).mockResolvedValue({ runs: [] }); });
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

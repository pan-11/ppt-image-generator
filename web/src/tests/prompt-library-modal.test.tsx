import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptLibraryModal } from "../components/courseware/prompt-library-modal";
import type { CoursewareDocument } from "../lib/courseware-api";
const doc: CoursewareDocument = { id: "cw", name: "课件", revision: 0, sourceKind: "import", rawImportText: "原始总标题\n原文", importMode: "lines", legacyBatchId: null, globalReferenceImageId: null, pages: [] };
afterEach(cleanup);
describe("prompt library", () => {
  it("copies original input and reports rejection without claiming success", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<PromptLibraryModal open document={doc} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("内容来源"), { target: { value: "original" } });
    fireEvent.click(screen.getByText("复制全部"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("复制失败"));
    expect(writeText).toHaveBeenCalledWith(doc.rawImportText);
    expect(screen.getByLabelText("提示词预览")).toHaveValue(doc.rawImportText);
  });
  it("explains that historical originals were never saved", () => {
    render(<PromptLibraryModal open document={{ ...doc, rawImportText: null }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("内容来源"), { target: { value: "original" } });
    expect(screen.getByText("复制全部")).toBeDisabled();
    expect(screen.getByText(/没有保存过导入原文/)).toBeInTheDocument();
  });
});

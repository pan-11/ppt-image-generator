import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PageSelectionPanel } from "../components/courseware/page-selection-panel";
import type { CoursewareDetail, CoursewarePage } from "../lib/courseware-api";
const page: CoursewarePage = { id: "p1", position: 0, sourcePageName: "封面", sourcePageNumber: "", included: true, selectedImageId: "original", draft: { prompt: "草稿", note: "", model: "gpt-image-2", aspectRatio: "16:9", resolution: "1K", n: 1, referenceMode: "none", referenceImageId: null } };
afterEach(cleanup);
it("selects a grandchild instead of its original and copies the actual candidate prompt", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const detail = { links: ["original", "child", "grandchild"].map((id) => ({ pageId: "p1", taskId: id, purpose: id === "original" ? "original" : "variation" })), images: ["original", "child", "grandchild"].map((id) => ({ id, task_id: id, validation_status: "valid" })), tasks: ["original", "child", "grandchild"].map((id) => ({ id, prompt: `实际-${id}` })) } as CoursewareDetail;
  function Harness() { const [current, setCurrent] = useState(page); return <PageSelectionPanel page={current} detail={detail} onChange={setCurrent} onMove={() => {}} first last />; }
  render(<Harness />);
  const radios = screen.getAllByRole("radio");
  fireEvent.click(radios[2]);
  expect(radios.filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(1);
  expect(radios[0]).not.toBeChecked();
  expect(radios[2]).toBeChecked();
  fireEvent.click(screen.getAllByText("复制该图提示词")[2]);
  expect(writeText).toHaveBeenCalledWith("实际-grandchild");
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
});
it("allows clearing a deleted final image so the page can be saved again", () => {
  const change = vi.fn();
  render(<PageSelectionPanel page={page} detail={{ links: [], tasks: [], images: [] } as unknown as CoursewareDetail} onChange={change} onMove={() => {}} first last />);
  fireEvent.click(screen.getByText("清除失效定稿"));
  expect(change).toHaveBeenCalledWith({ ...page, selectedImageId: null });
});

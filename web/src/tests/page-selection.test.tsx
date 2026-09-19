import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getPageCandidates, PageCandidateStrip, PageSelectionPanel } from "../components/courseware/page-selection-panel";
import type { TaskRecord } from "../lib/types";
import type { CoursewareDetail, CoursewarePage } from "../lib/courseware-api";
const page: CoursewarePage = { id: "p1", position: 0, sourcePageName: "封面", sourcePageNumber: "", included: true, selectedImageId: "original", draft: { prompt: "草稿", note: "", model: "gpt-image-2", aspectRatio: "16:9", resolution: "1K", n: 1, referenceMode: "none", referenceImageId: null } };
afterEach(cleanup);
it("includes only uploaded candidates belonging to this page without requiring a generation task", () => {
  const detail = { courseware: { id: "course" }, links: [], tasks: [], images: [
    { id: "upload", source: "upload", page_id: "p1", courseware_id: "course" },
    { id: "other", source: "upload", page_id: "p2", courseware_id: "course" }
  ] } as unknown as CoursewareDetail;
  expect(getPageCandidates({ page, detail, onChange: vi.fn(), onMove: vi.fn(), first: true, last: true }).map(image => image.id)).toEqual(["upload"]);
});
it("uploads final images separately and retries with the same operation id", async () => {
  const upload = vi.fn().mockRejectedValueOnce(new Error("连接中断")).mockResolvedValue(undefined);
  render(<PageCandidateStrip candidates={[]} tasks={[]} onUpload={upload} />);
  fireEvent.change(screen.getByLabelText("上传成品图"), { target: { files: [new File(["png"], "final.png", { type: "image/png" })] } });
  await screen.findByText("连接中断");
  fireEvent.click(screen.getByRole("button", { name: "重试上传" }));
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  expect(upload.mock.calls[0][1]).toBe(upload.mock.calls[1][1]);
});
it("labels external candidates without offering a fictitious generation prompt", () => {
  render(<PageCandidateStrip candidates={[{ id: "upload", source: "upload", filename: "external.png", local_path: "local" }]} tasks={[]} />);
  expect(screen.getByText("上传图1")).toBeVisible();
  expect(screen.queryByRole("button", { name: "复制该图提示词" })).not.toBeInTheDocument();
});
it("selects a grandchild instead of its original and copies the actual candidate prompt", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const detail = { links: ["original", "child", "grandchild"].map((id) => ({ pageId: "p1", taskId: id, purpose: id === "original" ? "original" : "variation" })), images: ["original", "child", "grandchild"].map((id) => ({ id, task_id: id, validation_status: "valid" })), tasks: ["original", "child", "grandchild"].map((id) => ({ id, prompt: `实际-${id}` })) } as CoursewareDetail;
  function Harness() { const [current, setCurrent] = useState(page); return <PageSelectionPanel page={current} detail={detail} onChange={setCurrent} onMove={() => {}} first last />; }
  render(<Harness />);
  const radios = screen.getAllByRole("radio");
  expect(screen.getByRole("radio", { name: "原图1 · 已选定稿" })).toBeChecked();
  fireEvent.click(radios[2]);
  expect(screen.getByRole("radio", { name: "改图2 · 已选定稿" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "原图1 · 设为定稿" })).not.toBeChecked();
  expect(radios[2].closest("article")).toHaveClass("is-selected");
  expect(radios.filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(1);
  expect(radios[0]).not.toBeChecked();
  expect(radios[2]).toBeChecked();
  fireEvent.click(screen.getAllByRole("button", { name: "复制该图提示词" })[2]);
  expect(writeText).toHaveBeenCalledWith("实际-grandchild");
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
});
it("allows clearing a deleted final image so the page can be saved again", () => {
  const change = vi.fn();
  render(<PageSelectionPanel page={page} detail={{ links: [], tasks: [], images: [] } as unknown as CoursewareDetail} onChange={change} onMove={() => {}} first last />);
  fireEvent.click(screen.getByText("清除失效定稿"));
  expect(change).toHaveBeenCalledWith({ ...page, selectedImageId: null });
});

it("shows exact original and descendant source labels and retains them across candidate polling order changes", () => {
  const candidates = ["original", "child", "grandchild"].map((id) => ({ id, task_id: id, filename: `${id}.png`, local_path: id }));
  const tasks = candidates.map((image, index) => ({ id: image.id, parent_image_id: index ? candidates[index - 1].id : null })) as TaskRecord[];
  const { rerender } = render(<PageCandidateStrip candidates={candidates} tasks={tasks} />);
  expect(screen.getByText("原图1")).toBeVisible();
  expect(screen.getByText("改图1")).toBeVisible();
  expect(screen.getByText("改图2")).toBeVisible();
  expect(screen.getByText("基于原图1")).toHaveAttribute("title", "original.png · 子图提示词需配合参考图使用");
  expect(screen.getByText("基于改图1")).toHaveAttribute("title", "child.png · 子图提示词需配合参考图使用");
  rerender(<PageCandidateStrip candidates={[...candidates].reverse()} tasks={tasks.map((task) => ({ ...task }))} />);
  expect(screen.getByRole("button", { name: "查看 grandchild.png 大图" }).closest("article")).toHaveTextContent("基于改图1");
  expect(screen.getByRole("button", { name: "查看 child.png 大图" }).closest("article")).toHaveTextContent("基于原图1");
  expect(screen.getByText("改图2").closest("article")).toContainElement(screen.getByRole("button", { name: "查看 grandchild.png 大图" }));
  rerender(<PageCandidateStrip candidates={[{ id: "new", task_id: "original", filename: "new.png", local_path: "new" }, ...candidates]} tasks={tasks} />);
  expect(screen.getByText("原图2").closest("article")).toContainElement(screen.getByRole("button", { name: "查看 new.png 大图" }));
  expect(screen.getByText("改图2").closest("article")).toContainElement(screen.getByRole("button", { name: "查看 grandchild.png 大图" }));
});

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskRow } from "../components/tasks/task-row";
import type { PageSelectionProps } from "../components/courseware/page-selection-panel";
import type { ImageRecord, TaskDraft, TaskRecord } from "../lib/types";

afterEach(() => {
  cleanup();
});

describe("TaskRow previews", () => {
  it("renders compact previews and opens a larger dialog on click", async () => {
    const user = userEvent.setup();

    render(<Harness />);

    const preview = screen.getByRole("button", { name: "查看 scene.png 大图" });
    expect(preview).toBeInTheDocument();

    await user.click(preview);

    expect(screen.getByRole("dialog", { name: "图片预览" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "scene.png" })).toHaveAttribute("src", "/api/download/images/image-1");
    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "图片预览" })).not.toBeInTheDocument();
    expect(preview).toHaveFocus();
  });

  it("keeps the prompt mounted while showing one compact candidate strip", () => {
    const { container } = render(<Harness />);

    const promptEditor = screen.getByPlaceholderText("输入提示词");
    const preview = screen.getByRole("button", { name: "查看 scene.png 大图" });

    expect(promptEditor).not.toBeVisible();
    expect(container.querySelector(".workbench-page-detail")).toContainElement(promptEditor);
    expect(container.querySelector(".workbench-page-candidates")).toContainElement(preview);
  });

  it("can generate only this prompt row", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();

    render(<Harness onGenerate={onGenerate} />);

    await user.click(screen.getByRole("button", { name: "生成这张图" }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("always creates child drafts from the image-role capabilities", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "基于此图修改" }));
    expect(screen.getByText(/以这个图为参考图 · 图生图 · Image Relay/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "参数" }));

    const imageModel = screen.getAllByRole("combobox", { name: "模型" })
      .find((element) => (element as HTMLSelectElement).value === "gpt-image-2") as HTMLSelectElement;
    expect(imageModel).toBeInTheDocument();
    expect(Array.from(imageModel.options).map((option) => option.value))
      .not.toContain("gemini-2.5-flash-image-preview");
  });
});

it("preserves source-bound child drafts and settings across collapse, switching and polling", async () => {
  const user = userEvent.setup();
  const onCreateChildTasks = vi.fn().mockResolvedValue([]);
  const images = ["image-1", "image-2", "image-3"].map((id, index) => ({ id, task_id: `task-${index + 1}`, filename: `${id}.png`, local_path: id }));
  const tasks = images.map((image, index) => ({ id: image.task_id, prompt: `source-${index}`, model: "gpt-image-2", aspect_ratio: "16:9", resolution: "2K", n: 1, size: "", status: "completed", parent_image_id: index ? images[index - 1].id : null })) as TaskRecord[];
  const { rerender } = render(<Harness images={images} tasks={tasks} onCreateChildTasks={onCreateChildTasks} />);
  expect(screen.getAllByRole("button", { name: /查看 .* 大图/ })).toHaveLength(3);
  const edit = () => screen.getAllByRole("button", { name: "基于此图修改" });
  await user.click(edit()[0]);
  await user.type(screen.getByRole("textbox", { name: "子提示词 1" }), "keep original draft");
  await user.click(screen.getByRole("button", { name: "新增一条" }));
  await user.type(screen.getByRole("textbox", { name: "子提示词 2" }), "second child");
  await user.click(screen.getByRole("button", { name: "参数" }));
  fireEvent.change(screen.getAllByRole("spinbutton", { name: "张数" })[1], { target: { value: "3" } });
  await user.click(edit()[2]);
  await user.type(screen.getByRole("textbox", { name: "子提示词 1" }), "grandchild source edit");
  await user.click(edit()[2]);
  expect(screen.queryByRole("textbox", { name: "子提示词 1" })).not.toBeInTheDocument();
  rerender(<Harness images={images.map((image) => ({ ...image }))} tasks={tasks.map((task) => ({ ...task }))} onCreateChildTasks={onCreateChildTasks} />);
  await user.click(edit()[0]);
  expect(screen.getByRole("textbox", { name: "子提示词 1" })).toHaveValue("keep original draft");
  expect(screen.getByRole("textbox", { name: "子提示词 2" })).toHaveValue("second child");
  expect(screen.getAllByRole("spinbutton", { name: "张数" })[1]).toHaveValue(3);
  await user.click(edit()[2]);
  expect(screen.getByRole("textbox", { name: "子提示词 1" })).toHaveValue("grandchild source edit");
  await user.click(screen.getByRole("button", { name: "生成子图" }));
  expect(onCreateChildTasks).toHaveBeenCalledWith("image-3", [expect.objectContaining({ prompt: "grandchild source edit" })]);
});

it("previews candidates without changing the final and keeps invalid and missing finals explicit", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const images = ["image-1", "image-2"].map((id) => ({ id, task_id: "task-1", filename: `${id}.png`, local_path: id, validation_status: id === "image-1" ? "valid" : "invalid" }));
  const selection = { page: { id: "p1", position: 0, sourcePageName: "", sourcePageNumber: "", included: true, selectedImageId: "image-1", draft: {} }, detail: { images, tasks: [], links: [{ pageId: "p1", taskId: "task-1", purpose: "original" }] }, onChange, onMove: vi.fn(), first: true, last: true } as unknown as PageSelectionProps;
  const { rerender } = render(<Harness selection={selection} />);
  expect(screen.getAllByRole("img")).toHaveLength(2);
  expect(screen.getAllByRole("radio")[0]).toBeChecked();
  expect(screen.getAllByRole("radio")[1]).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "查看 image-2.png 大图" }));
  expect(within(screen.getByRole("dialog")).getByRole("img")).toHaveAttribute("src", "/api/download/images/image-2");
  expect(onChange).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  rerender(<Harness selection={{ ...selection, page: { ...selection.page, selectedImageId: "missing" }, detail: { ...selection.detail!, images: [] } }} />);
  expect(screen.getByText("定稿图片暂不可用，请检查图片是否仍存在。")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "清除失效定稿" }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ selectedImageId: null }));
});

function Harness(props: { onGenerate?: () => void; images?: ImageRecord[]; tasks?: TaskRecord[]; selection?: PageSelectionProps; onCreateChildTasks?: (parentImageId: string, tasks: TaskDraft[]) => Promise<TaskRecord[]> }) {
  const [row, setRow] = useState<TaskDraft>({
    id: "row-1",
    prompt: "draw a scene",
    note: "",
    model: "gemini-2.5-flash-image-preview",
    aspectRatio: "1:1",
    resolution: "1K",
    n: 1,
    referenceMode: "none",
    referenceImageId: null,
    submittedTaskId: "task-1"
  });

  const previews: ImageRecord[] = [
    {
      id: "image-1",
      task_id: "task-1",
      filename: "scene.png",
      local_path: "app-data/batch/scene.png"
    }
  ];

  return (
    <TaskRow
      rowNumber={1}
      row={row}
      roles={{
        text: {
          providerId: "text-relay",
          providerName: "Text Relay",
          protocolType: "toapis-async",
          maxConcurrency: 30,
          models: [{
            value: "gemini-2.5-flash-image-preview",
            label: "gemini-2.5-flash-image-preview",
            aspectRatios: ["1:1"],
            resolutions: ["1K"],
            maxN: 1,
            supportsReferenceImages: true
          }]
        },
        image: {
          providerId: "image-relay",
          providerName: "Image Relay",
          protocolType: "ym2-openai-images",
          maxConcurrency: 100,
          models: [{
            value: "gpt-image-2",
            label: "gpt-image-2（YM2）",
            aspectRatios: ["16:9"],
            resolutions: ["2K"],
            maxN: 10,
            supportsReferenceImages: true
          }]
        }
      }}
      globalReferenceImageId={null}
      previewImages={props.images ? props.images.filter((image) => image.task_id === "task-1") : previews}
      allImages={props.images}
      batchTasks={props.tasks}
      pageSelection={props.selection}
      onChange={setRow}
      onDuplicate={() => undefined}
      onDelete={() => undefined}
      onGenerate={props.onGenerate ?? (() => undefined)}
      onUploadReference={async () => ({
        id: "reference-1",
        filename: "ref.png",
        localPath: "ref.png"
      })}
      onCreateChildTasks={props.onCreateChildTasks ?? (async () => [])}
    />
  );
}

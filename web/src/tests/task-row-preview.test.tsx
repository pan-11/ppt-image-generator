import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskRow } from "../components/tasks/task-row";
import type { ImageRecord, TaskDraft } from "../lib/types";

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
  });

  it("places result previews directly after the prompt editor", () => {
    const { container } = render(<Harness />);

    const promptEditor = screen.getByPlaceholderText("输入提示词");
    const preview = screen.getByRole("button", { name: "查看 scene.png 大图" });

    expect(container.querySelector(".task-row-prompt-results")).toContainElement(promptEditor);
    expect(container.querySelector(".task-row-prompt-results")).toContainElement(preview);
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

    expect(screen.getByText("以这个图为参考图 · 图生图 · Image Relay")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "参数" }));

    const imageModel = screen.getAllByRole("combobox", { name: "模型" })
      .find((element) => (element as HTMLSelectElement).value === "gpt-image-2") as HTMLSelectElement;
    expect(imageModel).toBeInTheDocument();
    expect(Array.from(imageModel.options).map((option) => option.value))
      .not.toContain("gemini-2.5-flash-image-preview");
  });
});

function Harness(props: { onGenerate?: () => void }) {
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
      previewImages={previews}
      onChange={setRow}
      onDuplicate={() => undefined}
      onDelete={() => undefined}
      onGenerate={props.onGenerate ?? (() => undefined)}
      onUploadReference={async () => ({
        id: "reference-1",
        filename: "ref.png",
        localPath: "ref.png"
      })}
      onCreateChildTasks={async () => []}
    />
  );
}

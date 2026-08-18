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
      models={[
        {
          value: "gemini-2.5-flash-image-preview",
          label: "gemini-2.5-flash-image-preview",
          aspectRatios: ["1:1"],
          resolutions: ["1K"],
          maxN: 1,
          supportsReferenceImages: true
        }
      ]}
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

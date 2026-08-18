import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskTable } from "../components/tasks/task-table";
import type { TaskDraft } from "../lib/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TaskTable", () => {
  it("shows thirty empty prompt rows by default", () => {
    render(<Harness />);

    expect(screen.getAllByRole("textbox")).toHaveLength(30);
    expect(screen.getByText("第 1 张图")).toBeInTheDocument();
    expect(screen.getByText("第 30 张图")).toBeInTheDocument();
  });

  it("imports exactly the number of pasted line prompts", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "批量导入提示词" }));
    fireEvent.change(screen.getByTestId("bulk-paste-input"), {
      target: { value: "forest fox\nglass city" }
    });
    expect(screen.getByText("逐行格式 · 2 条")).toBeInTheDocument();
    await user.click(screen.getByTestId("bulk-import"));

    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getByDisplayValue("forest fox")).toBeInTheDocument();
    expect(screen.getByDisplayValue("glass city")).toBeInTheDocument();
  });

  it("previews and displays a structured page note", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const value = `【页面编号】P1
【页面名称】AI数学乐园系统故障
【生图提示词】生成故障页
【画面核心文字】系统异常
【关键画面元素】控制屏；警示灯`;

    await user.click(screen.getByRole("button", { name: "批量导入提示词" }));
    fireEvent.change(screen.getByTestId("bulk-paste-input"), { target: { value } });

    expect(screen.getByText("结构化格式 · 1 条")).toBeInTheDocument();
    expect(screen.getByText("P1 · AI数学乐园系统故障")).toBeInTheDocument();
    await user.click(screen.getByTestId("bulk-import"));

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByText("P1 · AI数学乐园系统故障")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/【生图提示词】/)).toBeInTheDocument();
  });

  it("keeps existing rows when replacement is cancelled", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness />);

    await user.type(screen.getAllByRole("textbox")[0], "existing prompt");
    await user.click(screen.getByRole("button", { name: "批量导入提示词" }));
    fireEvent.change(screen.getByTestId("bulk-paste-input"), {
      target: { value: "replacement prompt" }
    });
    await user.click(screen.getByTestId("bulk-import"));

    expect(confirm).toHaveBeenCalledWith("导入将替换当前任务列表，是否继续？");
    expect(screen.getByDisplayValue("existing prompt")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-paste-input")).toBeInTheDocument();
  });

  it("does not change existing rows when structured input is invalid", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getAllByRole("textbox")[0], "existing prompt");
    await user.click(screen.getByRole("button", { name: "批量导入提示词" }));
    fireEvent.change(screen.getByTestId("bulk-paste-input"), {
      target: {
        value: `【页面编号】P2
【页面名称】缺字段页面
【生图提示词】只有正文`
      }
    });

    expect(screen.getByText("P2 缺少：画面核心文字、关键画面元素")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-import")).toBeDisabled();
    expect(screen.getByDisplayValue("existing prompt")).toBeInTheDocument();
  });

  it("generates only the selected row", async () => {
    const user = userEvent.setup();
    const onGenerateRow = vi.fn();

    render(<Harness onGenerateRow={onGenerateRow} />);

    await user.type(screen.getAllByRole("textbox")[0], "single row prompt");
    await user.click(screen.getAllByRole("button", { name: "生成这张图" })[0]);

    expect(onGenerateRow).toHaveBeenCalledWith(0);
  });
});

function Harness(props: { onGenerateRow?: (index: number) => void }) {
  const [rows, setRows] = useState<TaskDraft[]>([]);

  return (
    <TaskTable
      rows={rows}
      defaults={{
        model: "gemini-2.5-flash-image-preview",
        aspectRatio: "1:1",
        resolution: "1K",
        n: 1,
        globalReferenceImageId: null
      }}
      settings={{
        models: [
          {
            value: "gemini-2.5-flash-image-preview",
            label: "gemini-2.5-flash-image-preview",
            aspectRatios: ["1:1", "16:9"],
            resolutions: ["1K"],
            maxN: 1,
            supportsReferenceImages: true
          }
        ],
        maxBatchSize: 100
      }}
      onRowsChange={setRows}
      generatingRowId={null}
      onGenerateRow={props.onGenerateRow ?? (() => undefined)}
      onUploadReferenceImage={async () => ({
        id: "reference-1",
        filename: "ref.png",
        localPath: "ref.png"
      })}
      onCreateChildTasks={async () => []}
    />
  );
}

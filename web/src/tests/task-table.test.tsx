import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskTable } from "../components/tasks/task-table";
import type { TaskDraft } from "../lib/types";

vi.mock("../lib/api", async (original) => ({ ...await original<object>(), fetchReferenceImage: vi.fn(async (id: string) => ({ id, filename: `${id}.png`, localPath: id })) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TaskTable", () => {
  it("starts with five empty tasks and lets the user add more", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getAllByRole("textbox", { hidden: true })).toHaveLength(5);
    expect(screen.getByText("第 1 页")).toBeInTheDocument();
    expect(screen.getByText("第 5 页")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新增页面" }));
    expect(screen.getAllByRole("textbox", { hidden: true })).toHaveLength(6);
    expect(screen.getByText("第 6 页")).toBeInTheDocument();
  });

  it("confirms removing only the current page and distinguishes page copying from prompt copying", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness />);
    await user.click(screen.getAllByText("更多")[0]);
    await user.click(screen.getAllByRole("button", { name: "移除当前页" })[0]);
    expect(confirm).toHaveBeenCalledWith("移除当前页？历史记录和已生成图片会保留。");
    expect(screen.getAllByPlaceholderText("输入提示词")).toHaveLength(5);
    confirm.mockReturnValue(true);
    await user.click(screen.getAllByRole("button", { name: "移除当前页" })[0]);
    expect(screen.getAllByPlaceholderText("输入提示词")).toHaveLength(4);
    await user.click(screen.getAllByText("更多")[0]);
    expect(screen.getAllByRole("button", { name: "复制本页提示词" })).toHaveLength(4);
    await user.click(screen.getAllByRole("button", { name: "复制页面" })[0]);
    expect(screen.getAllByPlaceholderText("输入提示词")).toHaveLength(5);
  });

  it("resets mounted row disclosure state when courseware scope changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness referenced scope="courseware-a" />);
    expect(screen.getByPlaceholderText("输入提示词")).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "编辑提示词" }));
    expect(screen.getByPlaceholderText("输入提示词")).toBeVisible();
    rerender(<Harness referenced scope="courseware-b" />);
    expect(screen.getByPlaceholderText("输入提示词")).not.toBeVisible();
    expect(screen.getByPlaceholderText("输入提示词")).toHaveValue("referenced prompt");
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

    expect(screen.getAllByRole("textbox", { hidden: true })).toHaveLength(2);
    expect(screen.getByDisplayValue("forest fox")).toBeInTheDocument();
    expect(screen.getByDisplayValue("glass city")).toBeInTheDocument();
  });

  it("opens bulk import as a modal and restores focus after Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "批量导入提示词" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "批量导入提示词" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "批量导入提示词" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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

    expect(screen.getAllByRole("textbox", { hidden: true })).toHaveLength(1);
    expect(screen.getByText("P1 · AI数学乐园系统故障", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByDisplayValue(/【生图提示词】/)).toBeInTheDocument();
  });

  it("keeps existing rows when replacement is cancelled", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness />);

    await user.type(screen.getAllByRole("textbox", { hidden: true })[0], "existing prompt");
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

    await user.type(screen.getAllByRole("textbox", { hidden: true })[0], "existing prompt");
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

    await user.type(screen.getAllByRole("textbox", { hidden: true })[0], "single row prompt");
    await user.click(screen.getAllByRole("button", { name: "生成这张图" })[0]);

    expect(onGenerateRow).toHaveBeenCalledWith(0);
  });

  it("keeps unsupported referenced values visible until the user selects a supported image model", async () => {
    const user = userEvent.setup();
    render(<Harness referenced />);

    await user.click(screen.getByRole("button", { name: "页面参数" }));
    expect(screen.getByText("图生图 · Image Relay")).toBeInTheDocument();
    expect(screen.getByText(/当前Image Relay不支持模型 gemini-2.5-flash-image-preview/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "模型" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("combobox", { name: "比例" })).toHaveAccessibleDescription(
      "当前Image Relay不支持模型 gemini-2.5-flash-image-preview，请打开页面参数修正。"
    );
    expect(screen.getByRole("button", { name: "生成这张图" })).toBeDisabled();

    await user.selectOptions(screen.getByRole("combobox", { name: "模型" }), "gpt-image-2");

    expect(screen.getByRole("combobox", { name: "比例" })).toHaveValue("16:9");
    expect(screen.getByRole("combobox", { name: "分辨率" })).toHaveValue("2K");
    expect(screen.queryByText(/当前Image Relay不支持/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成这张图" })).toBeEnabled();
  });

  it("shows only the Yunfei key product model and blocks it after switching key products", async () => {
    const user = userEvent.setup();
    render(<Harness yunfei />);

    await user.click(screen.getByRole("button", { name: "页面参数" }));
    const modelSelect = screen.getByRole("combobox", { name: "模型" }) as HTMLSelectElement;
    expect(Array.from(modelSelect.options).map((option) => option.value)).toEqual([
      "gemini-3.1-flash-image-preview"
    ]);
    expect(Array.from((screen.getByRole("combobox", { name: "分辨率" }) as HTMLSelectElement).options)
      .map((option) => option.value)).toEqual(["1K", "2K", "4K"]);
    expect(screen.getByText("文生图 · 云飞 香蕉2")).toBeInTheDocument();

    await user.upload(
      screen.getByLabelText("上传当前行参考图"),
      new File(["reference"], "reference.png", { type: "image/png" })
    );

    expect(screen.getByText("图生图 · 云飞 香蕉Pro")).toBeInTheDocument();
    expect(Array.from(modelSelect.options).map((option) => option.value)).toEqual([
      "gemini-3.1-flash-image-preview",
      "gemini-3-pro-image-preview"
    ]);
    expect(screen.getByText(
      /当前云飞 香蕉Pro不支持模型 gemini-3.1-flash-image-preview/
    )).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成这张图" })).toBeDisabled();

    await user.selectOptions(modelSelect, "gemini-3-pro-image-preview");

    expect(screen.queryByText(/当前云飞 香蕉Pro不支持/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成这张图" })).toBeEnabled();
  });
});

function Harness(props: {
  onGenerateRow?: (index: number) => void;
  referenced?: boolean;
  yunfei?: boolean;
  scope?: string;
}) {
  const [rows, setRows] = useState<TaskDraft[]>(props.referenced ? [{
    id: "referenced-row",
    prompt: "referenced prompt",
    note: "",
    model: "gemini-2.5-flash-image-preview",
    aspectRatio: "1:1",
    resolution: "1K",
    n: 1,
    referenceMode: "global",
    referenceImageId: "global-reference"
  }] : props.yunfei ? [{
    id: "yunfei-row",
    prompt: "yunfei prompt",
    note: "",
    model: "gemini-3.1-flash-image-preview",
    aspectRatio: "16:9",
    resolution: "1K",
    n: 1,
    referenceMode: "none",
    referenceImageId: null
  }] : []);

  const textRole = props.yunfei ? {
    providerId: "yunfei-banana-2",
    providerName: "云飞 香蕉2",
    protocolType: "yunfei-hybrid-images" as const,
    maxConcurrency: 100,
    models: [{
      value: "gemini-3.1-flash-image-preview",
      label: "Nano Banana 2",
      aspectRatios: ["16:9"],
      resolutions: ["1K", "2K", "4K"],
      supportedResolutionsByAspectRatio: { "16:9": ["1K", "2K", "4K"] },
      maxN: 10,
      supportsReferenceImages: true
    }]
  } : {
    providerId: "text-relay",
    providerName: "Text Relay",
    protocolType: "toapis-async" as const,
    maxConcurrency: 30,
    models: [{
      value: "gemini-2.5-flash-image-preview",
      label: "gemini-2.5-flash-image-preview",
      aspectRatios: ["1:1", "16:9"],
      resolutions: ["1K"],
      maxN: 1,
      supportsReferenceImages: true
    }]
  };

  return (
    <TaskTable
      rows={rows}
      pageScopeId={props.scope}
      defaults={{
        model: "gemini-2.5-flash-image-preview",
        aspectRatio: "1:1",
        resolution: "1K",
        n: 1,
        globalReferenceImageId: props.referenced ? "global-reference" : null
      }}
      settings={{
        roles: {
          text: {
            ...textRole
          },
          image: props.yunfei ? {
            providerId: "yunfei-banana-pro",
            providerName: "云飞 香蕉Pro",
            protocolType: "yunfei-hybrid-images",
            maxConcurrency: 100,
            models: [{
              value: "gemini-3-pro-image-preview",
              label: "Nano Banana Pro",
              aspectRatios: ["16:9"],
              resolutions: ["1K", "2K", "4K"],
              supportedResolutionsByAspectRatio: { "16:9": ["1K", "2K", "4K"] },
              maxN: 10,
              supportsReferenceImages: true
            }]
          } : {
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
        },
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

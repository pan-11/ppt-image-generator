import { within, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { fallbackSettings } from "../hooks/use-settings";
import { createBatch, createChildTasks, fetchActiveBatch, fetchHistory, fetchSettings, pauseBatch, resumeBatch, retryTasks } from "../lib/api";
import { saveEditorSession } from "../lib/editor-session";
import type { ActiveBatchResponse, HistoryItem } from "../lib/types";

vi.mock("../lib/api", () => ({
  createBatch: vi.fn(),
  createChildTasks: vi.fn(),
  deleteBatch: vi.fn(),
  deleteImage: vi.fn(),
  exportBatch: vi.fn(),
  fetchActiveBatch: vi.fn(),
  fetchHistory: vi.fn(),
  fetchSettings: vi.fn(),
  pauseBatch: vi.fn(),
  resumeBatch: vi.fn(),
  retryTasks: vi.fn(),
  uploadReferenceImage: vi.fn()
}));

const historyItem: HistoryItem = {
  batch: {
    id: "batch-history",
    name: "Batch History Restore",
    status: "completed",
    total_tasks: 1,
    success_count: 1,
    failed_count: 0,
    created_at: "2026-06-03T08:00:00.000Z"
  },
  tasks: [
    {
      id: "task-history",
      batch_id: "batch-history",
      prompt: "History prompt to restore",
      note: "P1 · Restored page",
      model: "gpt-image-2",
      aspect_ratio: "16:9",
      resolution: "1K",
      size: "16:9",
      n: 1,
      status: "completed"
    }
  ],
  jobs: [],
  images: [
    {
      id: "image-history",
      task_id: "task-history",
      filename: "history-root.png",
      local_path: "batch/history-root.png"
    }
  ]
};

const activeBatch: ActiveBatchResponse = {
  ...historyItem,
  scheduler: {
    queued: 0,
    running: 0,
    completed: 1,
    failed: 0,
    unknown: 0,
    paused: false
  }
};

describe("App history restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(fetchSettings).mockReset();
    vi.mocked(fetchHistory).mockReset();
    vi.mocked(fetchActiveBatch).mockReset();
    vi.mocked(fetchSettings).mockResolvedValue(fallbackSettings);
    vi.mocked(fetchHistory).mockResolvedValue([historyItem]);
    vi.mocked(fetchActiveBatch).mockResolvedValue(activeBatch);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  it("keeps polling with the monitor closed without mutating the queue", async () => {
    const running = { ...activeBatch, batch: { ...activeBatch.batch, status: "running" }, scheduler: { ...activeBatch.scheduler, running: 1 } };
    vi.mocked(fetchActiveBatch).mockResolvedValue(running);
    render(<App />);
    await waitFor(() => expect(fetchActiveBatch).toHaveBeenCalled());
    const launcher = screen.getByRole("button", { name: "运行监控" });
    expect(launcher).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: "运行监控" })).not.toBeInTheDocument();
    launcher.focus();
    fireEvent.click(launcher);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "运行监控" }), { key: "Escape" });
    expect(launcher).toHaveFocus();
    const callsWhenClosed = vi.mocked(fetchActiveBatch).mock.calls.length;
    vi.mocked(fetchActiveBatch).mockResolvedValue({ ...activeBatch, scheduler: { ...activeBatch.scheduler, failed: 2 } });
    await waitFor(() => expect(vi.mocked(fetchActiveBatch).mock.calls.length).toBeGreaterThan(callsWhenClosed), { timeout: 3500 });
    expect(launcher).toHaveTextContent("失败 2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(launcher);
    expect(screen.getByRole("dialog", { name: "运行监控" })).toHaveTextContent("失败 2");
    for (const mutation of [createBatch, createChildTasks, pauseBatch, resumeBatch, retryTasks]) {
      expect(mutation).not.toHaveBeenCalled();
    }
  }, 10000);

  afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("loads a selected history batch back into the editor rows with its result image", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "刷新历史记录" }));
    await screen.findByText("Batch History Restore");

    fireEvent.click(screen.getByRole("button", { name: "载入编辑" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("History prompt to restore")).toBeInTheDocument();
    });
    expect(screen.getByText("P1 · Restored page", { selector: "strong" })).toBeInTheDocument();
    expect(within(document.getElementById("task-editor")!).getByRole("button", { name: "查看 history-root.png 大图" })).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledWith("这会替换当前上方任务行，但不会删除历史记录。继续载入吗？");
  }, 10000);

  it("restores the newest history batch into the editor after a page refresh", async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.localStorage.clear();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("History prompt to restore")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Batch History Restore").length).toBeGreaterThan(0);
    expect(within(document.getElementById("task-editor")!).getByRole("button", { name: "查看 history-root.png 大图" })).toBeInTheDocument();
  }, 10000);

  it("keeps a submitted child task visible and polls the parent image batch", async () => {
    const childTask = {
      ...historyItem.tasks[0],
      id: "task-child",
      prompt: "Child prompt that stays visible",
      parent_image_id: "image-history",
      status: "running"
    };
    const unrelatedActiveBatch: ActiveBatchResponse = {
      batch: {
        ...historyItem.batch,
        id: "batch-current",
        name: "Different current batch"
      },
      tasks: [],
      jobs: [],
      images: [],
      scheduler: {
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
        unknown: 0,
        paused: false
      }
    };

    saveEditorSession({
      rows: [{
        id: "row-history",
        prompt: historyItem.tasks[0].prompt,
        note: historyItem.tasks[0].note ?? "",
        model: historyItem.tasks[0].model,
        aspectRatio: historyItem.tasks[0].aspect_ratio ?? "16:9",
        resolution: historyItem.tasks[0].resolution ?? "1K",
        n: historyItem.tasks[0].n,
        referenceMode: "none",
        referenceImageId: null,
        submittedTaskId: historyItem.tasks[0].id
      }],
      editorResults: {
        tasks: historyItem.tasks,
        images: historyItem.images
      },
      activeBatchId: "batch-current"
    });
    vi.mocked(createChildTasks).mockResolvedValue({ tasks: [childTask] });
    vi.mocked(fetchActiveBatch).mockImplementation(async (batchId) => (
      batchId === historyItem.batch.id
        ? { ...activeBatch, tasks: [...activeBatch.tasks, childTask] }
        : unrelatedActiveBatch
    ));

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "基于此图修改" }));
    fireEvent.change(await screen.findByPlaceholderText("输入基于这张结果图继续生成的提示词"), {
      target: { value: childTask.prompt }
    });
    fireEvent.click(screen.getByRole("button", { name: "生成子图" }));

    await waitFor(() => {
      expect(fetchActiveBatch).toHaveBeenCalledWith(historyItem.batch.id);
    });
    expect(screen.getAllByText(childTask.prompt).length).toBeGreaterThan(0);
  }, 10000);
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { fallbackSettings } from "../hooks/use-settings";
import { fetchActiveBatch, fetchHistory, fetchSettings } from "../lib/api";
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
      model: "gpt-image-2",
      aspect_ratio: "16:9",
      resolution: "1K",
      size: "16:9",
      n: 1,
      status: "completed"
    }
  ],
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
    paused: false
  }
};

describe("App history restore", () => {
  beforeEach(() => {
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

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("loads a selected history batch back into the editor rows with its result image", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "更新对话框" }));
    await screen.findByText("Batch History Restore");

    fireEvent.click(screen.getByRole("button", { name: "载入到上方任务行" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("History prompt to restore")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "查看 history-root.png 大图" })).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledWith("这会替换当前上方任务行，但不会删除历史记录。继续载入吗？");
  }, 10000);

  it("restores the newest history batch into the editor after a page refresh", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("History prompt to restore")).toBeInTheDocument();
    });

    expect(screen.getByText("Batch History Restore")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看 history-root.png 大图" })).toBeInTheDocument();
  }, 10000);
});

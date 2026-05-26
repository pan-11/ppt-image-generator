import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryCard } from "../components/history/history-card";

describe("HistoryCard", () => {
  it("shows failed tasks and retries only the failed ones", async () => {
    const onRetryTasks = vi.fn(async () => undefined);

    render(
      <HistoryCard
        item={{
          batch: {
            id: "batch-1",
            name: "Batch 2026/4/21 00:54:42",
            status: "completed",
            total_tasks: 3,
            success_count: 2,
            failed_count: 1,
            created_at: "2026-04-21T00:54:42.000Z"
          },
          tasks: [
            {
              id: "task-ok",
              prompt: "成功任务",
              model: "gemini-3.1-flash-image-preview",
              size: "1024x1024",
              n: 1,
              status: "completed"
            },
            {
              id: "task-failed",
              prompt: "失败任务提示词",
              model: "gemini-3.1-flash-image-preview",
              size: "1024x1024",
              n: 1,
              status: "failed",
              error_message: "429 too many requests"
            }
          ],
          images: []
        }}
        exportDirectory="D:\\Images"
        onDeleteBatch={async () => undefined}
        onDeleteImage={async () => undefined}
        onExportBatch={async () => undefined}
        onRetryTasks={onRetryTasks}
      />
    );

    expect(screen.getByText("失败任务提示词")).toBeInTheDocument();
    expect(screen.getByText(/429 too many requests/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试失败项" }));

    expect(onRetryTasks).toHaveBeenCalledWith(["task-failed"], "batch-1");
  });
});

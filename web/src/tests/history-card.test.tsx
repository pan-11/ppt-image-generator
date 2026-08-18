import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryCard } from "../components/history/history-card";

describe("HistoryCard", () => {
  it("asks the app to load this batch as the editor snapshot", () => {
    const onRestoreBatch = vi.fn();
    const item = {
      batch: {
        id: "batch-1",
        name: "Batch 2026/4/21 00:54:42",
        status: "completed",
        total_tasks: 1,
        success_count: 1,
        failed_count: 0,
        created_at: "2026-04-21T00:54:42.000Z"
      },
      tasks: [
        {
          id: "task-ok",
          prompt: "success task",
          model: "gpt-image-2",
          size: "16:9",
          n: 1,
          status: "completed"
        }
      ],
      jobs: [],
      images: []
    };

    render(
      <HistoryCard
        item={item}
        exportDirectory="D:\\Images"
        onRestoreBatch={onRestoreBatch}
        onDeleteBatch={async () => undefined}
        onDeleteImage={async () => undefined}
        onExportBatch={async () => undefined}
        onRetryTasks={async () => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "载入到上方任务行" }));

    expect(onRestoreBatch).toHaveBeenCalledWith(item);
  });

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
          jobs: [{
            id: "job-2",
            task_id: "task-failed",
            output_index: 2,
            mode: "text",
            status: "failed",
            provider_id: "ym2",
            provider_name: "YM2",
            protocol_type: "ym2-openai-images",
            requested_size: "2048x1152",
            actual_width: 1024,
            actual_height: 1536,
            error_stage: "validation",
            error_message: "返回尺寸不匹配"
          }],
          images: []
        }}
        exportDirectory="D:\\Images"
        onRestoreBatch={() => undefined}
        onDeleteBatch={async () => undefined}
        onDeleteImage={async () => undefined}
        onExportBatch={async () => undefined}
        onRetryTasks={onRetryTasks}
      />
    );

    expect(screen.getByText("失败任务提示词")).toBeInTheDocument();
    expect(screen.getByText(/429 too many requests/i)).toBeInTheDocument();
    expect(screen.getByText("图 2 · YM2 · ym2-openai-images")).toBeInTheDocument();
    expect(screen.getByText("预期 2048x1152 · 返回 1024x1536")).toBeInTheDocument();
    expect(screen.getByText("尺寸校验失败")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试失败项" }));

    expect(onRetryTasks).toHaveBeenCalledWith(["task-failed"], "batch-1");
  });
});

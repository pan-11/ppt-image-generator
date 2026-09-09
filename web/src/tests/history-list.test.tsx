import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryList } from "../components/history/history-list";

describe("HistoryList", () => {
  afterEach(cleanup);
  it("shows a useful empty state after history finishes loading", () => {
    render(
      <HistoryList
        items={[]}
        loading={false}
        error={null}
        exportDirectory=""
        onExportDirectoryChange={() => undefined}
        onDeleteBatch={async () => undefined}
        onDeleteImage={async () => undefined}
        onExportBatch={async () => undefined}
        onRetryTasks={async () => undefined}
        onRestoreBatch={() => undefined}
      />
    );

    expect(screen.getByText("还没有历史记录")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往任务编辑器" })).toHaveAttribute("href", "#task-editor");
  });

  it("announces loading failures", () => {
    render(
      <HistoryList
        items={[]}
        loading={false}
        error="加载历史记录失败"
        exportDirectory=""
        onExportDirectoryChange={() => undefined}
        onDeleteBatch={async () => undefined}
        onDeleteImage={async () => undefined}
        onExportBatch={async () => undefined}
        onRetryTasks={async () => undefined}
        onRestoreBatch={() => undefined}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("加载历史记录失败");
  });
});

it("preserves loaded batches and API order during reload", () => {
  const items = ["newest", "older"].map((id) => ({ batch: { id, name: id, status: "completed", total_tasks: 0, success_count: 0, failed_count: 0, created_at: "2026-04-21T00:54:42.000Z" }, tasks: [], jobs: [], images: [] }));
  render(<HistoryList items={items} loading exportDirectory="" onExportDirectoryChange={() => undefined} onDeleteBatch={async () => undefined} onDeleteImage={async () => undefined} onExportBatch={async () => undefined} onRetryTasks={async () => undefined} onRestoreBatch={() => undefined} />);
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["newest", "older"]);
  expect(screen.getByRole("status")).toHaveTextContent("正在加载历史...");
  cleanup();
});

it("keeps export settings and diagnostics collapsed and refreshes manually", () => {
  const refresh = vi.fn();
  const change = vi.fn();
  render(<HistoryList items={[]} loading={false} error="读取失败" errorDetails={'HTTP 500\n{"message":"读取失败","trace":"detail"}'} onRefresh={refresh} exportDirectory="D:\\Images" onExportDirectoryChange={change} onDeleteBatch={async () => undefined} onDeleteImage={async () => undefined} onExportBatch={async () => undefined} onRetryTasks={async () => undefined} onRestoreBatch={() => undefined} />);
  expect(screen.getByRole("heading", { name: "生成历史" })).toBeInTheDocument();
  const settings = screen.getByText("图片导出设置").closest("details")!;
  expect(settings.open).toBe(false);
  fireEvent.click(screen.getByText("图片导出设置"));
  fireEvent.change(screen.getByLabelText("下载目录"), { target: { value: "D:\\Export" } });
  expect(change).toHaveBeenCalledWith("D:\\Export");
  const diagnostics = screen.getByText("查看错误详情").closest("details")!;
  expect(diagnostics.open).toBe(false);
  expect(diagnostics).toHaveTextContent("HTTP 500");
  expect(screen.getByRole("alert")).toHaveTextContent("读取失败");
  expect(screen.getByRole("alert")).not.toHaveTextContent("trace");
  fireEvent.click(screen.getByRole("button", { name: "刷新历史记录" }));
  expect(refresh).toHaveBeenCalledTimes(1);
  cleanup();
});

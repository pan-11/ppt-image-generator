import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoryList } from "../components/history/history-list";

describe("HistoryList", () => {
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

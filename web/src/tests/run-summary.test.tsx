import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RunSummary } from "../components/monitor/run-summary";

describe("RunSummary", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows queued and running counts", () => {
    render(
      <RunSummary
        queued={45}
        running={5}
        completed={3}
        failed={1}
        unknown={2}
      />
    );

    const summaries = screen.getAllByText(/等待中|运行中|成功|失败|状态未知/);
    expect(summaries.map((item) => item.textContent)).toEqual([
      "等待中 45",
      "运行中 5",
      "成功 3",
      "失败 1",
      "状态未知 2"
    ]);
  });

  it("does not show queue controls until a batch is active", () => {
    render(
      <RunSummary
        queued={0}
        running={0}
        completed={0}
        failed={0}
        unknown={0}
        hasActiveBatch={false}
      />
    );

    expect(screen.queryByRole("button", { name: "暂停补位" })).not.toBeInTheDocument();
    expect(screen.getByText("提交任务后可在这里暂停或继续队列。")).toBeInTheDocument();
    expect(screen.queryByText("等待中")).not.toBeInTheDocument();
  });
});

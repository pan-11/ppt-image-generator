import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubmitBar } from "../components/tasks/submit-bar";

afterEach(() => {
  cleanup();
});

describe("SubmitBar", () => {
  it("shows the ready task count and starts generation", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <SubmitBar
        readyCount={2}
        maxBatchSize={100}
        maxConcurrency={4}
        submitting={false}
        settingsLoading={false}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByText("准备提交 2 条任务")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "开始生成" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("disables generation when no prompt is ready and shows submission errors", () => {
    render(
      <SubmitBar
        readyCount={0}
        maxBatchSize={100}
        maxConcurrency={4}
        submitting={false}
        settingsLoading={false}
        errorMessage="提交失败，请检查后端服务。"
        onSubmit={() => undefined}
      />
    );

    expect(screen.getByRole("button", { name: "开始生成" })).toBeDisabled();
    expect(screen.getByText("提交失败，请检查后端服务。")).toBeInTheDocument();
  });
});

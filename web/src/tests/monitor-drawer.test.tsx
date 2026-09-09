import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonitorDrawer } from "../components/monitor/monitor-drawer";
import { ModalDialog } from "../components/ui/modal-dialog";
import type { ActiveBatchResponse } from "../lib/types";

const batch: ActiveBatchResponse = {
  batch: { id: "batch", name: "当前生成", status: "running", total_tasks: 1, success_count: 0, failed_count: 0, created_at: "2026-09-09" },
  tasks: [{ id: "task", batch_id: "batch", prompt: "第一行提示词\n第二行完整提示词", model: "gpt-image-2", size: "16:9", n: 1, status: "running" }],
  images: [], jobs: [], scheduler: { queued: 0, running: 1, failed: 0, unknown: 0, completed: 0, paused: false }
};
function Harness({ data = null }: { data?: ActiveBatchResponse | null }) {
  const [open, setOpen] = useState(false);
  return <MonitorDrawer open={open} onOpenChange={setOpen} activeBatch={data} onPause={vi.fn()} onResume={vi.fn()} onRetryFailed={vi.fn()} />;
}
afterEach(cleanup);

describe("MonitorDrawer", () => {
  it("starts closed and returns focus after Escape", () => {
    render(<Harness data={batch} />);
    const launcher = screen.getByRole("button", { name: "运行监控" });
    expect(launcher).toHaveAttribute("aria-controls", "run-monitor-drawer");
    expect(launcher).toHaveAttribute("aria-expanded", "false");
    launcher.focus();
    fireEvent.click(launcher);
    const dialog = screen.getByRole("dialog", { name: "运行监控" });
    expect(dialog).toHaveAttribute("id", "run-monitor-drawer");
    expect(screen.getByRole("button", { name: "关闭运行监控" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it("closes on backdrop but keeps inside clicks and full prompt details open", () => {
    render(<Harness data={batch} />);
    fireEvent.click(screen.getByRole("button", { name: "运行监控" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(screen.getByText("查看完整提示词"));
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(dialog.querySelector("details p")?.textContent).toBe(batch.tasks[0].prompt);
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("updates counts while closed without automatically opening on failure", () => {
    const { rerender } = render(<Harness data={batch} />);
    const launcher = screen.getByRole("button", { name: "运行监控" });
    expect(launcher).toHaveTextContent("运行中 1");
    expect(launcher).not.toHaveTextContent("状态未知");
    rerender(<Harness data={{ ...batch, scheduler: { ...batch.scheduler, running: 2, failed: 3, unknown: 1 } }} />);
    expect(launcher).toHaveTextContent("运行中 2");
    expect(launcher).toHaveTextContent("失败 3");
    expect(launcher).toHaveTextContent("状态未知 1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a plain launcher and useful empty state without queue controls", () => {
    render(<Harness />);
    expect(screen.getByRole("button")).toHaveTextContent(/^运行监控$/);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("还没有运行中的批次")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "暂停补位" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重试失败项" })).not.toBeInTheDocument();
  });

  it("keeps the shared dialog centered and className on its inner card by default", () => {
    const onClose = vi.fn();
    render(<ModalDialog open label="原有弹窗" className="existing-card" onClose={onClose}><button data-modal-initial-focus>内容</button></ModalDialog>);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("modal-dialog");
    expect(dialog).not.toHaveClass("modal-dialog-right", "existing-card");
    expect(dialog.firstElementChild).toHaveClass("modal-card", "existing-card");
    fireEvent.click(screen.getByRole("button"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

import type { ActiveBatchResponse } from "../../lib/types";
import { formatTaskDimensions } from "../../lib/model-options";
import { formatTaskStatus } from "../../lib/status-labels";
import { ModalDialog } from "../ui/modal-dialog";
import { RunSummary } from "./run-summary";

export function MonitorDrawer(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeBatch: ActiveBatchResponse | null;
  onPause: () => void;
  onResume: () => void;
  onRetryFailed: () => void;
}) {
  const current = props.activeBatch;
  return (
    <>
      <button className="monitor-launcher ghost-button" aria-label="运行监控" aria-expanded={props.open} aria-controls="run-monitor-drawer" onClick={() => props.onOpenChange(true)}>
        <strong>运行监控</strong>
        {current ? <>
          <span>运行中 {current.scheduler.running}</span>
          <span>失败 {current.scheduler.failed}</span>
          {current.scheduler.unknown > 0 ? <span>状态未知 {current.scheduler.unknown}</span> : null}
        </> : null}
      </button>
      <ModalDialog open={props.open} id="run-monitor-drawer" label="运行监控" placement="right" className="monitor-drawer" onClose={() => props.onOpenChange(false)}>
        <header className="monitor-drawer-header">
          <h2>运行监控</h2>
          <button className="ghost-button" aria-label="关闭运行监控" data-modal-initial-focus onClick={() => props.onOpenChange(false)}>关闭</button>
        </header>
        <div className="monitor-drawer-body">
          <RunSummary
            queued={current?.scheduler.queued ?? 0}
            running={current?.scheduler.running ?? 0}
            completed={current?.scheduler.completed ?? 0}
            failed={current?.scheduler.failed ?? 0}
            unknown={current?.scheduler.unknown ?? 0}
            hasActiveBatch={Boolean(current)}
            paused={current?.scheduler.paused ?? false}
            onPause={props.onPause}
            onResume={props.onResume}
          />
          <section className="panel live-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">当前批次</p>
                <h2>{current?.batch.name ?? "还没有运行中的批次"}</h2>
              </div>
              {current ? <button className="ghost-button" onClick={props.onRetryFailed}>重试失败项</button> : null}
            </div>
            <div className="live-task-list">
              {(current?.tasks ?? []).map((task) => (
                <article key={task.id} className="live-task-card">
                  <div>
                    <strong className="monitor-task-prompt">{task.prompt}</strong>
                    <details className="monitor-prompt-details">
                      <summary>查看完整提示词</summary>
                      <p>{task.prompt}</p>
                    </details>
                    <p>{task.model} · {formatTaskDimensions(task)}</p>
                  </div>
                  <span className={`status-chip status-${task.status}`}>{formatTaskStatus(task.status)}</span>
                </article>
              ))}
            </div>
          </section>
        </div>
      </ModalDialog>
    </>
  );
}

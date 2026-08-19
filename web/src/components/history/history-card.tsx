import { useState } from "react";
import { ImageGrid } from "./image-grid";
import type { HistoryItem } from "../../lib/types";

const stageLabels: Record<string, string> = {
  submission: "提交失败",
  polling: "轮询失败",
  download: "下载失败",
  validation: "尺寸校验失败"
};

function jobTitle(job: HistoryItem["jobs"][number]) {
  if (!job.provider_id) return `图 ${job.output_index} · 尚未提交`;
  return `图 ${job.output_index} · ${job.provider_name ?? job.provider_id} · ${job.protocol_type ?? "未知协议"}`;
}

function dimensionSummary(job: HistoryItem["jobs"][number]) {
  if (!job.requested_size) return null;
  const actual = job.actual_width && job.actual_height
    ? `${job.actual_width}x${job.actual_height}`
    : "未返回";
  return `预期 ${job.requested_size} · 返回 ${actual}`;
}

export function HistoryCard(props: {
  item: HistoryItem;
  exportDirectory: string;
  onDeleteBatch: (batchId: string) => Promise<void>;
  onDeleteImage: (imageId: string) => Promise<void>;
  onExportBatch: (batchId: string, destinationDir: string) => Promise<unknown>;
  onRetryTasks: (taskIds: string[], batchId: string) => Promise<void>;
  onRestoreBatch: (item: HistoryItem) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const failedTasks = props.item.tasks.filter((task) => task.status === "failed");
  const jobs = props.item.jobs ?? [];
  const legacyFailedTasks = failedTasks.filter((task) => !jobs.some((job) => job.task_id === task.id));

  const exportImages = async () => {
    if (!props.exportDirectory.trim()) {
      setExportError("请先填写下载目录");
      return;
    }

    setExporting(true);
    setExportError(null);
    try {
      await props.onExportBatch(props.item.batch.id, props.exportDirectory.trim());
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const retryFailedTasks = async () => {
    if (failedTasks.length === 0) {
      return;
    }

    setRetrying(true);
    setRetryError(null);
    try {
      await props.onRetryTasks(failedTasks.map((task) => task.id), props.item.batch.id);
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "重试失败");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <article className="history-card">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{new Date(props.item.batch.created_at).toLocaleString()}</p>
          <h3>{props.item.batch.name}</h3>
        </div>
        <div className="toolbar">
          <button className="ghost-button" onClick={() => props.onRestoreBatch(props.item)}>
            载入到上方任务行
          </button>
          {failedTasks.length > 0 ? (
            <button className="ghost-button" disabled={retrying} onClick={() => void retryFailedTasks()}>
              {retrying ? "重试中..." : "重试失败项"}
            </button>
          ) : null}
          <button className="ghost-button" disabled={exporting} onClick={() => void exportImages()}>
            {exporting ? "导出中..." : "导出图片"}
          </button>
          <button className="ghost-button danger-button" onClick={() => void props.onDeleteBatch(props.item.batch.id)}>
            删除批次
          </button>
        </div>
      </div>

      <p className="history-stats">
        共 {props.item.tasks.length} 条任务，成功 {props.item.batch.success_count ?? 0} 条，失败 {props.item.batch.failed_count ?? 0} 条
      </p>

      {exportError ? <p className="error-copy">{exportError}</p> : null}
      {retryError ? <p className="error-copy">{retryError}</p> : null}

      {legacyFailedTasks.length > 0 ? (
        <section className="failed-task-section">
          <div className="failed-task-header">
            <strong>失败任务</strong>
            <span className="muted-copy">刷新后也会保留，方便继续重试</span>
          </div>

          <div className="failed-task-list">
            {legacyFailedTasks.map((task) => (
              <article key={task.id} className="failed-task-card">
                <strong>{task.prompt}</strong>
                <p className="muted-copy">{task.model}</p>
                <p className="error-copy">{task.error_message ?? "未返回失败原因"}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {jobs.length > 0 ? (
        <section className="failed-task-section generation-job-section">
          <div className="failed-task-header">
            <strong>单图作业</strong>
            <span className="muted-copy">每张图独立记录中转站、状态和尺寸</span>
          </div>
          <div className="failed-task-list generation-job-list">
            {props.item.tasks.map((task) => {
              const taskJobs = jobs.filter((job) => job.task_id === task.id);
              if (taskJobs.length === 0) return null;
              return (
                <article key={task.id} className="failed-task-card generation-task-card">
                  <strong>{task.prompt}</strong>
                  <p className="muted-copy">{task.model}</p>
                  {task.error_message ? <p className="error-copy">{task.error_message}</p> : null}
                  {taskJobs.map((job) => (
                    <div key={job.id} className="generation-job-row">
                      <strong>{jobTitle(job)}</strong>
                      <span className={`status-chip status-${job.status}`}>{job.status}</span>
                      {dimensionSummary(job) ? <p className="muted-copy">{dimensionSummary(job)}</p> : null}
                      {job.error_stage ? <p className="error-copy">{stageLabels[job.error_stage] ?? job.error_stage}</p> : null}
                      {job.error_message ? <p className="error-copy">{job.error_message}</p> : null}
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <ImageGrid images={props.item.images} onDeleteImage={props.onDeleteImage} />
    </article>
  );
}

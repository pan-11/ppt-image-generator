import { useState } from "react";
import { ImageGrid } from "./image-grid";
import type { ActiveBatchResponse } from "../../lib/types";

type HistoryItem = {
  batch: ActiveBatchResponse["batch"];
  tasks: ActiveBatchResponse["tasks"];
  images: ActiveBatchResponse["images"];
};

export function HistoryCard(props: {
  item: HistoryItem;
  exportDirectory: string;
  onDeleteBatch: (batchId: string) => Promise<void>;
  onDeleteImage: (imageId: string) => Promise<void>;
  onExportBatch: (batchId: string, destinationDir: string) => Promise<unknown>;
  onRetryTasks: (taskIds: string[], batchId: string) => Promise<void>;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const failedTasks = props.item.tasks.filter((task) => task.status === "failed");

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

      {failedTasks.length > 0 ? (
        <section className="failed-task-section">
          <div className="failed-task-header">
            <strong>失败任务</strong>
            <span className="muted-copy">刷新后也会保留，方便继续重试</span>
          </div>

          <div className="failed-task-list">
            {failedTasks.map((task) => (
              <article key={task.id} className="failed-task-card">
                <strong>{task.prompt}</strong>
                <p className="muted-copy">{task.model}</p>
                <p className="error-copy">{task.error_message ?? "未返回失败原因"}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <ImageGrid images={props.item.images} onDeleteImage={props.onDeleteImage} />
    </article>
  );
}

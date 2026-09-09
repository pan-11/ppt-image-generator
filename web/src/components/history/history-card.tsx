import { useId, useRef, useState } from "react";
import { ImageGrid } from "./image-grid";
import type { HistoryItem } from "../../lib/types";
import { HistoryBatchDetails } from "./history-batch-details";

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const detailsId = useId();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const deleteBatch = async () => {
    if (deleting) return;
    const message = `永久删除批次 "${props.item.batch.name}"、${props.item.tasks.length} 条任务和 ${props.item.images.length} 张图片？此操作无法撤销。`;
    if (!window.confirm(message)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await props.onDeleteBatch(props.item.batch.id);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

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
      <div className="history-batch-summary">
        <h3 title={props.item.batch.name}>{props.item.batch.name}</h3>
        <p className="panel-kicker">{new Date(props.item.batch.created_at).toLocaleString()}</p>
        <p className="history-stats">{props.item.tasks.length} 条任务 · {props.item.images.length} 张已保存图片</p>
        <p className="history-stats">成功 {props.item.tasks.filter((task) => task.status === "completed").length} 条 · 失败 {failedTasks.length} 条</p>
      </div>
      <div className="history-row-actions">
        <button className="ghost-button" onClick={() => props.onRestoreBatch(props.item)}>载入编辑</button>
        <button className="ghost-button" aria-expanded={detailsOpen} aria-controls={detailsId} onClick={() => setDetailsOpen(!detailsOpen)}>{detailsOpen ? "收起详情" : "详情"}</button>
        <details className="history-actions-menu" ref={menuRef} onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (menuRef.current) {
              menuRef.current.open = false;
              menuRef.current.querySelector("summary")?.focus();
            }
          }
        }}>
          <summary className="ghost-button">更多</summary>
          <div className="history-actions-popup">
            <button className="ghost-button" disabled={exporting} onClick={() => void exportImages()}>{exporting ? "导出中..." : "导出图片"}</button>
            {failedTasks.length > 0 ? <button className="ghost-button" disabled={retrying} onClick={() => void retryFailedTasks()}>{retrying ? "重试中..." : "重试失败项"}</button> : null}
            <button className="ghost-button danger-button" disabled={deleting} onClick={() => void deleteBatch()}>{deleting ? "删除中..." : "删除批次"}</button>
          </div>
        </details>
      </div>
      <div className="history-batch-media"><ImageGrid images={props.item.images} onDeleteImage={props.onDeleteImage} /></div>
      {exportError ? <p className="error-copy history-row-message" role="alert">{exportError}</p> : null}
      {retryError ? <p className="error-copy history-row-message" role="alert">{retryError}</p> : null}
      {deleteError ? <p className="error-copy history-row-message" role="alert">{deleteError}</p> : null}
      {detailsOpen ? <div id={detailsId} className="history-details-container"><HistoryBatchDetails item={props.item} /></div> : null}
    </article>
  );
}

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
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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

  return (
    <article className="history-card">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{new Date(props.item.batch.created_at).toLocaleString()}</p>
          <h3>{props.item.batch.name}</h3>
        </div>
        <div className="toolbar">
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

      <ImageGrid images={props.item.images} onDeleteImage={props.onDeleteImage} />
    </article>
  );
}

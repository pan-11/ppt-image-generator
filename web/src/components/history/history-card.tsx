import { ImageGrid } from "./image-grid";
import type { ActiveBatchResponse } from "../../lib/types";

type HistoryItem = {
  batch: ActiveBatchResponse["batch"];
  tasks: ActiveBatchResponse["tasks"];
  images: ActiveBatchResponse["images"];
};

export function HistoryCard(props: {
  item: HistoryItem;
  onDeleteBatch: (batchId: string) => Promise<void>;
  onDeleteImage: (imageId: string) => Promise<void>;
}) {
  return (
    <article className="history-card">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{new Date(props.item.batch.created_at).toLocaleString()}</p>
          <h3>{props.item.batch.name}</h3>
        </div>
        <div className="toolbar">
          <a className="ghost-button" href={`/api/download/zip?batchId=${props.item.batch.id}`}>整批下载</a>
          <button className="ghost-button danger-button" onClick={() => void props.onDeleteBatch(props.item.batch.id)}>
            删除批次
          </button>
        </div>
      </div>

      <p className="history-stats">
        共 {props.item.tasks.length} 条任务，成功 {props.item.batch.success_count ?? 0} 条，失败 {props.item.batch.failed_count ?? 0} 条
      </p>

      <ImageGrid images={props.item.images} onDeleteImage={props.onDeleteImage} />
    </article>
  );
}

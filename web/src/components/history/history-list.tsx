import { HistoryCard } from "./history-card";
import type { ActiveBatchResponse } from "../../lib/types";

type HistoryItem = {
  batch: ActiveBatchResponse["batch"];
  tasks: ActiveBatchResponse["tasks"];
  images: ActiveBatchResponse["images"];
};

export function HistoryList(props: {
  items: HistoryItem[];
  loading: boolean;
  exportDirectory: string;
  exportMessage?: string | null;
  onExportDirectoryChange: (value: string) => void;
  onDeleteBatch: (batchId: string) => Promise<void>;
  onDeleteImage: (imageId: string) => Promise<void>;
  onExportBatch: (batchId: string, destinationDir: string) => Promise<unknown>;
  onRetryTasks: (taskIds: string[], batchId: string) => Promise<void>;
}) {
  return (
    <section className="panel history-panel">
      <div className="panel-heading history-heading">
        <div>
          <p className="panel-kicker">历史记录</p>
          <h2>本地保存，直接导出图片</h2>
        </div>

        <label className="stacked export-field">
          <span>下载目录</span>
          <input
            type="text"
            value={props.exportDirectory}
            onChange={(event) => props.onExportDirectoryChange(event.target.value)}
            placeholder="例如 D:\\Images\\Exports"
          />
        </label>
      </div>

      {props.exportMessage ? <p className="muted-copy">{props.exportMessage}</p> : null}
      {props.loading ? <p className="muted-copy">正在加载历史...</p> : null}

      <div className="history-list">
        {props.items.map((item) => (
          <HistoryCard
            key={item.batch.id}
            item={item}
            exportDirectory={props.exportDirectory}
            onDeleteBatch={props.onDeleteBatch}
            onDeleteImage={props.onDeleteImage}
            onExportBatch={props.onExportBatch}
            onRetryTasks={props.onRetryTasks}
          />
        ))}
      </div>
    </section>
  );
}

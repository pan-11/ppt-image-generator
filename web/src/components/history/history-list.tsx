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
  onDeleteBatch: (batchId: string) => Promise<void>;
  onDeleteImage: (imageId: string) => Promise<void>;
}) {
  return (
    <section className="panel history-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">历史记录</p>
          <h2>本地保存，随时可删</h2>
        </div>
      </div>

      {props.loading ? <p className="muted-copy">正在加载历史...</p> : null}

      <div className="history-list">
        {props.items.map((item) => (
          <HistoryCard
            key={item.batch.id}
            item={item}
            onDeleteBatch={props.onDeleteBatch}
            onDeleteImage={props.onDeleteImage}
          />
        ))}
      </div>
    </section>
  );
}

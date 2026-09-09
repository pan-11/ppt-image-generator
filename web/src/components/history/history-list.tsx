import { HistoryCard } from "./history-card";
import type { HistoryItem } from "../../lib/types";

export function HistoryList(props: {
  items: HistoryItem[];
  loading: boolean;
  error?: string | null;
  errorDetails?: string | null;
  onRefresh?: () => void;
  exportDirectory: string;
  exportMessage?: string | null;
  onExportDirectoryChange: (value: string) => void;
  onDeleteBatch: (batchId: string) => Promise<void>;
  onDeleteImage: (imageId: string) => Promise<void>;
  onExportBatch: (batchId: string, destinationDir: string) => Promise<unknown>;
  onRetryTasks: (taskIds: string[], batchId: string) => Promise<void>;
  onRestoreBatch: (item: HistoryItem) => void;
}) {
  return (
    <section className="panel history-panel" id="history">
      <div className="panel-heading history-heading">
        <div>
          <h2 id="history-title" tabIndex={-1}>生成历史</h2>
          <p className="muted-copy">记录保存在本机；生成后可刷新查看最新图片。</p>
        </div>

        {props.onRefresh ? <button className="ghost-button" aria-label="刷新历史记录" disabled={props.loading} onClick={props.onRefresh}>刷新</button> : null}
      </div>

      <details className="history-export-settings">
        <summary>图片导出设置</summary>
        <p className="muted-copy">此目录仅用于导出历史图片；PPT 文件通过浏览器下载。</p>
        <label className="stacked export-field">
          <span>下载目录</span>
          <input
            type="text"
            value={props.exportDirectory}
            onChange={(event) => props.onExportDirectoryChange(event.target.value)}
            placeholder="例如 D:\\Images\\Exports"
          />
        </label>
      </details>

      {props.exportMessage ? <p className="muted-copy" role="status">{props.exportMessage}</p> : null}
      {props.loading ? <p className="muted-copy" role="status">正在加载历史...</p> : null}
      {props.error ? <div className="history-error"><p className="error-copy" role="alert">{props.error}</p>{props.errorDetails ? <details className="history-error-details"><summary>查看错误详情</summary><pre>{props.errorDetails}</pre></details> : null}</div> : null}
      {!props.loading && !props.error && props.items.length === 0 ? (
        <div className="history-empty-state">
          <strong>还没有历史记录</strong>
          <p className="muted-copy">生成任务后，批次和已保存图片会显示在这里。</p>
          <a className="ghost-button" href="#task-editor">前往任务编辑器</a>
        </div>
      ) : null}

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
            onRestoreBatch={props.onRestoreBatch}
          />
        ))}
      </div>
    </section>
  );
}

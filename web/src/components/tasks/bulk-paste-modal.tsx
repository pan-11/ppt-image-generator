import { useMemo, useState } from "react";
import { parseBulkPromptImport, type BulkImportItem } from "../../lib/bulk-prompt-import";

export function BulkPasteModal(props: {
  open: boolean;
  maxBatchSize: number;
  onClose: () => void;
  onImport: (items: BulkImportItem[]) => void;
}) {
  const [value, setValue] = useState("");
  const result = useMemo(
    () => parseBulkPromptImport(value, props.maxBatchSize),
    [props.maxBatchSize, value]
  );
  const canImport = result.items.length > 0 && result.errors.length === 0;
  const notes = result.items.map((item) => item.note).filter(Boolean);

  if (!props.open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card bulk-import-modal">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">批量导入提示词</p>
            <h3>粘贴整份提示词文本</h3>
          </div>
          <button className="ghost-button" data-testid="bulk-close" onClick={props.onClose}>关闭</button>
        </div>

        <label className="stacked">
          <span>提示词内容</span>
          <textarea
            data-testid="bulk-paste-input"
            aria-label="提示词内容"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="可粘贴带【页面编号】等标记的完整内容，也可保持一行一个提示词"
          />
        </label>

        <section className="bulk-import-preview" aria-label="导入预览">
          <strong>{result.mode === "structured" ? "结构化格式" : "逐行格式"} · {result.items.length} 条</strong>
          {notes.length > 0 ? (
            <ol>
              {notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
            </ol>
          ) : null}
          {result.errors.length > 0 ? (
            <ul className="bulk-import-errors">
              {result.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          ) : null}
        </section>

        <div className="modal-footer">
          <span>单批最多 {props.maxBatchSize} 条</span>
          <button
            className="primary-button"
            data-testid="bulk-import"
            disabled={!canImport}
            onClick={() => props.onImport(result.items)}
          >
            {`导入 ${result.items.length} 条`}
          </button>
        </div>
      </div>
    </div>
  );
}

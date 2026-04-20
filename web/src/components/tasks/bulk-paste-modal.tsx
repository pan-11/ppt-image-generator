import { useMemo, useState } from "react";

export function BulkPasteModal(props: {
  open: boolean;
  maxBatchSize: number;
  onClose: () => void;
  onImport: (prompts: string[]) => void;
}) {
  const [value, setValue] = useState("");

  const prompts = useMemo(
    () => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, props.maxBatchSize),
    [props.maxBatchSize, value]
  );

  if (!props.open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">批量导入</p>
            <h3>一行一个提示词</h3>
          </div>
          <button className="ghost-button" onClick={props.onClose}>关闭</button>
        </div>

        <label className="stacked">
          <span>提示词列表</span>
          <textarea
            aria-label="提示词列表"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="第一行一个提示词&#10;第二行一个提示词"
          />
        </label>

        <div className="modal-footer">
          <span>将导入 {prompts.length} 条，单批最多 {props.maxBatchSize} 条</span>
          <button className="primary-button" onClick={() => props.onImport(prompts)}>
            {`导入 ${prompts.length} 条`}
          </button>
        </div>
      </div>
    </div>
  );
}

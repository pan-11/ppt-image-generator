import type { ChangeEvent } from "react";
import type { ModelOption, ReferenceImageRecord, TaskDraft } from "../../lib/types";

export function TaskRow(props: {
  row: TaskDraft;
  models: ModelOption[];
  onChange: (next: TaskDraft) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUploadReference: (file: File) => Promise<ReferenceImageRecord>;
}) {
  const selectedModel = props.models.find((model) => model.value === props.row.model) ?? props.models[0];

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reference = await props.onUploadReference(file);
    props.onChange({
      ...props.row,
      referenceMode: "row",
      referenceImageId: reference.id
    });
    event.target.value = "";
  };

  return (
    <div className="task-row">
      <textarea
        placeholder="输入提示词"
        value={props.row.prompt}
        onChange={(event) => props.onChange({ ...props.row, prompt: event.target.value })}
      />

      <select
        value={props.row.model}
        onChange={(event) => {
          const nextModel = props.models.find((item) => item.value === event.target.value) ?? props.models[0];
          props.onChange({
            ...props.row,
            model: nextModel.value,
            size: nextModel.sizes[0],
            n: Math.min(props.row.n, nextModel.maxN)
          });
        }}
      >
        {props.models.map((model) => (
          <option key={model.value} value={model.value}>{model.label}</option>
        ))}
      </select>

      <select
        value={props.row.size}
        onChange={(event) => props.onChange({ ...props.row, size: event.target.value })}
      >
        {selectedModel.sizes.map((size) => (
          <option key={size} value={size}>{size}</option>
        ))}
      </select>

      <input
        type="number"
        min={1}
        max={selectedModel.maxN}
        value={props.row.n}
        onChange={(event) => {
          const next = Number(event.target.value);
          props.onChange({
            ...props.row,
            n: Number.isNaN(next) ? 1 : Math.min(Math.max(next, 1), selectedModel.maxN)
          });
        }}
      />

      <select
        value={props.row.referenceMode}
        onChange={(event) => props.onChange({
          ...props.row,
          referenceMode: event.target.value as TaskDraft["referenceMode"],
          referenceImageId: event.target.value === "row" ? props.row.referenceImageId : null
        })}
      >
        <option value="none">无参考图</option>
        <option value="global">使用全局参考图</option>
        <option value="row">本行参考图</option>
      </select>

      <label className="inline-upload">
        <span>{props.row.referenceMode === "row" && props.row.referenceImageId ? "已上传" : "上传行图"}</span>
        <input type="file" accept="image/*" onChange={onFileChange} />
      </label>

      <div className="row-actions">
        <button className="ghost-button" onClick={props.onDuplicate}>复制</button>
        <button className="ghost-button danger-button" onClick={props.onDelete}>删除</button>
      </div>
    </div>
  );
}

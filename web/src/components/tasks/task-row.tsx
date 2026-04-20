import type { ChangeEvent } from "react";
import {
  applyModelSelection,
  clampTaskCount,
  formatResolutionLabel,
  getModelOption
} from "../../lib/model-options";
import type { ModelOption, ReferenceImageRecord, TaskDraft } from "../../lib/types";

export function TaskRow(props: {
  row: TaskDraft;
  models: ModelOption[];
  onChange: (next: TaskDraft) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUploadReference: (file: File) => Promise<ReferenceImageRecord>;
}) {
  const selectedModel = getModelOption(props.models, props.row.model);

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
      <div className="task-row-main">
        <label className="stacked prompt-field">
          <span>提示词</span>
          <textarea
            placeholder="输入提示词"
            value={props.row.prompt}
            onChange={(event) => props.onChange({ ...props.row, prompt: event.target.value })}
          />
        </label>

        <div className="task-row-controls">
          <label className="stacked">
            <span>模型</span>
            <select
              value={props.row.model}
              onChange={(event) => {
                const nextModel = getModelOption(props.models, event.target.value);
                props.onChange(applyModelSelection(nextModel, props.row));
              }}
            >
              {props.models.map((model) => (
                <option key={model.value} value={model.value}>{model.label}</option>
              ))}
            </select>
          </label>

          <label className="stacked">
            <span>比例</span>
            <select
              value={props.row.aspectRatio}
              onChange={(event) => props.onChange({ ...props.row, aspectRatio: event.target.value })}
            >
              {selectedModel.aspectRatios.map((aspectRatio) => (
                <option key={aspectRatio} value={aspectRatio}>{aspectRatio}</option>
              ))}
            </select>
          </label>

          <label className="stacked">
            <span>分辨率</span>
            <select
              value={props.row.resolution}
              onChange={(event) => props.onChange({ ...props.row, resolution: event.target.value })}
            >
              {selectedModel.resolutions.map((resolution) => (
                <option key={resolution} value={resolution}>{formatResolutionLabel(resolution)}</option>
              ))}
            </select>
          </label>

          <label className="stacked">
            <span>张数</span>
            <input
              type="number"
              min={1}
              max={selectedModel.maxN}
              value={props.row.n}
              onChange={(event) => {
                const next = Number(event.target.value);
                props.onChange({
                  ...props.row,
                  n: Number.isNaN(next) ? 1 : clampTaskCount(next, selectedModel)
                });
              }}
            />
          </label>

          <label className="stacked">
            <span>参考图</span>
            <select
              value={selectedModel.supportsReferenceImages ? props.row.referenceMode : "none"}
              disabled={!selectedModel.supportsReferenceImages}
              onChange={(event) => props.onChange({
                ...props.row,
                referenceMode: event.target.value as TaskDraft["referenceMode"],
                referenceImageId: event.target.value === "row" ? props.row.referenceImageId : null
              })}
            >
              <option value="none">无</option>
              <option value="global">全局参考图</option>
              <option value="row">当前行上传</option>
            </select>
          </label>
        </div>
      </div>

      <div className="task-row-footer">
        <label className="inline-upload row-upload">
          <span>
            {!selectedModel.supportsReferenceImages
              ? "当前模型不支持参考图"
              : props.row.referenceMode === "row" && props.row.referenceImageId
                ? "已上传参考图"
                : "上传当前行参考图"}
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={onFileChange}
            disabled={!selectedModel.supportsReferenceImages}
          />
        </label>

        <div className="row-actions">
          <button className="ghost-button" onClick={props.onDuplicate}>复制</button>
          <button className="ghost-button danger-button" onClick={props.onDelete}>删除</button>
        </div>
      </div>
    </div>
  );
}

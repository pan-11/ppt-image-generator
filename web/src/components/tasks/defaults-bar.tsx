import type { ChangeEvent } from "react";
import {
  applyModelSelection,
  clampTaskCount,
  formatResolutionLabel,
  getModelOption
} from "../../lib/model-options";
import type { DefaultsState, ModelOption, ReferenceImageRecord } from "../../lib/types";

export function DefaultsBar(props: {
  defaults: DefaultsState;
  models: ModelOption[];
  uploading: boolean;
  globalReferenceImage: ReferenceImageRecord | null;
  onDefaultsChange: (next: DefaultsState) => void;
  onUploadGlobalReference: (file: File) => Promise<void>;
}) {
  const selectedModel = getModelOption(props.models, props.defaults.model);

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await props.onUploadGlobalReference(file);
    event.target.value = "";
  };

  return (
    <section className="panel defaults-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">默认参数</p>
          <h2>批量新建时自动带入</h2>
        </div>
        <span className="status-pill">并发固定 5</span>
      </div>

      <div className="defaults-grid">
        <label className="model-select-field defaults-model-field">
          模型
          <select
            className="model-select"
            title={selectedModel.label}
            value={props.defaults.model}
            onChange={(event) => {
              const nextModel = getModelOption(props.models, event.target.value);
              props.onDefaultsChange(applyModelSelection(nextModel, props.defaults));
            }}
          >
            {props.models.map((model) => (
              <option key={model.value} value={model.value} title={model.label}>{model.label}</option>
            ))}
          </select>
        </label>

        <label className="compact-field">
          比例
          <select
            value={props.defaults.aspectRatio}
            onChange={(event) => props.onDefaultsChange({ ...props.defaults, aspectRatio: event.target.value })}
          >
            {selectedModel.aspectRatios.map((aspectRatio) => (
              <option key={aspectRatio} value={aspectRatio}>{aspectRatio}</option>
            ))}
          </select>
        </label>

        <label className="compact-field">
          分辨率
          <select
            value={props.defaults.resolution}
            onChange={(event) => props.onDefaultsChange({ ...props.defaults, resolution: event.target.value })}
          >
            {selectedModel.resolutions.map((resolution) => (
              <option key={resolution} value={resolution}>{formatResolutionLabel(resolution)}</option>
            ))}
          </select>
        </label>

        <label className="count-field">
          张数
          <input
            type="number"
            min={1}
            max={selectedModel.maxN}
            value={props.defaults.n}
            onChange={(event) => {
              const next = Number(event.target.value);
              props.onDefaultsChange({
                ...props.defaults,
                n: Number.isNaN(next) ? 1 : clampTaskCount(next, selectedModel)
              });
            }}
          />
        </label>

        <label className="upload-field reference-field">
          全局参考图
          <input
            type="file"
            accept="image/*"
            onChange={onFileChange}
            disabled={!selectedModel.supportsReferenceImages}
          />
          <span>
            {!selectedModel.supportsReferenceImages
              ? "当前模型不支持参考图"
              : props.uploading
                ? "上传中..."
                : props.globalReferenceImage?.filename ?? "未设置"}
          </span>
        </label>
      </div>
    </section>
  );
}

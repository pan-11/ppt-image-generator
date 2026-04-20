import type { ChangeEvent } from "react";
import type { DefaultsState, ModelOption, ReferenceImageRecord } from "../../lib/types";

export function DefaultsBar(props: {
  defaults: DefaultsState;
  models: ModelOption[];
  uploading: boolean;
  globalReferenceImage: ReferenceImageRecord | null;
  onDefaultsChange: (next: DefaultsState) => void;
  onUploadGlobalReference: (file: File) => Promise<void>;
}) {
  const selectedModel = props.models.find((model) => model.value === props.defaults.model) ?? props.models[0];

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
        <label>
          模型
          <select
            value={props.defaults.model}
            onChange={(event) => {
              const nextModel = props.models.find((item) => item.value === event.target.value) ?? props.models[0];
              props.onDefaultsChange({
                ...props.defaults,
                model: nextModel.value,
                size: nextModel.sizes[0],
                n: Math.min(props.defaults.n, nextModel.maxN)
              });
            }}
          >
            {props.models.map((model) => (
              <option key={model.value} value={model.value}>{model.label}</option>
            ))}
          </select>
        </label>

        <label>
          尺寸
          <select
            value={props.defaults.size}
            onChange={(event) => props.onDefaultsChange({ ...props.defaults, size: event.target.value })}
          >
            {selectedModel.sizes.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>

        <label>
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
                n: Number.isNaN(next) ? 1 : Math.min(Math.max(next, 1), selectedModel.maxN)
              });
            }}
          />
        </label>

        <label className="upload-field">
          全局参考图
          <input type="file" accept="image/*" onChange={onFileChange} />
          <span>{props.uploading ? "上传中..." : props.globalReferenceImage?.filename ?? "未设置"}</span>
        </label>
      </div>
    </section>
  );
}

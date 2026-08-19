import type { ChangeEvent } from "react";
import {
  applyAspectRatioSelection,
  applyModelSelection,
  clampTaskCount,
  formatResolutionLabel,
  getModelOption,
  getResolutionsForAspectRatio,
  validateDraftForRole
} from "../../lib/model-options";
import type { DefaultsState, ReferenceImageRecord, RoleSettings } from "../../lib/types";

export function DefaultsBar(props: {
  defaults: DefaultsState;
  roles: { text: RoleSettings; image: RoleSettings };
  uploading: boolean;
  globalReferenceImage: ReferenceImageRecord | null;
  onDefaultsChange: (next: DefaultsState) => void;
  onUploadGlobalReference: (file: File) => Promise<void>;
}) {
  const roleKey = props.defaults.globalReferenceImageId ? "image" : "text";
  const role = props.roles[roleKey];
  const selectedCapability = role.models.find((model) => model.value === props.defaults.model);
  const selectedModel = selectedCapability ?? {
    value: props.defaults.model,
    label: props.defaults.model,
    aspectRatios: [props.defaults.aspectRatio],
    resolutions: [props.defaults.resolution],
    maxN: Math.max(1, props.defaults.n),
    supportsReferenceImages: false
  };
  const resolutionOptions = getResolutionsForAspectRatio(selectedModel, props.defaults.aspectRatio);
  const validationError = validateDraftForRole(props.defaults, role);
  const validationErrorId = "defaults-validation-error";

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
        <span className="status-pill">{roleKey === "text" ? "文生图" : "图生图"} · {role.providerName} · 并发 {role.maxConcurrency}</span>
      </div>

      <div className="defaults-grid">
        <label className="model-select-field defaults-model-field">
          模型
          <select
            className="model-select"
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? validationErrorId : undefined}
            title={selectedModel.label}
            value={props.defaults.model}
            onChange={(event) => {
              const nextModel = getModelOption(role.models, event.target.value);
              props.onDefaultsChange(applyModelSelection(nextModel, props.defaults));
            }}
          >
            {!selectedCapability ? <option value={props.defaults.model} disabled>{props.defaults.model}（当前不支持）</option> : null}
            {role.models.map((model) => (
              <option key={model.value} value={model.value} title={model.label}>{model.label}</option>
            ))}
          </select>
        </label>

        <label className="compact-field">
          比例
          <select
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? validationErrorId : undefined}
            value={props.defaults.aspectRatio}
            onChange={(event) => props.onDefaultsChange(applyAspectRatioSelection(selectedModel, props.defaults, event.target.value))}
          >
            {!selectedCapability || !selectedModel.aspectRatios.includes(props.defaults.aspectRatio)
              ? <option value={props.defaults.aspectRatio} disabled>{props.defaults.aspectRatio}（当前不支持）</option>
              : null}
            {selectedCapability?.aspectRatios.map((aspectRatio) => (
              <option key={aspectRatio} value={aspectRatio}>{aspectRatio}</option>
            ))}
          </select>
        </label>

        <label className="compact-field">
          分辨率
          <select
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? validationErrorId : undefined}
            value={props.defaults.resolution}
            onChange={(event) => props.onDefaultsChange({ ...props.defaults, resolution: event.target.value })}
          >
            {!selectedCapability || !resolutionOptions.includes(props.defaults.resolution)
              ? <option value={props.defaults.resolution} disabled>{formatResolutionLabel(props.defaults.resolution)}（当前不支持）</option>
              : null}
            {selectedCapability ? resolutionOptions.map((resolution) => (
              <option key={resolution} value={resolution}>{formatResolutionLabel(resolution)}</option>
            )) : null}
          </select>
        </label>

        <label className="count-field">
          张数
          <input
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? validationErrorId : undefined}
            type="number"
            min={1}
            max={selectedCapability?.maxN ?? props.defaults.n}
            value={props.defaults.n}
            onChange={(event) => {
              const next = Number(event.target.value);
              props.onDefaultsChange({
                ...props.defaults,
                n: Number.isNaN(next) ? 1 : selectedCapability
                  ? clampTaskCount(next, selectedCapability)
                  : props.defaults.n
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
          />
          <span>
            {props.uploading
                ? "上传中..."
                : props.globalReferenceImage?.filename ?? "未设置"}
          </span>
        </label>
      </div>
      {validationError ? <p className="error-copy" id={validationErrorId}>{validationError}</p> : null}
    </section>
  );
}

import { useState } from "react";
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
  uploading?: boolean;
  globalReferenceImage?: ReferenceImageRecord | null;
  onDefaultsChange: (next: DefaultsState) => void;
  onUploadGlobalReference?: (file: File) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
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


  return (
    <section className="panel defaults-panel workbench-defaults">
      <div className="workbench-defaults-summary">
        <div><strong>新页默认参数</strong>
        <p>{selectedModel.label} · {props.defaults.aspectRatio} · {formatResolutionLabel(props.defaults.resolution)} · 每页 {props.defaults.n} 张 · {props.defaults.globalReferenceImageId ? "已设参考图" : "无参考图"} · {role.providerName}</p></div>
        <button className="ghost-button" aria-expanded={expanded || Boolean(validationError)} aria-controls="defaults-form" onClick={() => setExpanded(!expanded)}>{expanded ? "收起参数" : "修改参数"}</button>
      </div>
      <div id="defaults-form" className="workbench-defaults-form" hidden={!expanded && !validationError}>
      <p className="defaults-provider-summary">{roleKey === "text" ? "文生图" : "图生图"} · {role.providerName} · 并发 {role.maxConcurrency}。模型、比例、分辨率和张数用于新建或导入页面。</p>
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

        <p className="reference-empty">共用参考图请在页面任务中的“共用参考图”设置。</p>
      </div>
      {validationError ? <p className="error-copy" role="alert" id={validationErrorId}>{validationError}</p> : null}
      </div>
    </section>
  );
}

import type { ChangeEvent } from "react";
import { useState } from "react";
import {
  applyAspectRatioSelection,
  applyModelSelection,
  clampTaskCount,
  formatResolutionLabel,
  getModelOption,
  getResolutionsForAspectRatio,
  normalizeModelSelection
} from "../../lib/model-options";
import type { ImageRecord, ModelOption, ReferenceImageRecord, TaskDraft, TaskRecord } from "../../lib/types";

function getPreviewUrl(imageId: string) {
  return `/api/download/images/${imageId}`;
}

export function TaskRow(props: {
  rowNumber: number;
  row: TaskDraft;
  models: ModelOption[];
  previewImages?: ImageRecord[];
  allImages?: ImageRecord[];
  batchTasks?: TaskRecord[];
  onChange: (next: TaskDraft) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  generating?: boolean;
  onGenerate: () => void;
  onUploadReference: (file: File) => Promise<ReferenceImageRecord>;
  onCreateChildTasks: (parentImageId: string, tasks: TaskDraft[]) => Promise<TaskRecord[]>;
}) {
  const [selectedPreview, setSelectedPreview] = useState<ImageRecord | null>(null);
  const [childDraftsByImage, setChildDraftsByImage] = useState<Record<string, TaskDraft[]>>({});
  const [expandedSettingsByImage, setExpandedSettingsByImage] = useState<Record<string, boolean>>({});
  const [submittingImageId, setSubmittingImageId] = useState<string | null>(null);
  const selectedModel = getModelOption(props.models, props.row.model);
  const resolutionOptions = getResolutionsForAspectRatio(selectedModel, props.row.aspectRatio);
  const previewImages = props.previewImages ?? [];
  const allImages = props.allImages ?? previewImages;
  const batchTasks = props.batchTasks ?? [];

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
    <>
      <div className="task-row">
        <div className="task-row-number">第 {props.rowNumber} 张图</div>
        <div className="task-row-main">
          <div className="task-row-prompt-results">
            <label className="stacked prompt-field">
              <span>提示词</span>
              <textarea
                placeholder="输入提示词"
                value={props.row.prompt}
                onChange={(event) => props.onChange({ ...props.row, prompt: event.target.value })}
              />
            </label>

            {previewImages.length > 0 ? (
              <div className="task-row-previews" aria-label="结果图">
                {previewImages.map((image) => (
                  <ResultBranch
                    key={image.id}
                    image={image}
                    sourceRow={props.row}
                    models={props.models}
                    allImages={allImages}
                    batchTasks={batchTasks}
                    drafts={childDraftsByImage[image.id]}
                    expandedSettings={Boolean(expandedSettingsByImage[image.id])}
                    submitting={submittingImageId === image.id}
                    onPreview={setSelectedPreview}
                    onDraftsChange={(nextDrafts) => setChildDraftsByImage((current) => ({
                      ...current,
                      [image.id]: nextDrafts
                    }))}
                    onToggleSettings={() => setExpandedSettingsByImage((current) => ({
                      ...current,
                      [image.id]: !current[image.id]
                    }))}
                    onCreateChildTasks={async (parentImageId, tasks) => {
                      setSubmittingImageId(image.id);
                      try {
                        await props.onCreateChildTasks(parentImageId, tasks);
                        setChildDraftsByImage((current) => ({
                          ...current,
                          [image.id]: [createChildDraft(props.row, props.models)]
                        }));
                      } finally {
                        setSubmittingImageId(null);
                      }
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="task-row-controls">
            <label className="stacked model-select-field task-model-field">
              <span>模型</span>
              <select
                className="model-select"
                title={selectedModel.label}
                value={props.row.model}
                onChange={(event) => {
                  const nextModel = getModelOption(props.models, event.target.value);
                  props.onChange(applyModelSelection(nextModel, props.row));
                }}
              >
                {props.models.map((model) => (
                  <option key={model.value} value={model.value} title={model.label}>{model.label}</option>
                ))}
              </select>
            </label>

            <label className="stacked compact-field">
              <span>比例</span>
              <select
                value={props.row.aspectRatio}
                onChange={(event) => props.onChange(applyAspectRatioSelection(selectedModel, props.row, event.target.value))}
              >
                {selectedModel.aspectRatios.map((aspectRatio) => (
                  <option key={aspectRatio} value={aspectRatio}>{aspectRatio}</option>
                ))}
              </select>
            </label>

            <label className="stacked compact-field">
              <span>分辨率</span>
              <select
                value={props.row.resolution}
                onChange={(event) => props.onChange({ ...props.row, resolution: event.target.value })}
              >
                {resolutionOptions.map((resolution) => (
                  <option key={resolution} value={resolution}>{formatResolutionLabel(resolution)}</option>
                ))}
              </select>
            </label>

            <label className="stacked count-field">
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

            <label className="stacked reference-mode-field">
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
            <button
              className="primary-button"
              disabled={props.generating || !props.row.prompt.trim()}
              onClick={props.onGenerate}
            >
              {props.generating ? "生成中..." : "生成这张图"}
            </button>
            <button className="ghost-button" onClick={props.onDuplicate}>复制</button>
            <button className="ghost-button danger-button" onClick={props.onDelete}>删除</button>
          </div>
        </div>
      </div>

      {selectedPreview ? (
        <div className="modal-backdrop" onClick={() => setSelectedPreview(null)}>
          <div
            className="modal-card image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">图片预览</p>
                <h3>{selectedPreview.filename}</h3>
              </div>
              <button className="ghost-button" onClick={() => setSelectedPreview(null)}>关闭</button>
            </div>

            <img
              className="lightbox-image"
              src={getPreviewUrl(selectedPreview.id)}
              alt={selectedPreview.filename}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function createChildDraft(source: TaskDraft | TaskRecord, models: ModelOption[], overrides?: Partial<TaskDraft>): TaskDraft {
  const model = getModelOption(models, source.model);
  const aspectRatio = "aspectRatio" in source
    ? source.aspectRatio
    : source.aspect_ratio ?? model.aspectRatios[0] ?? "1:1";
  const resolution = source.resolution ?? model.resolutions[0] ?? "1K";

  return normalizeModelSelection(model, {
    id: `child-${Math.random().toString(36).slice(2, 10)}`,
    prompt: "",
    model: model.value,
    aspectRatio,
    resolution,
    n: source.n,
    referenceMode: "row",
    referenceImageId: null,
    submittedTaskId: null,
    ...overrides
  });
}

function ResultBranch(props: {
  image: ImageRecord;
  sourceRow: TaskDraft;
  models: ModelOption[];
  allImages: ImageRecord[];
  batchTasks: TaskRecord[];
  drafts?: TaskDraft[];
  expandedSettings?: boolean;
  submitting?: boolean;
  onPreview: (image: ImageRecord) => void;
  onDraftsChange?: (drafts: TaskDraft[]) => void;
  onToggleSettings?: () => void;
  onCreateChildTasks: (parentImageId: string, tasks: TaskDraft[]) => Promise<void>;
}) {
  const sourceTask = props.batchTasks.find((task) => task.id === props.image.task_id);
  const source = sourceTask ?? props.sourceRow;
  const [localDrafts, setLocalDrafts] = useState(() => props.drafts ?? [createChildDraft(source, props.models)]);
  const [localExpanded, setLocalExpanded] = useState(false);
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const drafts = props.drafts ?? localDrafts;
  const expanded = props.expandedSettings ?? localExpanded;
  const submitting = props.submitting ?? localSubmitting;
  const childTasks = props.batchTasks.filter((task) => task.parent_image_id === props.image.id);

  const setDrafts = (nextDrafts: TaskDraft[]) => {
    if (props.onDraftsChange) {
      props.onDraftsChange(nextDrafts);
    } else {
      setLocalDrafts(nextDrafts);
    }
  };

  const updateDraft = (index: number, draft: TaskDraft) => {
    setDrafts(drafts.map((item, itemIndex) => itemIndex === index ? draft : item));
  };

  const submit = async () => {
    const validDrafts = drafts.filter((draft) => draft.prompt.trim());
    if (validDrafts.length === 0) {
      return;
    }

    if (!props.onDraftsChange) {
      setLocalSubmitting(true);
    }

    try {
      await props.onCreateChildTasks(props.image.id, validDrafts);
      setDrafts([createChildDraft(source, props.models)]);
    } finally {
      if (!props.onDraftsChange) {
        setLocalSubmitting(false);
      }
    }
  };

  return (
    <article className="result-branch">
      <div className="result-node-main">
        <button
          type="button"
          className="result-image-button"
          aria-label={`查看 ${props.image.filename} 大图`}
          onClick={() => props.onPreview(props.image)}
        >
          <img src={getPreviewUrl(props.image.id)} alt="" loading="lazy" />
          <span>{props.image.filename}</span>
        </button>

        <div className="child-generator">
          <div className="child-generator-heading">
            <strong>以这个图为参考图</strong>
            <button type="button" className="ghost-button" onClick={() => setDrafts([...drafts, createChildDraft(source, props.models)])}>
              新增一条
            </button>
          </div>

          <div className="child-draft-list">
            {drafts.map((draft, index) => {
              const draftModel = getModelOption(props.models, draft.model);
              const draftResolutionOptions = getResolutionsForAspectRatio(draftModel, draft.aspectRatio);

              return (
                <div className="child-draft" key={draft.id}>
                  <label className="stacked">
                    <span>子提示词 {index + 1}</span>
                    <textarea
                      value={draft.prompt}
                      onChange={(event) => updateDraft(index, { ...draft, prompt: event.target.value })}
                      placeholder="输入基于这张结果图继续生成的提示词"
                    />
                  </label>

                  {expanded ? (
                    <div className="child-settings-grid">
                      <label className="stacked">
                        <span>模型</span>
                        <select
                          value={draft.model}
                          onChange={(event) => updateDraft(index, applyModelSelection(getModelOption(props.models, event.target.value), draft))}
                        >
                          {props.models.map((model) => (
                            <option key={model.value} value={model.value}>{model.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="stacked">
                        <span>比例</span>
                        <select
                          value={draft.aspectRatio}
                          onChange={(event) => updateDraft(index, applyAspectRatioSelection(draftModel, draft, event.target.value))}
                        >
                          {draftModel.aspectRatios.map((aspectRatio) => (
                            <option key={aspectRatio} value={aspectRatio}>{aspectRatio}</option>
                          ))}
                        </select>
                      </label>
                      <label className="stacked">
                        <span>分辨率</span>
                        <select value={draft.resolution} onChange={(event) => updateDraft(index, { ...draft, resolution: event.target.value })}>
                          {draftResolutionOptions.map((resolution) => (
                            <option key={resolution} value={resolution}>{formatResolutionLabel(resolution)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="stacked">
                        <span>张数</span>
                        <input
                          type="number"
                          min={1}
                          max={draftModel.maxN}
                          value={draft.n}
                          onChange={(event) => updateDraft(index, {
                            ...draft,
                            n: clampTaskCount(Number(event.target.value), draftModel)
                          })}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="child-actions">
            <button type="button" className="ghost-button" onClick={props.onToggleSettings ?? (() => setLocalExpanded((current) => !current))}>
              参数
            </button>
            <button type="button" className="primary-button" disabled={submitting} onClick={() => void submit()}>
              {submitting ? "生成中..." : "生成子图"}
            </button>
          </div>
        </div>
      </div>

      {childTasks.length > 0 ? (
        <div className="result-children">
          {childTasks.map((task) => {
            const images = props.allImages.filter((image) => image.task_id === task.id);
            return (
              <div className="child-task-group" key={task.id}>
                <div className="child-task-prompt">
                  <strong>{task.prompt}</strong>
                  <span className={`status-chip status-${task.status}`}>{task.status}</span>
                </div>
                {images.map((image) => (
                  <ResultBranch
                    key={image.id}
                    image={image}
                    sourceRow={props.sourceRow}
                    models={props.models}
                    allImages={props.allImages}
                    batchTasks={props.batchTasks}
                    onPreview={props.onPreview}
                    onCreateChildTasks={props.onCreateChildTasks}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

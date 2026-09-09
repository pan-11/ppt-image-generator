import type { ChangeEvent } from "react";
import { useState } from "react";
import {
  applyAspectRatioSelection,
  applyModelSelection,
  clampTaskCount,
  formatResolutionLabel,
  getModelOption,
  getResolutionsForAspectRatio,
  normalizeModelSelection,
  roleForDraft,
  validateDraftForRole
} from "../../lib/model-options";
import type {
  ImageRecord,
  ModelOption,
  ReferenceImageRecord,
  RoleSettings,
  TaskDraft,
  TaskRecord
} from "../../lib/types";
import { formatTaskStatus } from "../../lib/status-labels";
import { getPageCandidates, PageCandidateStrip, type PageSelectionProps } from "../courseware/page-selection-panel";
import { ModalDialog } from "../ui/modal-dialog";

function getPreviewUrl(imageId: string) {
  return `/api/download/images/${imageId}`;
}

export function TaskRow(props: {
  rowNumber: number;
  row: TaskDraft;
  pageSelection?: PageSelectionProps;
  roles: { text: RoleSettings; image: RoleSettings };
  globalReferenceImageId: string | null;
  previewImages?: ImageRecord[];
  allImages?: ImageRecord[];
  batchTasks?: TaskRecord[];
  onChange: (next: TaskDraft) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  generating?: boolean;
  generationDisabled?: boolean;
  onGenerate: () => void;
  onUploadReference: (file: File) => Promise<ReferenceImageRecord>;
  onCreateChildTasks: (parentImageId: string, tasks: TaskDraft[]) => Promise<TaskRecord[]>;
}) {
  const [selectedPreview, setSelectedPreview] = useState<ImageRecord | null>(null);
  const [promptOpen, setPromptOpen] = useState(props.rowNumber === 1 && !props.row.prompt.trim());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const role = props.roles[roleForDraft(props.row, props.globalReferenceImageId)];
  const selectedCapability = role.models.find((model) => model.value === props.row.model);
  const selectedModel = selectedCapability ?? unsupportedModel(props.row);
  const resolutionOptions = getResolutionsForAspectRatio(selectedModel, props.row.aspectRatio);
  const validationError = validateDraftForRole(props.row, role);
  const validationErrorId = `task-row-${props.row.id}-error`;
  const previewImages = props.previewImages ?? [];
  const allImages = props.pageSelection?.detail?.images ?? props.allImages ?? previewImages;
  const batchTasks = props.pageSelection?.detail?.tasks ?? props.batchTasks ?? [];
  const reachableTaskIds = new Set([props.row.submittedTaskId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const task of batchTasks) {
      if (!reachableTaskIds.has(task.id) && allImages.some((image) => image.id === task.parent_image_id && reachableTaskIds.has(image.task_id))) {
        reachableTaskIds.add(task.id); grew = true;
      }
    }
  }
  const candidates = props.pageSelection ? getPageCandidates(props.pageSelection) : allImages.filter((image) => reachableTaskIds.has(image.task_id) || previewImages.some((preview) => preview.id === image.id));
  const pageTaskIds = new Set(candidates.map((image) => image.task_id));
  props.pageSelection?.detail?.links.filter((link) => link.pageId === props.pageSelection?.page.id && link.purpose !== "textless").forEach((link) => pageTaskIds.add(link.taskId));
  const pageTasks = batchTasks.filter((task) => pageTaskIds.has(task.id) || reachableTaskIds.has(task.id));
  const currentTask = batchTasks.find((task) => task.id === props.row.submittedTaskId) ?? pageTasks.filter((task) => !task.parent_image_id).at(-1);
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(props.row.prompt); setCopyMessage("已复制本页提示词"); setCopyFallback(null); }
    catch { setCopyMessage("复制失败，请从下方全选复制。"); setCopyFallback(props.row.prompt); }
  };

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
      <div className="task-row workbench-page-row">
        <div className="workbench-page-info">
          <div className="workbench-page-heading"><span className="workbench-page-number">{String(props.rowNumber).padStart(2, "0")}</span><strong title={props.pageSelection?.page.sourcePageName || props.row.note || `第 ${props.rowNumber} 页`}>{props.pageSelection?.page.sourcePageName || props.row.note || `第 ${props.rowNumber} 页`}</strong></div>
          <span className={`status-chip status-${currentTask?.status ?? "draft"}`}>{props.generating ? "生成中" : currentTask ? formatTaskStatus(currentTask.status) : "待生成"}</span>
          <p className="workbench-page-summary">{roleForDraft(props.row, props.globalReferenceImageId) === "text" ? "文生图" : "图生图"} · {role.providerName}</p>
          <p className="workbench-page-summary" title={selectedModel.label}>{props.row.aspectRatio} · {formatResolutionLabel(props.row.resolution)} · {props.row.n} 张</p>
          {props.pageSelection ? <label><input type="checkbox" checked={props.pageSelection.page.included} onChange={(event) => props.pageSelection!.onChange({ ...props.pageSelection!.page, included: event.target.checked })} />参与 PPT 导出</label> : null}
        </div>
        <div className="workbench-page-candidates">
          {candidates.length || props.pageSelection ? <PageCandidateStrip candidates={candidates} tasks={batchTasks} selection={props.pageSelection} onPreview={setSelectedPreview} editingImageId={editingImageId} onEdit={(image) => setEditingImageId((current) => current === image.id ? null : image.id)} /> : <p className="workbench-candidate-empty">生成后在这里预览、修改和选择定稿</p>}
        </div>
        <div className="workbench-page-actions">
          <button className="ghost-button" disabled={props.generating || props.generationDisabled || !props.row.prompt.trim() || Boolean(validationError)} onClick={props.onGenerate}>{props.generating ? "生成中..." : "生成这张图"}</button>
          <button className="ghost-button" aria-expanded={promptOpen} aria-controls={`prompt-${props.row.id}`} onClick={() => setPromptOpen((open) => !open)}>编辑提示词</button>
          <button className="ghost-button" aria-expanded={settingsOpen} aria-controls={`settings-${props.row.id}`} onClick={() => setSettingsOpen((open) => !open)}>页面参数</button>
          <button className="ghost-button" onClick={() => void copyPrompt()}>复制本页提示词</button>
          <details className="workbench-page-more"><summary>更多</summary>
            <div className="workbench-page-menu">
            {props.pageSelection ? <><button className="ghost-button" disabled={props.pageSelection.first} onClick={() => props.pageSelection?.onMove(-1)}>上移</button><button className="ghost-button" disabled={props.pageSelection.last} onClick={() => props.pageSelection?.onMove(1)}>下移</button></> : null}
            <button className="ghost-button" onClick={props.onDuplicate}>复制页面</button>
            <button className="ghost-button danger-button" onClick={props.onDelete}>移除当前页</button>
            </div>
          </details>
        </div>
        {validationError ? <p className="error-copy workbench-page-detail" id={validationErrorId}>{validationError}，请打开页面参数修正。</p> : null}
        {pageTasks.filter((task) => task.error_message).map((task) => <details key={task.id} className="workbench-page-detail error-copy"><summary>{formatTaskStatus(task.status)} · 查看错误详情</summary><p>{task.error_message}</p></details>)}
        <div className="workbench-page-detail" id={`prompt-${props.row.id}`} hidden={!promptOpen}>
          {props.row.note ? <p className="workbench-page-note">{props.row.note}</p> : null}
          <label className="stacked prompt-field"><span>提示词</span><textarea placeholder="输入提示词" value={props.row.prompt} onChange={(event) => props.onChange({ ...props.row, prompt: event.target.value })} /></label>
        </div>
        <div className="workbench-page-detail task-row-controls" id={`settings-${props.row.id}`} hidden={!settingsOpen}>
            <label className="stacked model-select-field task-model-field">
              <span>模型</span>
              <select
                className="model-select"
                aria-invalid={Boolean(validationError)}
                aria-describedby={validationError ? validationErrorId : undefined}
                title={selectedModel.label}
                value={props.row.model}
                onChange={(event) => {
                  const nextModel = getModelOption(role.models, event.target.value);
                  props.onChange(applyModelSelection(nextModel, props.row));
                }}
              >
                {!selectedCapability ? <option value={props.row.model} disabled>{props.row.model}（当前不支持）</option> : null}
                {role.models.map((model) => (
                  <option key={model.value} value={model.value} title={model.label}>{model.label}</option>
                ))}
              </select>
            </label>

            <label className="stacked compact-field">
              <span>比例</span>
              <select
                aria-invalid={Boolean(validationError)}
                aria-describedby={validationError ? validationErrorId : undefined}
                value={props.row.aspectRatio}
                onChange={(event) => props.onChange(applyAspectRatioSelection(selectedModel, props.row, event.target.value))}
              >
                {!selectedCapability || !selectedModel.aspectRatios.includes(props.row.aspectRatio)
                  ? <option value={props.row.aspectRatio} disabled>{props.row.aspectRatio}（当前不支持）</option>
                  : null}
                {selectedCapability?.aspectRatios.map((aspectRatio) => (
                  <option key={aspectRatio} value={aspectRatio}>{aspectRatio}</option>
                ))}
              </select>
            </label>

            <label className="stacked compact-field">
              <span>分辨率</span>
              <select
                aria-invalid={Boolean(validationError)}
                aria-describedby={validationError ? validationErrorId : undefined}
                value={props.row.resolution}
                onChange={(event) => props.onChange({ ...props.row, resolution: event.target.value })}
              >
                {!selectedCapability || !resolutionOptions.includes(props.row.resolution)
                  ? <option value={props.row.resolution} disabled>{formatResolutionLabel(props.row.resolution)}（当前不支持）</option>
                  : null}
                {selectedCapability ? resolutionOptions.map((resolution) => (
                  <option key={resolution} value={resolution}>{formatResolutionLabel(resolution)}</option>
                )) : null}
              </select>
            </label>

            <label className="stacked count-field">
              <span>张数</span>
              <input
                aria-invalid={Boolean(validationError)}
                aria-describedby={validationError ? validationErrorId : undefined}
                type="number"
                min={1}
                max={selectedCapability?.maxN ?? props.row.n}
                value={props.row.n}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  props.onChange({
                    ...props.row,
                    n: Number.isNaN(next) ? 1 : selectedCapability
                      ? clampTaskCount(next, selectedCapability)
                      : props.row.n
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

        </div>
        {copyMessage ? <p className="workbench-page-detail" role="status">{copyMessage}</p> : null}
        {copyFallback !== null ? <textarea className="workbench-page-detail" aria-label="手动复制本页提示词" value={copyFallback} readOnly onFocus={(event) => event.target.select()} /> : null}
        {candidates.map((image) => <div className="workbench-page-detail" key={image.id} hidden={editingImageId !== image.id}>
          <ResultBranch image={image} sourceRow={props.row} role={props.roles.image} batchTasks={batchTasks} generationDisabled={props.generationDisabled} onCreateChildTasks={async (parentImageId, tasks) => { await props.onCreateChildTasks(parentImageId, tasks); }} />
        </div>)}
      </div>

      {selectedPreview ? (
        <ModalDialog open label="图片预览" className="image-lightbox" onClose={() => setSelectedPreview(null)}>
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">图片预览</p>
                <h3>{selectedPreview.filename}</h3>
              </div>
              <button className="ghost-button" data-modal-initial-focus onClick={() => setSelectedPreview(null)}>关闭</button>
            </div>

            <img
              className="lightbox-image"
              src={getPreviewUrl(selectedPreview.id)}
              alt={selectedPreview.filename}
            />
        </ModalDialog>
      ) : null}
    </>
  );
}

function unsupportedModel(draft: Pick<TaskDraft, "model" | "aspectRatio" | "resolution" | "n">): ModelOption {
  return {
    value: draft.model,
    label: draft.model,
    aspectRatios: [draft.aspectRatio],
    resolutions: [draft.resolution],
    maxN: Math.max(1, draft.n),
    supportsReferenceImages: false
  };
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
    note: "",
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
  role: RoleSettings;
  batchTasks: TaskRecord[];
  generationDisabled?: boolean;
  onCreateChildTasks: (parentImageId: string, tasks: TaskDraft[]) => Promise<void>;
}) {
  const sourceTask = props.batchTasks.find((task) => task.id === props.image.task_id);
  const source = sourceTask ?? props.sourceRow;
  const [drafts, setDrafts] = useState(() => [createChildDraft(source, props.role.models)]);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const childTasks = props.batchTasks.filter((task) => task.parent_image_id === props.image.id);
  const hasInvalidDraft = drafts.some((draft) => (
    draft.prompt.trim() && validateDraftForRole(draft, props.role)
  ));

  const updateDraft = (index: number, draft: TaskDraft) => {
    setDrafts(drafts.map((item, itemIndex) => itemIndex === index ? draft : item));
  };

  const submit = async () => {
    const validDrafts = drafts.filter((draft) => draft.prompt.trim());
    if (validDrafts.length === 0) {
      return;
    }

    setSubmitting(true);

    setSubmitError(null);
    try {
      await props.onCreateChildTasks(props.image.id, validDrafts);
      setDrafts([createChildDraft(source, props.role.models)]);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "子图生成失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="result-branch">
      <div className="result-node-main">
        <div className="child-generator">
          <div className="child-generator-heading">
            <strong>以这个图为参考图 · 图生图 · {props.role.providerName} · {props.image.filename}</strong>
            <button type="button" className="ghost-button" onClick={() => setDrafts([...drafts, createChildDraft(source, props.role.models)])}>
              新增一条
            </button>
          </div>

          <div className="child-draft-list">
            {drafts.map((draft, index) => {
              const draftCapability = props.role.models.find((model) => model.value === draft.model);
              const draftModel = draftCapability ?? unsupportedModel(draft);
              const draftResolutionOptions = getResolutionsForAspectRatio(draftModel, draft.aspectRatio);
              const draftError = draft.prompt.trim() ? validateDraftForRole(draft, props.role) : null;

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
                  {draftError ? <p className="error-copy">{draftError}</p> : null}

                  <div className="child-settings-grid" hidden={!expanded}>
                      <label className="stacked">
                        <span>模型</span>
                        <select
                          value={draft.model}
                          onChange={(event) => updateDraft(index, applyModelSelection(getModelOption(props.role.models, event.target.value), draft))}
                        >
                          {!draftCapability ? <option value={draft.model} disabled>{draft.model}（当前不支持）</option> : null}
                          {props.role.models.map((model) => (
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
                </div>
              );
            })}
          </div>

          {submitError ? <p role="alert" className="error-copy">{submitError}</p> : null}
          <div className="child-actions">
            <button type="button" className="ghost-button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
              参数
            </button>
            <button type="button" className="primary-button" disabled={submitting || props.generationDisabled || hasInvalidDraft || !drafts.some((draft) => draft.prompt.trim())} onClick={() => void submit()}>
              {submitting ? "生成中..." : "生成子图"}
            </button>
          </div>
        </div>
      </div>

      {childTasks.length > 0 ? (
        <div className="result-children">
          {childTasks.map((task) => {
            return (
              <div className="child-task-group" key={task.id}>
                <div className="child-task-prompt">
                  <strong>{task.prompt}</strong>
                  <span className={`status-chip status-${task.status}`}>{formatTaskStatus(task.status)}</span>
                </div>

              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

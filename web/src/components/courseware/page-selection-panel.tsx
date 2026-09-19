import { useRef, useState } from "react";
import type { CoursewareDetail, CoursewarePage } from "../../lib/courseware-api";
import type { ImageRecord, TaskRecord } from "../../lib/types";
import { pageLabel } from "../../lib/prompt-export";
import { validateImageUpload } from "../../lib/image-upload";
import "./image-upload.css";

export type PageSelectionProps = { page: CoursewarePage; detail: CoursewareDetail | null; onChange: (page: CoursewarePage) => void; onMove: (offset: number) => void; first: boolean; last: boolean };
export type PageCandidate = ImageRecord & { validation_status?: string };

export function getPageCandidates(props: PageSelectionProps): PageCandidate[] {
  const links = props.detail?.links.filter((link) => link.pageId === props.page.id && link.purpose !== "textless") ?? [];
  return props.detail?.images.filter((image) => image.source === "upload" ? image.courseware_id === props.detail?.courseware.id && image.page_id === props.page.id : links.some((link) => link.taskId === image.task_id)) ?? [];
}

export function PageCandidateStrip(props: { candidates: PageCandidate[]; tasks: TaskRecord[]; selection?: PageSelectionProps; onPreview?: (image: ImageRecord) => void; onEdit?: (image: ImageRecord) => void; editingImageId?: string | null; onUpload?: (file: File, uploadId: string) => Promise<void> }) {
  const [copyError, setCopyError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setMessage("已复制"); setCopyError(null); }
    catch { setCopyError(text); setMessage("复制失败，请从下方全选复制。"); }
  };
  const selection = props.selection;
  const candidateLabels = useRef(new Map<string, string>());
  const sourceIdFor = (image: PageCandidate) => props.tasks.find((task) => task.id === image.task_id)?.parent_image_id
    ?? selection?.detail?.links.find((link) => link.taskId === image.task_id)?.sourceImageId;
  const isVariation = (image: PageCandidate) => Boolean(sourceIdFor(image))
    || Boolean(selection?.detail?.links.some((link) => link.taskId === image.task_id && link.purpose === "variation"));
  for (const image of props.candidates) {
    if (!candidateLabels.current.has(image.id)) {
      const labels = [...candidateLabels.current.values()];
      const prefix = image.source === "upload" ? "上传图" : isVariation(image) ? "改图" : "原图";
      candidateLabels.current.set(image.id, `${prefix}${labels.filter(label => label.startsWith(prefix)).length + 1}`);
    }
  }
  return <>
    {!props.candidates.length ? <p className="workbench-candidate-empty">生成后在这里预览、修改和选择定稿</p> : null}
    <div className="page-candidate-workspace"><div className="page-candidates" aria-label="本页候选图片">{props.candidates.map((image) => {
      const task = props.tasks.find((item) => item.id === image.task_id);
      const variation = isVariation(image);
      const selected = selection?.page.selectedImageId === image.id;
      const label = candidateLabels.current.get(image.id)!;
      const sourceId = sourceIdFor(image);
      const sourceImage = props.candidates.find((candidate) => candidate.id === sourceId);
      const sourceLabel = sourceId ? candidateLabels.current.get(sourceId) : undefined;
      return <article key={image.id} className={`page-candidate${selected ? " is-selected" : ""}`}>

        <button type="button" className="result-image-button" aria-label={`查看 ${image.filename} 大图`} onClick={() => props.onPreview?.(image)}>
          <img src={`/api/download/images/${encodeURIComponent(image.id)}`} alt={image.source === "upload" ? "上传成品图候选" : variation ? "子图候选" : "原图候选"} loading="lazy" />
        </button>
        {selection ? <label><input type="radio" name={`final-${selection.page.id}`} aria-label={`${label} · ${selected ? "已选定稿" : "设为定稿"}`} checked={selected} disabled={image.validation_status === "invalid"} onChange={() => selection.onChange({ ...selection.page, selectedImageId: image.id })} />{label} · {selected ? "已选定稿" : "设为定稿"}</label> : <span className="page-candidate-label">{label}</span>}
        {variation ? <small className="page-candidate-source" title={`${sourceImage?.filename ?? sourceId ?? "参考图暂不可用"} · 子图提示词需配合参考图使用`}>{sourceLabel ? `基于${sourceLabel}` : "参考图暂不可用"}{task?.auxiliary_reference_image_id ? " · 补充参考 1 张" : ""}</small> : null}
        {image.source === "upload" ? <small className="page-candidate-source">外部上传</small> : null}
        {image.validation_status === "invalid" ? <small className="error-copy">规格校验失败{selection?.page.selectedImageId === image.id ? " · 当前定稿不可导出" : ""}</small> : null}
        <div className="page-candidate-actions">{props.onEdit ? <button className="ghost-button" aria-label="基于此图修改" aria-expanded={props.editingImageId === image.id} onClick={() => props.onEdit?.(image)}>修改图片</button> : null}
        {image.source !== "upload" ? <button className="ghost-button" aria-label="复制该图提示词" disabled={!task} onClick={() => void copy(task?.prompt ?? "")}>复制提示词</button> : null}</div>
      </article>;
    })}</div>{props.onUpload ? <FinalImageUpload onUpload={props.onUpload} /> : null}</div>
    {selection?.page.selectedImageId && selection.detail && !props.candidates.some((image) => image.id === selection.page.selectedImageId) ? <div><p className="error-copy">定稿图片暂不可用，请检查图片是否仍存在。</p><button className="ghost-button" onClick={() => selection.onChange({ ...selection.page, selectedImageId: null })}>清除失效定稿</button></div> : null}
    {message ? <p role="status">{message}</p> : null}
    {copyError !== null ? <textarea aria-label="手动复制提示词" readOnly value={copyError} onFocus={(event) => event.target.select()} /> : null}
  </>;
}

function FinalImageUpload({ onUpload }: { onUpload: (file: File, uploadId: string) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ file: File; id: string } | null>(null);
  const upload = async (file: File, id: string = crypto.randomUUID()) => {
    if (busy.current) return;
    const invalid = validateImageUpload(file);
    if (invalid) { setError(invalid); return; }
    busy.current = true; setUploading(true); setError(null); setRetry({ file, id });
    try { await onUpload(file, id); setRetry(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "上传失败，请重试。"); }
    finally { busy.current = false; setUploading(false); }
  };
  return <div className="final-image-upload" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void upload(file); }}>
    <input ref={input} type="file" aria-label="上传成品图" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
    <button type="button" className="final-image-upload-button" disabled={uploading} onClick={() => input.current?.click()}>{uploading ? "正在上传…" : "＋ 上传成品图"}</button>
    <small>上传后设为本页定稿<br />也可拖入 · PNG / JPG / WebP</small>
    {error ? <p className="error-copy" role="alert">{error}</p> : null}
    {error && retry ? <button type="button" className="ghost-button" disabled={uploading} onClick={() => void upload(retry.file, retry.id)}>重试上传</button> : null}
  </div>;
}

export function PageSelectionPanel(props: PageSelectionProps) {
  return <section className="page-selection" aria-label={`${pageLabel(props.page)}定稿选择`}>
    <label><input type="checkbox" checked={props.page.included} onChange={(event) => props.onChange({ ...props.page, included: event.target.checked })} />参与 PPT 导出</label>
    <PageCandidateStrip candidates={getPageCandidates(props)} tasks={props.detail?.tasks ?? []} selection={props} />
  </section>;
}

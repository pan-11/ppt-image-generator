import { useRef, useState } from "react";
import type { CoursewareDetail, CoursewarePage } from "../../lib/courseware-api";
import type { ImageRecord, TaskRecord } from "../../lib/types";
import { pageLabel } from "../../lib/prompt-export";

export type PageSelectionProps = { page: CoursewarePage; detail: CoursewareDetail | null; onChange: (page: CoursewarePage) => void; onMove: (offset: number) => void; first: boolean; last: boolean };
export type PageCandidate = ImageRecord & { validation_status?: string };

export function getPageCandidates(props: PageSelectionProps): PageCandidate[] {
  const links = props.detail?.links.filter((link) => link.pageId === props.page.id && link.purpose !== "textless") ?? [];
  return props.detail?.images.filter((image) => links.some((link) => link.taskId === image.task_id)) ?? [];
}

export function PageCandidateStrip(props: { candidates: PageCandidate[]; tasks: TaskRecord[]; selection?: PageSelectionProps; onPreview?: (image: ImageRecord) => void; onEdit?: (image: ImageRecord) => void; editingImageId?: string | null }) {
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
      candidateLabels.current.set(image.id, `${isVariation(image) ? "改图" : "原图"}${candidateLabels.current.size + 1}`);
    }
  }
  return <>
    {!props.candidates.length ? <p className="workbench-candidate-empty">生成后在这里预览、修改和选择定稿</p> : null}
    <div className="page-candidates" aria-label="本页候选图片">{props.candidates.map((image) => {
      const task = props.tasks.find((item) => item.id === image.task_id);
      const variation = isVariation(image);
      const selected = selection?.page.selectedImageId === image.id;
      const label = candidateLabels.current.get(image.id)!;
      const sourceId = sourceIdFor(image);
      const sourceImage = props.candidates.find((candidate) => candidate.id === sourceId);
      const sourceLabel = sourceId ? candidateLabels.current.get(sourceId) : undefined;
      return <article key={image.id} className={`page-candidate${selected ? " is-selected" : ""}`}>

        <button type="button" className="result-image-button" aria-label={`查看 ${image.filename} 大图`} onClick={() => props.onPreview?.(image)}>
          <img src={`/api/download/images/${encodeURIComponent(image.id)}`} alt={variation ? "子图候选" : "原图候选"} loading="lazy" />
        </button>
        {selection ? <label><input type="radio" name={`final-${selection.page.id}`} aria-label={`${label} · ${selected ? "已选定稿" : "设为定稿"}`} checked={selected} disabled={image.validation_status === "invalid"} onChange={() => selection.onChange({ ...selection.page, selectedImageId: image.id })} />{label} · {selected ? "已选定稿" : "设为定稿"}</label> : <span className="page-candidate-label">{label}</span>}
        {variation ? <small className="page-candidate-source" title={`${sourceImage?.filename ?? sourceId ?? "参考图暂不可用"} · 子图提示词需配合参考图使用`}>{sourceLabel ? `基于${sourceLabel}` : "参考图暂不可用"}</small> : null}
        {image.validation_status === "invalid" ? <small className="error-copy">规格校验失败{selection?.page.selectedImageId === image.id ? " · 当前定稿不可导出" : ""}</small> : null}
        <div className="page-candidate-actions">{props.onEdit ? <button className="ghost-button" aria-label="基于此图修改" aria-expanded={props.editingImageId === image.id} onClick={() => props.onEdit?.(image)}>修改图片</button> : null}
        <button className="ghost-button" aria-label="复制该图提示词" disabled={!task} onClick={() => void copy(task?.prompt ?? "")}>复制提示词</button></div>
      </article>;
    })}</div>
    {selection?.page.selectedImageId && selection.detail && !props.candidates.some((image) => image.id === selection.page.selectedImageId) ? <div><p className="error-copy">定稿图片暂不可用，请检查图片是否仍存在。</p><button className="ghost-button" onClick={() => selection.onChange({ ...selection.page, selectedImageId: null })}>清除失效定稿</button></div> : null}
    {message ? <p role="status">{message}</p> : null}
    {copyError !== null ? <textarea aria-label="手动复制提示词" readOnly value={copyError} onFocus={(event) => event.target.select()} /> : null}
  </>;
}

export function PageSelectionPanel(props: PageSelectionProps) {
  return <section className="page-selection" aria-label={`${pageLabel(props.page)}定稿选择`}>
    <label><input type="checkbox" checked={props.page.included} onChange={(event) => props.onChange({ ...props.page, included: event.target.checked })} />参与 PPT 导出</label>
    <PageCandidateStrip candidates={getPageCandidates(props)} tasks={props.detail?.tasks ?? []} selection={props} />
  </section>;
}

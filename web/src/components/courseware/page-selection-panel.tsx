import { useState } from "react";
import type { CoursewareDetail, CoursewarePage } from "../../lib/courseware-api";
import { pageLabel } from "../../lib/prompt-export";
export function PageSelectionPanel(props: { page: CoursewarePage; detail: CoursewareDetail | null; onChange: (page: CoursewarePage) => void; onMove: (offset: number) => void; first: boolean; last: boolean }) {
  const [copyError, setCopyError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const links = props.detail?.links.filter((link) => link.pageId === props.page.id && link.purpose !== "textless") ?? [];
  const candidates = props.detail?.images.filter((image) => links.some((link) => link.taskId === image.task_id)) ?? [];
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setMessage("已复制"); setCopyError(null); }
    catch { setCopyError(text); setMessage("复制失败，请从下方全选复制。"); }
  };
  return <section className="page-selection" aria-label={`${pageLabel(props.page)}定稿选择`}>
    <div className="toolbar">
      <label><input type="checkbox" checked={props.page.included} onChange={(event) => props.onChange({ ...props.page, included: event.target.checked })} />参与 PPT 导出</label>
      <button className="ghost-button" disabled={props.first} onClick={() => props.onMove(-1)}>上移</button><button className="ghost-button" disabled={props.last} onClick={() => props.onMove(1)}>下移</button>
      <button className="ghost-button" onClick={() => void copy(props.page.draft.prompt)}>复制本页提示词</button>
    </div>
    <p>原图和子图属于同一页，选择一张作为定稿。</p>
    <div className="page-candidates">{candidates.map((image) => {
      const task = props.detail?.tasks.find((item) => item.id === image.task_id);
      const variation = links.find((link) => link.taskId === image.task_id)?.purpose === "variation";
      return <article key={image.id} className="page-candidate">
        <label><img src={`/api/download/images/${encodeURIComponent(image.id)}`} alt={variation ? "子图候选" : "原图候选"} loading="lazy" /><span><input type="radio" name={`final-${props.page.id}`} checked={props.page.selectedImageId === image.id} disabled={image.validation_status === "invalid"} onChange={() => props.onChange({ ...props.page, selectedImageId: image.id })} />设为本页定稿</span></label>
        {image.validation_status === "invalid" ? <small>规格校验失败</small> : null}
        {variation ? <small>子图提示词需配合参考图使用</small> : null}
        <button className="ghost-button" disabled={!task} onClick={() => void copy(task?.prompt ?? "")}>复制该图提示词</button>
      </article>;
    })}</div>
    {props.page.selectedImageId && props.detail && !candidates.some((image) => image.id === props.page.selectedImageId) ? <div><p className="error-copy">定稿图片暂不可用，请检查图片是否仍存在。</p><button className="ghost-button" onClick={() => props.onChange({ ...props.page, selectedImageId: null })}>清除失效定稿</button></div> : null}
    {message ? <p role="status">{message}</p> : null}
    {copyError !== null ? <textarea aria-label="手动复制提示词" readOnly value={copyError} onFocus={(event) => event.target.select()} /> : null}
  </section>;
}

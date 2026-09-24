import { useEffect, useState } from "react";
import { listCoursewares, type CoursewareSummary } from "../../lib/courseware-api";
import { ModalDialog } from "../ui/modal-dialog";
import "./project-list.css";
export function CoursewareListModal(props: { open: boolean; currentId?: string | null; onClose: () => void; onOpen: (id: string) => Promise<unknown> }) {
  const [items, setItems] = useState<CoursewareSummary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    setError(""); setBusy(true);
    void listCoursewares().then((result) => { if (!cancelled) setItems(result.coursewares); }).catch((cause) => { if (!cancelled) setError(String(cause.message)); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [props.open]);
  return <ModalDialog open={props.open} label="历史项目" onClose={props.onClose}>
    <div className="panel-heading"><h3>历史项目</h3><button className="ghost-button" data-modal-initial-focus onClick={props.onClose}>关闭</button></div>
    {items.map((item) => <button className="courseware-list-item ghost-button" key={item.id} disabled={busy} onClick={async () => { setBusy(true); try { await props.onOpen(item.id); props.onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "打开失败"); } finally { setBusy(false); } }}>
      {item.coverImageId ? <img className="courseware-list-cover" src={`/api/download/images/${encodeURIComponent(item.coverImageId)}`} alt={`${item.name} 封面`} loading="lazy" /> : <span className="courseware-list-cover courseware-list-placeholder">无封面</span>}
      <span className="courseware-list-info"><strong>{item.name}</strong><small>{item.pageCount} 页 · 已选定稿 {item.selectedPageCount ?? 0} 页 · {new Date(item.updatedAt).toLocaleString()}</small></span>
      {props.currentId === item.id ? <small>当前项目</small> : null}
    </button>)}
    {!busy && !items.length ? <p>还没有保存的项目。</p> : null}
    <p role="status">{busy ? "读取中…" : error}</p>
  </ModalDialog>;
}

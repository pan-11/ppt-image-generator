import { useEffect, useState } from "react";
import { listCoursewares, type CoursewareSummary } from "../../lib/courseware-api";
import { ModalDialog } from "../ui/modal-dialog";
export function CoursewareListModal(props: { open: boolean; onClose: () => void; onOpen: (id: string) => Promise<unknown> }) {
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
  return <ModalDialog open={props.open} label="打开课件" onClose={props.onClose}>
    <div className="panel-heading"><h3>本地课件</h3><button className="ghost-button" data-modal-initial-focus onClick={props.onClose}>关闭</button></div>
    {items.map((item) => <button className="courseware-list-item ghost-button" key={item.id} disabled={busy} onClick={async () => { setBusy(true); try { await props.onOpen(item.id); props.onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "打开失败"); } finally { setBusy(false); } }}><strong>{item.name}</strong><span>{item.pageCount} 页 · {new Date(item.updatedAt).toLocaleString()}</span></button>)}
    {!busy && !items.length ? <p>还没有保存的课件。导入提示词后会自动保存。</p> : null}
    <p role="status">{busy ? "读取中…" : error}</p>
  </ModalDialog>;
}

import { useEffect, useState } from "react";
import { ModalDialog } from "../ui/modal-dialog";

export function NewProjectModal(props: { open: boolean; onClose: () => void; onCreateBlank: (name: string) => Promise<void>; onStartImageImport: (name: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (props.open) { setName(`新项目 ${new Date().toLocaleString()}`); setError(""); }
  }, [props.open]);

  return <ModalDialog open={props.open} label="新建项目" onClose={() => { if (!busy) props.onClose(); }}>
    <div className="panel-heading"><h3>新建项目</h3><button className="ghost-button" disabled={busy} onClick={props.onClose}>关闭</button></div>
    <label className="stacked"><span>新项目名称</span><input data-modal-initial-focus aria-label="新项目名称" value={name} onChange={(event) => setName(event.target.value)} /></label>
    <p className="panel-description">当前项目会先保存。空白项目建立后可以新增页面。</p>
    <div className="modal-footer"><button className="ghost-button" disabled={busy || !name.trim()} onClick={() => props.onStartImageImport(name.trim())}>从成品图片创建</button><button className="primary-button" disabled={busy || !name.trim()} onClick={async () => {
      setBusy(true); setError("");
      try { await props.onCreateBlank(name.trim()); props.onClose(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "创建项目失败"); }
      finally { setBusy(false); }
    }}>创建空白项目</button></div>
    {error ? <p className="error-copy" role="alert">{error}</p> : null}
  </ModalDialog>;
}

import { useEffect, useRef, useState } from "react";
import { planImageImport, reorderImages, type ImportItem, type ImportPlan } from "../../lib/image-import";
import { readImportManifest, resumeImportFiles } from "../../lib/image-import-session";
import { ModalDialog } from "../ui/modal-dialog";
import "./bulk-image-import.css";

type State = { status: "uploading" | "success" | "failed"; error?: string };
export function BulkImageImportModal(props: {
  open: boolean;
  initialName: string;
  target: "new" | "blank" | "resume";
  projectId: string;
  maxBatchSize: number;
  onClose: () => void;
  onImport: (name: string, items: ImportItem[], target: "new" | "blank" | "resume", projectId: string, report: (id: string, state: State) => void, shouldStop: () => boolean) => Promise<void>;
}) {
  const [name, setName] = useState(props.initialName);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [states, setStates] = useState<Record<string, State>>({});
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const selection = useRef(0);
  const stopRequested = useRef(false);

  useEffect(() => {
    if (!props.open) return;
    setName(props.initialName); setPlan(null); setStates({}); setStarted(false); setError("");
  }, [props.open, props.initialName, props.projectId]);
  useEffect(() => {
    if (!props.open || !plan || typeof URL.createObjectURL !== "function") return;
    const urls = Object.fromEntries(plan.items.map(item => [item.uploadId, URL.createObjectURL(item.file)]));
    setPreviews(urls);
    return () => { Object.values(urls).forEach(url => URL.revokeObjectURL(url)); };
  }, [props.open, plan]);

  const choose = async (files: File[]) => {
    const current = ++selection.current;
    setPreparing(true); setError(""); setStarted(false); setStates({});
    try {
      const next = await planImageImport(files, props.maxBatchSize);
      if (props.target === "resume") {
        const manifest = readImportManifest(props.projectId);
        if (!manifest) throw new Error("续传清单不可用，请在对应页面单独上传未完成的图片。");
        const resumed = resumeImportFiles(next.items.map(item => item.file), manifest);
        next.items = resumed.items;
        next.errors.push(...resumed.errors);
      }
      if (selection.current === current) setPlan(next);
    }
    catch (cause) { if (selection.current === current) setError(cause instanceof Error ? cause.message : "无法读取图片"); }
    finally { if (selection.current === current) setPreparing(false); }
  };
  const upload = async () => {
    if (!plan?.items.length || plan.errors.length || !name.trim() || busy) return;
    stopRequested.current = false;
    setBusy(true); setStarted(true); setError("");
    try {
      await props.onImport(name.trim(), plan.items, props.target, props.projectId, (id, state) => setStates(current => ({ ...current, [id]: state })), () => stopRequested.current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导入失败，项目和已上传页面会保留"); }
    finally { setBusy(false); }
  };
  const complete = plan?.items.filter(item => states[item.uploadId]?.status === "success").length ?? 0;
  const failed = plan?.items.filter(item => states[item.uploadId]?.status === "failed").length ?? 0;
  const remaining = (plan?.items.length ?? 0) - complete;
  const mixedRatios = new Set(plan?.items.map(item => item.aspectRatio)).size > 1;
  return <ModalDialog open={props.open} label="批量导入成品图片" className="bulk-image-import-modal" onClose={() => { if (!busy && !preparing) props.onClose(); }}>
    <div className="panel-heading"><h3>批量导入成品图片</h3><button className="ghost-button" disabled={busy || preparing} data-modal-initial-focus onClick={props.onClose}>关闭导入</button></div>
    <label className="stacked"><span>项目名称</span><input aria-label="导入项目名称" value={name} disabled={busy || props.target !== "new"} onChange={event => setName(event.target.value)} /></label>
    <label className="stacked"><span>选择图片</span><input type="file" multiple aria-label="批量成品图片" accept="image/png,image/jpeg,image/webp" disabled={busy || preparing || started} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void choose(files); }} /></label>
    {props.target === "resume" ? <p className="panel-description">待续传：{readImportManifest(props.projectId)?.items.filter(item => item.status === "pending").map(item => item.fileName).join("、") || "无"}。请重新选择原文件。</p> : null}
    <p className="panel-description">一张图片对应一页。按文件名中的数字排序，可在导入前调整。</p>
    {preparing ? <p role="status">正在读取图片…</p> : null}
    {plan?.errors.map(message => <p key={message} className="error-copy" role="alert">{message}</p>)}
    {mixedRatios ? <p className="error-copy">图片比例不一致；整套导出 PPT 时需选择同比例的页面。</p> : null}
    {plan?.items.length ? <ol className="bulk-image-import-list">{plan.items.map((item, index) => <li key={item.uploadId}>
      {previews[item.uploadId] ? <img src={previews[item.uploadId]} alt="" /> : null}
      <span><strong>{item.file.name}</strong><small>{item.width}×{item.height} · {item.aspectRatio}</small>{states[item.uploadId]?.error ? <small className="error-copy">{states[item.uploadId].error}</small> : null}</span>
      <span className="bulk-image-import-actions"><button className="ghost-button" disabled={busy || started || index === 0} aria-label={`上移 ${item.file.name}`} onClick={() => setPlan(current => current && { ...current, items: reorderImages(current.items, index, index - 1) })}>上移</button><button className="ghost-button" disabled={busy || started || index === plan.items.length - 1} aria-label={`下移 ${item.file.name}`} onClick={() => setPlan(current => current && { ...current, items: reorderImages(current.items, index, index + 1) })}>下移</button></span>
      {states[item.uploadId]?.status === "success" ? <small>已导入</small> : states[item.uploadId]?.status === "uploading" ? <small>上传中</small> : states[item.uploadId]?.status === "failed" ? <small className="error-copy">失败</small> : null}
    </li>)}</ol> : null}
    {started ? <p role="status">已成功 {complete} 张{failed ? ` · 失败 ${failed} 张` : ""}{stopRequested.current && !busy ? " · 已停止后续上传" : ""}</p> : null}
    <div className="modal-footer">{busy ? <button className="ghost-button" disabled={stopRequested.current} onClick={() => { stopRequested.current = true; setError("当前图片上传完成后停止，已成功的图片会保留。"); }}>停止后续上传</button> : null}<button className="primary-button" disabled={busy || preparing || !plan?.items.length || Boolean(plan.errors.length) || !name.trim() || (started && !remaining)} onClick={() => void upload()}>{busy ? "正在导入…" : started && failed ? "重试失败项" : started ? "继续导入剩余图片" : props.target === "resume" ? "重试失败项" : props.target === "blank" ? `导入 ${plan?.items.length ?? 0} 张到当前项目` : `创建项目并导入 ${plan?.items.length ?? 0} 张`}</button></div>
    {error ? <p className="error-copy" role="alert">{error}</p> : null}
  </ModalDialog>;
}

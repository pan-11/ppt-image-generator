import { useState } from "react";
import type { ReferenceImageRecord } from "../../lib/types";
import { ModalDialog } from "../ui/modal-dialog";
import { ReferenceImageField } from "./reference-image-field";

export function SharedReferenceModal(props: {
  referenceId: string | null;
  unreferencedPageCount?: number;
  onUpload: (file: File) => Promise<ReferenceImageRecord>;
  onApply: (reference: ReferenceImageRecord | null, includeUnreferenced: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [referenceId, setReferenceId] = useState(props.referenceId);
  const [reference, setReference] = useState<ReferenceImageRecord | null>(null);
  const [includeUnreferenced, setIncludeUnreferenced] = useState(false);
  const [blocked, setBlocked] = useState(Boolean(props.referenceId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <ModalDialog open label="共用参考图" onClose={() => { if (!saving) props.onClose(); }}>
    <div className="panel-heading"><h3>共用参考图</h3><button type="button" className="ghost-button" disabled={saving} data-modal-initial-focus onClick={props.onClose}>取消</button></div>
    <p>应用到跟随共用图的页面，保留各页专用参考图与“不使用”设置。</p>
    <ReferenceImageField referenceId={referenceId} label="上传共用参考图" onUpload={props.onUpload} onResolved={setReference} onChange={(next) => { setReference(next); setReferenceId(next?.id ?? null); }} onBlockedChange={setBlocked} />
    <label className="reference-include-none"><input type="checkbox" checked={includeUnreferenced} disabled={saving} onChange={(event) => setIncludeUnreferenced(event.target.checked)} />同时应用到已选“不使用”的页面{props.unreferencedPageCount !== undefined ? `（${props.unreferencedPageCount} 页）` : ""}</label>
    {error ? <p className="error-copy" role="alert">{error}</p> : null}
    <div className="modal-footer"><button type="button" className="primary-button" disabled={blocked || saving || Boolean(referenceId && !reference)} onClick={async () => { setSaving(true); setError(""); try { await props.onApply(reference, includeUnreferenced); props.onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请重试"); } finally { setSaving(false); } }}>{saving ? "保存中..." : "应用共用参考图"}</button></div>
  </ModalDialog>;
}

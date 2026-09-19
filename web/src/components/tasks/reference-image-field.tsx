import { useEffect, useRef, useState } from "react";
import { fetchReferenceImage } from "../../lib/api";
import { validateImageUpload } from "../../lib/image-upload";
import type { ReferenceImageRecord } from "../../lib/types";
import { ModalDialog } from "../ui/modal-dialog";
import "./reference-images.css";

export function ReferenceImageField(props: {
  referenceId: string | null;
  contextKey?: string;
  label: string;
  onUpload?: (file: File) => Promise<ReferenceImageRecord>;
  onChange?: (reference: ReferenceImageRecord | null) => void;
  onResolved?: (reference: ReferenceImageRecord) => void;
  onBlockedChange?: (blocked: boolean) => void;
}) {
  const [reference, setReference] = useState<ReferenceImageRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(props.referenceId));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(false);
  const [reload, setReload] = useState(0);
  const request = useRef(0);
  const current = useRef(props);
  current.current = props;
  const cached = useRef<ReferenceImageRecord | null>(null);
  const blocked = loading || uploading || Boolean(error || uploadError);

  useEffect(() => {
    current.current.onBlockedChange?.(blocked);
  }, [blocked]);
  useEffect(() => () => { request.current++; current.current.onBlockedChange?.(false); }, []);
  useEffect(() => {
    let active = true;
    request.current++;
    setUploading(false); setPendingFile(null); setUploadError(""); setError("");
    if (!props.referenceId) { setReference(null); setLoading(false); return; }
    if (cached.current?.id === props.referenceId) {
      setReference(cached.current); setLoading(false); current.current.onResolved?.(cached.current); return;
    }
    setReference(null); setLoading(true);
    void fetchReferenceImage(props.referenceId).then((record) => {
      if (!active) return;
      cached.current = record; setReference(record); current.current.onResolved?.(record);
    }).catch(() => { if (active) setError("参考图不可用，请重新上传或选择不使用"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [props.referenceId, props.contextKey, reload]);

  const upload = async (file: File) => {
    const sequence = ++request.current;
    const originalId = props.referenceId;
    const originalContext = props.contextKey;
    setPendingFile(file); setUploadError("");
    const problem = validateImageUpload(file);
    if (problem) { setUploadError(problem); return; }
    setUploading(true);
    try {
      const record = await props.onUpload!(file);
      if (sequence !== request.current || originalId !== current.current.referenceId || originalContext !== current.current.contextKey) return;
      cached.current = record; setReference(record); setError(""); setPendingFile(null);
      current.current.onChange?.(record);
    } catch (cause) {
      if (sequence === request.current) setUploadError(cause instanceof Error ? cause.message : "参考图上传失败，请重试");
    } finally { if (sequence === request.current) setUploading(false); }
  };
  const url = reference?.url ?? `/api/reference-images/${encodeURIComponent(reference?.id ?? "")}/content`;

  return <div className="reference-image-field">
    {reference && reference.id === props.referenceId ? <div className="reference-image-preview">
      <button type="button" className="reference-thumbnail" aria-label={`预览参考图 ${reference.filename}`} onClick={() => setPreview(true)}><img src={url} alt={`参考图 ${reference.filename}`} /></button>
      <span className="reference-filename">{reference.filename}{reference.width && reference.height ? <small>{reference.width} × {reference.height}</small> : null}</span>
    </div> : <span className="reference-empty">{loading ? "读取参考图..." : props.referenceId ? "参考图不可用" : "未设置参考图"}</span>}
    {props.onUpload ? <label className="reference-upload"><span>{props.label}</span><input type="file" aria-label={props.label} accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /></label> : null}
    {props.referenceId && props.onChange ? <button type="button" className="ghost-button" onClick={() => { request.current++; setUploading(false); setUploadError(""); setPendingFile(null); props.onChange?.(null); }}>取消使用</button> : null}
    {uploading ? <span role="status">正在上传 {pendingFile?.name}...</span> : null}
    {error || uploadError ? <p className="error-copy" role="alert">{uploadError || error}</p> : null}
    {error ? <button type="button" className="ghost-button" onClick={() => { cached.current = null; setReload((value) => value + 1); }}>重新读取</button> : null}
    {pendingFile && !uploading ? <button type="button" className="ghost-button" onClick={() => void upload(pendingFile)}>重试上传</button> : null}
    {pendingFile ? <button type="button" className="ghost-button" onClick={() => { request.current++; setUploading(false); setUploadError(""); setPendingFile(null); }}>取消上传</button> : null}
    {preview && reference ? <ModalDialog open label="参考图预览" className="image-lightbox" onClose={() => setPreview(false)}><div className="panel-heading"><h3>{reference.filename}</h3><button type="button" className="ghost-button" data-modal-initial-focus onClick={() => setPreview(false)}>关闭</button></div><img className="lightbox-image" src={url} alt={reference.filename} /></ModalDialog> : null}
  </div>;
}

import { useMemo, useState } from "react";
import { parseBulkPromptImport, type BulkImportItem } from "../../lib/bulk-prompt-import";
import type { ReferenceImageRecord } from "../../lib/types";
import { ReferenceImageField } from "./reference-image-field";
import { ModalDialog } from "../ui/modal-dialog";

export type BulkImportPayload = { rawText: string; mode: "structured" | "lines"; items: BulkImportItem[]; globalReferenceImageId?: string | null };

export function BulkPasteModal(props: {
  open: boolean;
  maxBatchSize: number;
  onClose: () => void;
  initialReferenceId?: string | null;
  onUploadReference?: (file: File) => Promise<ReferenceImageRecord>;
  onImport: (items: BulkImportItem[], payload: BulkImportPayload) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [referenceId, setReferenceId] = useState<string | null>(props.initialReferenceId ?? null);
  const [referenceBlocked, setReferenceBlocked] = useState(Boolean(props.initialReferenceId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const result = useMemo(
    () => parseBulkPromptImport(value, props.maxBatchSize),
    [props.maxBatchSize, value]
  );
  const canImport = result.items.length > 0 && result.errors.length === 0;
  const notes = result.items.map((item) => item.note).filter(Boolean);

  return (
    <ModalDialog open={props.open} label="批量导入提示词" className="bulk-import-modal" onClose={() => { if (!saving) props.onClose(); }}>
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">批量导入提示词</p>
            <h3>粘贴整份提示词文本</h3>
          </div>
          <button className="ghost-button" disabled={saving} data-testid="bulk-close" data-modal-initial-focus onClick={props.onClose}>关闭</button>
        </div>

        <label className="stacked">
          <span>提示词内容</span>
          <textarea
            data-testid="bulk-paste-input"
            aria-label="提示词内容"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="可粘贴带【页面编号】等标记的完整内容，也可保持一行一个提示词"
          />
        </label>

        {props.onUploadReference ? <section className="page-reference-controls"><strong>本次导入共用参考图（可选）</strong><ReferenceImageField referenceId={referenceId} label="上传本次导入共用参考图" onUpload={props.onUploadReference} onChange={(reference) => setReferenceId(reference?.id ?? null)} onBlockedChange={setReferenceBlocked} /><span className="reference-empty">导入的所有页面跟随本次共用图；可在导入后为单页更换。</span></section> : null}
        <section className="bulk-import-preview" aria-label="导入预览">
          <strong>{result.mode === "structured" ? "结构化格式" : "逐行格式"} · {result.items.length} 条</strong>
          {notes.length > 0 ? (
            <ol>
              {notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
            </ol>
          ) : null}
          {result.errors.length > 0 ? (
            <ul className="bulk-import-errors">
              {result.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          ) : null}
        </section>

        <div className="modal-footer">
          <span>单批最多 {props.maxBatchSize} 条</span>
          <button
            className="primary-button"
            data-testid="bulk-import"
            disabled={!canImport || saving || referenceBlocked}
            onClick={async () => {
              setSaving(true); setError("");
              try { await props.onImport(result.items, { rawText: value, mode: result.mode, items: result.items, ...(props.onUploadReference ? { globalReferenceImageId: referenceId } : {}) }); }
              catch (cause) { setError(cause instanceof Error ? cause.message : "导入保存失败，请重试。"); }
              finally { setSaving(false); }
            }}
          >
            {`导入 ${result.items.length} 条`}
          </button>
        </div>
        {error ? <p className="error-copy" role="alert">{error}</p> : null}
    </ModalDialog>
  );
}

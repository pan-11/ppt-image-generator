import { useState } from "react";
import { downloadBlob, exportFilename, type CoursewareDocument } from "../../lib/courseware-api";
import { currentPromptsMarkdown, currentPromptsText } from "../../lib/prompt-export";
import { ModalDialog } from "../ui/modal-dialog";

export function PromptLibraryModal(props: { open: boolean; document: CoursewareDocument; onClose: () => void }) {
  const [mode, setMode] = useState<"current" | "original">("current");
  const [message, setMessage] = useState("");
  const rawMissing = mode === "original" && props.document.rawImportText === null;
  const text = mode === "original" ? props.document.rawImportText ?? "" : currentPromptsText(props.document.pages);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMessage("已复制"); }
    catch { setMessage("复制失败，请在下方文本框中全选后手动复制。"); }
  };
  const download = (markdown: boolean) => {
    const content = mode === "current" && markdown ? currentPromptsMarkdown(props.document.pages) : text;
    downloadBlob(new Blob([content], { type: markdown ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8" }), exportFilename(props.document.id, mode === "original" ? "original-prompts" : "current-prompts", markdown ? "md" : "txt"));
  };
  return <ModalDialog open={props.open} label="提示词库" onClose={props.onClose}>
    <div className="panel-heading"><h3>提示词库</h3><button className="ghost-button" data-modal-initial-focus onClick={props.onClose}>关闭</button></div>
    <label className="stacked">内容来源<select value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); setMessage(""); }}><option value="current">当前每页提示词</option><option value="original">导入原文</option></select></label>
    <p>{mode === "original" ? "完整保留最初导入的内容，后续编辑不会覆盖原文。" : "包含所有页面，按当前页序导出；不受参与 PPT 导出的勾选影响。"}</p>
    {rawMissing ? <p>这套课件没有保存过导入原文，可以复制或导出当前提示词。</p> : <textarea className="prompt-library-text" aria-label="提示词预览" readOnly value={text} onFocus={(event) => event.target.select()} />}
    <div className="toolbar"><button className="primary-button" disabled={rawMissing} onClick={() => void copy()}>复制全部</button><button className="ghost-button" disabled={rawMissing} onClick={() => download(false)}>导出 TXT</button><button className="ghost-button" disabled={rawMissing} onClick={() => download(true)}>导出 Markdown</button></div>
    <p role="status">{message}</p>
  </ModalDialog>;
}

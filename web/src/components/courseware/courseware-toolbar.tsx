import { useState } from "react";
import { downloadPptx, exportFilename, type CoursewareDetail, type CoursewareDocument } from "../../lib/courseware-api";
import type { ModelOption } from "../../lib/types";
import { PromptLibraryModal } from "./prompt-library-modal";
import { CoursewareListModal } from "./courseware-list-modal";
import { TextlessPanel } from "./textless-panel";

export function CoursewareToolbar(props: { document: CoursewareDocument | null; detail: CoursewareDetail | null; saving: boolean; error: string | null; models: ModelOption[]; onEdit: (doc: CoursewareDocument) => void; onOpen: (id: string) => Promise<unknown>; onEnsure: () => Promise<CoursewareDocument>; flush: () => Promise<CoursewareDocument | null> }) {
  const [modal, setModal] = useState<"prompts" | "list" | "textless" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const act = async (action: (doc: CoursewareDocument) => Promise<void> | void) => {
    setBusy(true); setError("");
    try { const doc = await props.onEnsure(); await action(doc); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  };
  return <section className="panel courseware-toolbar" aria-label="课件管理">
    <div className="panel-heading"><div><p className="panel-kicker">课件</p>{props.document ? <input aria-label="课件名称" value={props.document.name} onChange={(event) => props.onEdit({ ...props.document!, name: event.target.value })} /> : <h2>保存课件与导出</h2>}<p role="status">{props.error || error || (props.saving ? "正在保存…" : props.document ? "本地自动保存" : "导入提示词会自动保存为新课件")}</p></div>
      <div className="toolbar"><button className="ghost-button" disabled={busy} onClick={() => setModal("list")}>打开课件</button><button className="ghost-button" disabled={busy} onClick={() => void act(() => {})}>保存当前课件</button><button className="ghost-button" disabled={busy} onClick={() => props.document ? setModal("prompts") : void act(() => setModal("prompts"))}>提示词库</button><button className="primary-button" disabled={busy} onClick={() => void act(async (doc) => { await downloadPptx(`/api/coursewares/${encodeURIComponent(doc.id)}/export-pptx`, { expectedRevision: doc.revision, pageIds: doc.pages.filter((page) => page.included).map((page) => page.id) }, exportFilename(doc.id, "final", "pptx")); })}>导出定稿 PPT</button><button className="ghost-button" disabled={busy} onClick={() => void act(() => setModal("textless"))}>无文字版本</button></div>
    </div>
    <CoursewareListModal open={modal === "list"} onClose={() => setModal(null)} onOpen={props.onOpen} />
    {props.document ? <><PromptLibraryModal open={modal === "prompts"} document={props.document} onClose={() => setModal(null)} /><TextlessPanel open={modal === "textless"} document={props.document} sourceDetail={props.detail} models={props.models} flush={props.flush} onClose={() => setModal(null)} /></> : null}
  </section>;
}

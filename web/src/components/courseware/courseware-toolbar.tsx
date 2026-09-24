import { useState } from "react";
import { downloadPptx, exportFilename, type CoursewareDetail, type CoursewareDocument } from "../../lib/courseware-api";
import type { ModelOption } from "../../lib/types";
import { PromptLibraryModal } from "./prompt-library-modal";
import { CoursewareListModal } from "./courseware-list-modal";
import { TextlessPanel } from "./textless-panel";
import { NewProjectModal } from "./new-project-modal";
import { BulkImageImportModal } from "./bulk-image-import-modal";
import type { ImportItem } from "../../lib/image-import";
import { readImportManifest } from "../../lib/image-import-session";

export function CoursewareToolbar(props: { document: CoursewareDocument | null; detail: CoursewareDetail | null; saving: boolean; dirty: boolean; error: string | null; models: ModelOption[]; maxBatchSize: number; onEdit: (doc: CoursewareDocument) => void; onOpen: (id: string) => Promise<unknown>; onCreateBlank: (name: string) => Promise<void>; onImportImages: (name: string, items: ImportItem[], target: "new" | "blank" | "resume", projectId: string, report: (id: string, state: { status: "uploading" | "success" | "failed"; error?: string }) => void, shouldStop: () => boolean) => Promise<void>; onEnsure: () => Promise<CoursewareDocument>; flush: () => Promise<CoursewareDocument | null> }) {
  const [modal, setModal] = useState<"prompts" | "list" | "textless" | "new" | "images" | null>(null);
  const [imageImport, setImageImport] = useState<{ name: string; target: "new" | "blank" | "resume"; projectId: string }>({ name: "", target: "new", projectId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const act = async (action: (doc: CoursewareDocument) => Promise<void> | void) => {
    setBusy(true); setError("");
    try { const doc = await props.onEnsure(); await action(doc); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  };
  const startImages = (name: string, target: "new" | "blank" | "resume") => {
    setImageImport({ name, target, projectId: target === "new" ? crypto.randomUUID() : props.document!.id });
    setModal("images");
  };
  const pendingImport = props.document && readImportManifest(props.document.id)?.items.some(item => item.status === "pending");
  return <section className="panel courseware-toolbar workbench-courseware" aria-label="课件管理">
    <div className="panel-heading"><div className="workbench-courseware-title">{props.document ? <input type="text" aria-label="课件名称" value={props.document.name} onChange={(event) => props.onEdit({ ...props.document!, name: event.target.value })} /> : <h2>当前编辑内容</h2>}<p className={`workbench-courseware-status${props.error || error ? " error-copy" : ""}`} role={props.error || error ? "alert" : "status"}>{props.error || error || (props.saving ? "正在保存…" : props.document ? props.dirty ? "待保存" : "已保存到本机" : "新建项目或保存当前内容")}</p>{props.document ? <p className="workbench-courseware-counts">共 {props.document.pages.length} 页 · 参与导出 {props.document.pages.filter((page) => page.included).length} 页 · 已选定稿 {props.document.pages.filter((page) => page.selectedImageId).length} 页</p> : null}</div>
      <div className="toolbar"><button className="ghost-button" disabled={busy} onClick={() => setModal("list")}>历史项目</button><button className="ghost-button" disabled={busy} onClick={() => setModal("new")}>新建项目</button><button className="ghost-button" disabled={busy} onClick={() => void act(() => {})}>保存项目</button>{props.document?.pages.length === 0 ? <button className="ghost-button" disabled={busy} onClick={() => startImages(props.document!.name, "blank")}>批量上传成品图</button> : null}{pendingImport ? <button className="ghost-button" disabled={busy} onClick={() => startImages(props.document!.name, "resume")}>继续导入图片</button> : null}<button className="ghost-button" disabled={busy} onClick={() => props.document ? setModal("prompts") : void act(() => setModal("prompts"))}>提示词库</button><button className="ghost-button" disabled={busy} onClick={() => void act(async (doc) => { await downloadPptx(`/api/coursewares/${encodeURIComponent(doc.id)}/export-pptx`, { expectedRevision: doc.revision, pageIds: doc.pages.filter((page) => page.included).map((page) => page.id) }, exportFilename(doc.id, "final", "pptx")); })}>导出定稿 PPT</button><button className="ghost-button" disabled={busy} onClick={() => void act(() => setModal("textless"))}>无文字版本</button></div>
    </div>
    <CoursewareListModal open={modal === "list"} currentId={props.document?.id} onClose={() => setModal(null)} onOpen={props.onOpen} />
    <NewProjectModal open={modal === "new"} onClose={() => setModal(null)} onCreateBlank={props.onCreateBlank} onStartImageImport={(name) => startImages(name, "new")} />
    <BulkImageImportModal open={modal === "images"} initialName={imageImport.name} target={imageImport.target} projectId={imageImport.projectId} maxBatchSize={props.maxBatchSize} onImport={props.onImportImages} onClose={() => setModal(null)} />
    {props.document ? <><PromptLibraryModal open={modal === "prompts"} document={props.document} onClose={() => setModal(null)} /><TextlessPanel open={modal === "textless"} document={props.document} sourceDetail={props.detail} models={props.models} flush={props.flush} onClose={() => setModal(null)} /></> : null}
  </section>;
}

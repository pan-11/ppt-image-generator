import { useEffect, useRef, useState } from "react";
import { createTextlessRun, downloadPptx, exportFilename, fetchTextlessRun, listTextlessRuns, type CoursewareDetail, type CoursewareDocument, type TextlessDetail, type TextlessRun } from "../../lib/courseware-api";
import { retryTasks } from "../../lib/api";
import { formatTaskStatus } from "../../lib/status-labels";
import type { ModelOption } from "../../lib/types";
import { ModalDialog } from "../ui/modal-dialog";

export function TextlessPanel(props: { open: boolean; document: CoursewareDocument; sourceDetail?: CoursewareDetail | null; models: ModelOption[]; flush: () => Promise<CoursewareDocument | null>; onClose: () => void }) {
  const [runs, setRuns] = useState<TextlessRun[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<TextlessDetail | null>(null);
  const [model, setModel] = useState(props.models[0]?.value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  const epoch = useRef(0);
  useEffect(() => {
    if (!props.models.some((item) => item.value === model)) setModel(props.models[0]?.value ?? "");
  }, [props.models, model]);
  useEffect(() => {
    epoch.current += 1;
    if (!props.open) return;
    let cancelled = false;
    setRuns([]); setSelectedId(""); setDetail(null); setError(""); setBusy(false); request.current = null;
    void listTextlessRuns(props.document.id).then(({ runs: loaded }) => {
      if (cancelled) return;
      setRuns(loaded); setSelectedId(loaded[0]?.id ?? "");
    }).catch((cause) => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; epoch.current += 1; };
  }, [props.open, props.document.id]);
  useEffect(() => {
    if (!props.open || !selectedId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const result = await fetchTextlessRun(selectedId); if (!cancelled) setDetail(result); }
      catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "读取去字结果失败"); }
      if (!cancelled) timer = setTimeout(poll, 2000);
    };
    setDetail(null); void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [props.open, selectedId]);
  const process = async (pageId?: string) => {
    const operation = epoch.current;
    setBusy(true); setError("");
    try {
      const saved = await props.flush();
      if (operation !== epoch.current) return;
      if (!saved) throw new Error("请先保存课件");
      const pageIds = pageId ? [pageId] : saved.pages.filter((page) => page.included).map((page) => page.id);
      const key = JSON.stringify([saved.id, saved.revision, model, pageIds, Boolean(pageId)]);
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
      const result = await createTextlessRun(saved, model, request.current.id, pageIds, Boolean(pageId));
      if (operation !== epoch.current) return;
      request.current = null;
      setRuns((current) => [result.run, ...current.filter((run) => run.id !== result.run.id)]);
      setSelectedId(result.run.id); setDetail(result);
    } catch (cause) { if (operation === epoch.current) setError(cause instanceof Error ? cause.message : "去字提交失败"); }
    finally { if (operation === epoch.current) setBusy(false); }
  };
  const exportRun = async (variant: "final" | "textless") => {
    if (!detail) return;
    setBusy(true); setError("");
    try { await downloadPptx(`/api/textless-runs/${encodeURIComponent(detail.run.id)}/export-pptx`, { variant }, exportFilename(props.document.id, variant, "pptx")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "导出失败"); }
    finally { setBusy(false); }
  };
  const retryPage = async (taskId: string) => {
    if (!detail) return;
    const operation = epoch.current;
    const runId = detail.run.id;
    setBusy(true); setError("");
    try {
      await retryTasks([taskId]);
      const updated = await fetchTextlessRun(runId);
      if (operation === epoch.current) setDetail(updated);
    } catch (cause) { if (operation === epoch.current) setError(cause instanceof Error ? cause.message : "重试失败"); }
    finally { if (operation === epoch.current) setBusy(false); }
  };
  const includedPages = props.document.pages.filter((page) => page.included);
  const selectedCount = includedPages.filter((page) => page.selectedImageId).length;
  return <ModalDialog open={props.open} label="无文字版本" className="textless-modal" onClose={() => { if (!busy) props.onClose(); }}>
    <div className="panel-heading dialog-heading"><h3>无文字版本</h3><button className="ghost-button" disabled={busy} data-modal-initial-focus onClick={props.onClose}>关闭</button></div>
    <p>使用每页定稿图逐张去字，保留原图。生成会调用当前图生图渠道；请完成后对照检查残字和画面细节。</p>
    <div className="textless-summary"><span>参与 {includedPages.length} 页</span><span>已选定稿 {selectedCount} 页</span><span>待选定稿 {includedPages.length - selectedCount} 页</span></div>
    <p className="muted-copy">缺少定稿的页面需先选图；输出规格以定稿图片为准。</p>
    <div className="toolbar textless-controls"><label>去字模型<select value={model} onChange={(event) => setModel(event.target.value)}>{props.models.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><button className="primary-button" disabled={busy || !model} onClick={() => void process()}>生成无文字版</button></div>
    <details className="textless-manifest">
      <summary>查看 {includedPages.length} 页明细</summary>
    <ul>{includedPages.map((page) => {
      const image = props.sourceDetail?.images.find((item) => item.id === page.selectedImageId);
      const task = props.sourceDetail?.tasks.find((item) => item.id === image?.task_id);
      return <li key={page.id}>第 {page.position + 1} 页 · {task ? `${task.aspect_ratio ?? task.size} · ${task.resolution ?? "默认分辨率"}` : "等待定稿图片规格"}{page.selectedImageId ? " · 已选定稿" : " · 尚未选择定稿"}</li>;
    })}</ul>
    </details>
    <label className="stacked">处理记录<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">选择处理记录</option>{runs.map((run, index) => <option key={run.id} value={run.id}>{index === 0 ? "最近一次" : `记录 ${index + 1}`} · {run.manifest.length} 页 · {run.model}</option>)}</select></label>
    {detail ? <>
      <p>下面的两份 PPT 使用这次处理时保存的相同页序和定稿版本。</p>
      <div className="toolbar"><button className="ghost-button" disabled={busy} onClick={() => void exportRun("final")}>导出本次定稿 PPT</button><button className="primary-button" disabled={busy} onClick={() => void exportRun("textless")}>导出无文字 PPT</button></div>
      {detail.pages.map((page) => {
        const currentPage = props.document.pages.find((item) => item.id === page.pageId);
        const changed = currentPage?.selectedImageId !== page.sourceImageId;
        return <article className="textless-page" key={page.pageId}>
          <strong>{page.pageLabel} · {formatTaskStatus(page.status)}</strong>
          {changed ? <p className="error-copy">此记录属于之前的定稿，当前选择已改变。</p> : null}
          <div className="textless-comparison"><figure><img src={`/api/download/images/${page.sourceImageId}`} alt={`${page.pageLabel}去字源图`} /><figcaption>本次定稿</figcaption></figure><figure>{page.imageId ? <img src={`/api/download/images/${page.imageId}`} alt={`${page.pageLabel}无文字图`} /> : <p>{page.errorMessage || "等待无文字图片"}</p>}<figcaption>无文字版本</figcaption></figure></div>
          <div className="toolbar">{["failed", "unknown"].includes(page.status) ? <button className="ghost-button" disabled={busy} onClick={() => void retryPage(page.taskId)}>重试这一页</button> : null}<button className="ghost-button" disabled={busy || changed || !currentPage} onClick={() => void process(page.pageId)}>重新去字这一页</button></div>
        </article>;
      })}
    </> : null}
    {error ? <p className="error-copy" role="alert">{error}</p> : null}
  </ModalDialog>;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { createBatch, createChildTasks, retryTasks, uploadReferenceImage } from "./lib/api";
import { loadEditorSession, saveEditorSession } from "./lib/editor-session";
import { mergeEditorResults, type EditorResultsCache } from "./lib/editor-results-cache";
import { createEditorSnapshotFromHistory } from "./lib/history-snapshot";
import { roleForDraft, validateDraftForRole } from "./lib/model-options";
import { loadPreferences, savePreferences } from "./lib/preferences";
import { createTaskDrafts, DEFAULT_EDITOR_ROWS } from "./lib/task-draft";
import type { DefaultsState, HistoryItem, ReferenceImageRecord, TaskDraft } from "./lib/types";
import { AppShell } from "./components/layout/app-shell";
import { HistoryList } from "./components/history/history-list";
import { MonitorDrawer } from "./components/monitor/monitor-drawer";
import { DefaultsBar } from "./components/tasks/defaults-bar";
import { SubmitBar } from "./components/tasks/submit-bar";
import { TaskTable } from "./components/tasks/task-table";
import { StaticPreviewPage } from "./components/preview/static-preview-page";
import { useActiveBatch } from "./hooks/use-active-batch";
import { useHistory } from "./hooks/use-history";
import { fallbackSettings, useSettings } from "./hooks/use-settings";
import { useCourseware } from "./hooks/use-courseware";
import { adoptHistory, fetchCourseware, pagesFromRows, type CoursewareDocument } from "./lib/courseware-api";
import { CoursewareToolbar } from "./components/courseware/courseware-toolbar";
import { PageSelectionPanel } from "./components/courseware/page-selection-panel";
import type { BulkImportPayload } from "./components/tasks/bulk-paste-modal";

export default function App() {
  if (window.location.pathname === "/preview") {
    return <StaticPreviewPage />;
  }

  const { settings, loading: settingsLoading, error: settingsError } = useSettings();
  const fallbackModel = fallbackSettings.roles.text.models[0];
  const [globalReferenceImage, setGlobalReferenceImage] = useState<ReferenceImageRecord | null>(null);
  const [defaults, setDefaults] = useState<DefaultsState>({
    model: fallbackModel.value,
    aspectRatio: fallbackModel.aspectRatios.includes("16:9") ? "16:9" : fallbackModel.aspectRatios[0],
    resolution: fallbackModel.resolutions[0],
    n: 1,
    globalReferenceImageId: null
  });
  const [exportDirectory, setExportDirectory] = useState("");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [rows, setRows] = useState<TaskDraft[]>([]);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [editorResults, setEditorResults] = useState<EditorResultsCache>({ tasks: [], images: [] });
  const [submitting, setSubmitting] = useState(false);
  const [generatingRowId, setGeneratingRowId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadingGlobalReference, setUploadingGlobalReference] = useState(false);
  const [editorSessionReady, setEditorSessionReady] = useState(false);
  const courseware = useCourseware();
  const pendingImport = useRef<{ key: string; document: CoursewareDocument } | null>(null);
  const currentCoursewareId = useRef<string | null>(null);
  currentCoursewareId.current = courseware.document?.id ?? null;
  const currentLoadVersion = useRef(courseware.loadVersion);
  currentLoadVersion.current = courseware.loadVersion;
  const history = useHistory();
  const activeBatch = useActiveBatch(activeBatchId);
  const failedTaskIds = activeBatch.activeBatch?.tasks
    .filter((task) => task.status === "failed")
    .map((task) => task.id) ?? [];

  const effectiveRows = useMemo(
    () => rows.length > 0 ? rows : createTaskDrafts(defaults, DEFAULT_EDITOR_ROWS),
    [defaults, rows]
  );
  const currentRows = useRef(effectiveRows);
  currentRows.current = effectiveRows;
  const allModels = useMemo(() => Array.from(new Map(
    [...settings.roles.text.models, ...settings.roles.image.models].map((model) => [model.value, model])
  ).values()), [settings.roles.image.models, settings.roles.text.models]);
  const readyTaskCount = effectiveRows.filter((row) => row.prompt.trim()).length;
  const invalidRows = effectiveRows
    .filter((row) => row.prompt.trim())
    .map((row) => ({
      row,
      error: validateDraftForRole(
        row,
        settings.roles[roleForDraft(row, defaults.globalReferenceImageId)]
      )
    }))
    .filter((item) => item.error);

  useEffect(() => {
    if (settingsLoading || preferencesReady || settings.roles.text.models.length === 0) {
      return;
    }

    const loaded = loadPreferences(settings.roles.text.models);
    setDefaults((current) => ({
      ...loaded.defaults,
      globalReferenceImageId: current.globalReferenceImageId
    }));
    setExportDirectory(loaded.exportDirectory);
    setPreferencesReady(true);
  }, [preferencesReady, settings.roles.text.models, settingsLoading]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    savePreferences({
      defaults,
      exportDirectory
    });
  }, [defaults, exportDirectory, preferencesReady]);

  useEffect(() => {
    if (!preferencesReady || !courseware.ready || editorSessionReady) {
      return;
    }

    const storedSession = loadEditorSession();
    if (storedSession && !courseware.document) {
      setRows(storedSession.rows);
      setEditorResults(storedSession.editorResults);
      setActiveBatchId(storedSession.activeBatchId);
    }
    setEditorSessionReady(true);
  }, [editorSessionReady, preferencesReady, courseware.ready, courseware.document]);

  useEffect(() => {
    if (!editorSessionReady) {
      return;
    }

    if (rows.length === 0 && editorResults.tasks.length === 0 && editorResults.images.length === 0) {
      return;
    }

    try {
      saveEditorSession({ rows, editorResults, activeBatchId });
    } catch {
      setSubmitError("浏览器存储空间不足，编辑内容暂未保存，请保持页面打开。");
    }
  }, [activeBatchId, editorResults, editorSessionReady, rows]);

  useEffect(() => {
    if (
      !editorSessionReady ||
      !courseware.ready || courseware.document ||
      history.loading ||
      rows.length > 0 ||
      editorResults.tasks.length > 0 ||
      history.history.length === 0
    ) {
      return;
    }

    const snapshot = createEditorSnapshotFromHistory(history.history[0], defaults, allModels, DEFAULT_EDITOR_ROWS);
    setRows(snapshot.rows);
    setEditorResults(snapshot.editorResults);
    setActiveBatchId(history.history[0].batch.id);
  }, [allModels, defaults, editorResults.tasks.length, editorSessionReady, history.history, history.loading, rows.length, courseware.ready, courseware.document]);

  useEffect(() => {
    const currentBatch = activeBatch.activeBatch;
    if (!currentBatch) {
      return;
    }

    setEditorResults((current) => mergeEditorResults(current, currentBatch));
  }, [activeBatch.activeBatch]);

  useEffect(() => {
    const doc = courseware.document;
    if (!doc || !preferencesReady) return;
    setRows([...doc.pages].sort((a, b) => a.position - b.position).map((page) => ({ id: page.id, ...page.draft })));
    setDefaults((current) => ({ ...current, globalReferenceImageId: doc.globalReferenceImageId }));
    setGlobalReferenceImage(doc.globalReferenceImageId ? { id: doc.globalReferenceImageId, filename: "已保存的全局参考图", localPath: "" } : null);
    setEditorResults({ tasks: [], images: [] });
    setActiveBatchId(null);
  }, [courseware.loadVersion, preferencesReady]);

  useEffect(() => {
    const detail = courseware.detail;
    if (!detail || detail.courseware.id !== courseware.document?.id) return;
    setEditorResults((current) => mergeEditorResults(current, detail));
    setRows((current) => current.map((row) => {
      if (row.submittedTaskId) return row;
      const link = detail.links.find((item) => item.pageId === row.id && item.purpose === "original");
      return link ? { ...row, submittedTaskId: link.taskId } : row;
    }));
    const doc = courseware.document;
    let changed = false;
    const pages = doc.pages.map((page) => {
      if (page.selectedImageId) return page;
      const valid = detail.images.find((image) => image.validation_status === "valid" && detail.links.some((link) => link.pageId === page.id && link.taskId === image.task_id && link.purpose === "original"));
      if (!valid) return page;
      changed = true;
      return { ...page, selectedImageId: valid.id };
    });
    if (changed) courseware.edit({ ...doc, pages });
  }, [courseware.detail, courseware.document, courseware.edit]);

  const changeRows = (nextRows: TaskDraft[]) => {
    setRows(nextRows);
    if (courseware.document) courseware.edit({ ...courseware.document, pages: pagesFromRows(nextRows, courseware.document.pages) });
  };
  const ensureCourseware = async (): Promise<CoursewareDocument> => {
    if (!courseware.ready) throw new Error("正在恢复课件，请稍后再试。");
    if (courseware.document) {
      const saved = await courseware.flush();
      if (saved) return saved;
    }
    if (activeBatchId && effectiveRows.some((row) => row.submittedTaskId)) {
      const sourceVersion = currentLoadVersion.current;
      const adopted = await adoptHistory(activeBatchId);
      const detail = await fetchCourseware(adopted.id);
      if (currentLoadVersion.current !== sourceVersion) throw new Error("当前课件已切换，请重新操作。");
      const pages = adopted.pages.map((page) => {
        const row = currentRows.current.find((item) => detail.links.some((link) => link.taskId === item.submittedTaskId && link.pageId === page.id && link.purpose === "original"));
        return row ? { ...page, draft: pagesFromRows([row])[0].draft } : page;
      });
      for (const row of currentRows.current.filter((item) => !item.submittedTaskId && (item.prompt.trim() || item.note.trim()))) {
        if (!pages.some((page) => page.id === row.id)) pages.push({ ...pagesFromRows([row])[0], position: pages.length });
      }
      courseware.install(adopted);
      courseware.edit({ ...adopted, pages });
      return (await courseware.flush())!;
    }
    return courseware.create({ id: crypto.randomUUID(), name: `课件 ${new Date().toLocaleString()}`, sourceKind: "manual", rawImportText: null, importMode: null, legacyBatchId: null, globalReferenceImageId: defaults.globalReferenceImageId, revision: 0, pages: pagesFromRows(effectiveRows) });
  };
  const importCourseware = async (payload: BulkImportPayload, importedRows: TaskDraft[]) => {
    if (!courseware.ready) throw new Error("正在恢复上次课件，请稍后导入。");
    const pages = pagesFromRows(importedRows).map((page, index) => ({ ...page, sourcePageNumber: payload.items[index].pageNumber ?? "", sourcePageName: payload.items[index].pageName ?? "" }));
    const key = JSON.stringify([payload.rawText, payload.mode, pages.map((page) => page.draft), defaults.globalReferenceImageId]);
    if (pendingImport.current?.key !== key) pendingImport.current = { key, document: { id: crypto.randomUUID(), name: payload.rawText.split(/\r?\n/).find((line) => line.trim())?.slice(0, 80) || "导入课件", sourceKind: "import", rawImportText: payload.rawText, importMode: payload.mode, legacyBatchId: null, globalReferenceImageId: defaults.globalReferenceImageId, revision: 0, pages } };
    await courseware.create(pendingImport.current.document);
    pendingImport.current = null;
  };

  const submitRows = async (rowIndexes?: number[]) => {
    if (settingsError) {
      setSubmitError(settingsError);
      return;
    }
    const selectedIndexes = rowIndexes ?? effectiveRows.map((_, index) => index);
    const validRows = selectedIndexes
      .map((index) => ({ index, row: effectiveRows[index] }))
      .filter((item): item is { index: number; row: TaskDraft } => Boolean(item.row?.prompt.trim()))
      .map(({ index, row }) => ({ index, row }));

    if (validRows.length === 0) {
      return;
    }

    const invalid = validRows.find(({ row }) => validateDraftForRole(
      row,
      settings.roles[roleForDraft(row, defaults.globalReferenceImageId)]
    ));
    if (invalid) {
      const role = settings.roles[roleForDraft(invalid.row, defaults.globalReferenceImageId)];
      setSubmitError(validateDraftForRole(invalid.row, role));
      return;
    }

    setSubmitError(null);
    if (rowIndexes) {
      setGeneratingRowId(effectiveRows[rowIndexes[0]]?.id ?? null);
    } else {
      setSubmitting(true);
    }

    try {
      const saved = await ensureCourseware();
      const linkedDetail = validRows.some(({ row }) => !saved.pages.some((page) => page.id === row.id)) ? await fetchCourseware(saved.id) : null;
      const submittedRows = validRows.map(({ row }) => {
        const id = saved.pages.find((page) => page.id === row.id)?.id ?? linkedDetail?.links.find((link) => link.taskId === row.submittedTaskId)?.pageId;
        if (!id) throw new Error("当前任务来自另一份历史记录，请打开对应课件后再生成。");
        return { ...row, id };
      });
      const response = await createBatch({
        name: `Batch ${new Date().toLocaleString()}`,
        tasks: submittedRows,
        globalReferenceImageId: defaults.globalReferenceImageId,
        coursewareId: saved?.id
      });

      if (currentCoursewareId.current !== saved.id) return;
      setRows((current) =>
        current.map((row) => {
          const submittedIndex = submittedRows.findIndex((item) => item.id === row.id);
          if (submittedIndex === -1) {
            return row;
          }

          const submittedTask = response.tasks[submittedIndex];
          return {
            ...row,
            submittedTaskId: submittedTask?.id ?? null
          };
        })
      );

      setActiveBatchId(response.batch.id);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "提交失败，请检查后端服务。");
    } finally {
      if (rowIndexes) {
        setGeneratingRowId(null);
      } else {
        setSubmitting(false);
      }
    }
  };

  const submitBatch = async () => {
    await submitRows();
  };

  const uploadGlobalReference = async (file: File) => {
    const sourceCoursewareId = currentCoursewareId.current;
    setUploadingGlobalReference(true);
    try {
      const reference = await uploadReferenceImage(file);
      if (currentCoursewareId.current !== sourceCoursewareId) return;
      setGlobalReferenceImage(reference);
      setDefaults((current) => ({
        ...current,
        globalReferenceImageId: reference.id
      }));
      const latest = courseware.getCurrent();
      if (latest) courseware.edit({ ...latest, globalReferenceImageId: reference.id });
    } finally {
      setUploadingGlobalReference(false);
    }
  };

  const retryFailedTasksFromHistory = async (taskIds: string[], batchId: string) => {
    if (!batchId || taskIds.length === 0) {
      return;
    }

    await retryTasks(taskIds);
    setActiveBatchId(batchId);
    await activeBatch.refresh(batchId);
  };

  const createChildTasksFromImage = async (parentImageId: string, tasks: TaskDraft[]) => {
    const sourceCoursewareId = currentCoursewareId.current;
    if (settingsError) {
      throw new Error(settingsError);
    }
    const response = await createChildTasks(
      parentImageId,
      tasks
    );
    if (currentCoursewareId.current !== sourceCoursewareId) return response.tasks;
    setEditorResults((current) => mergeEditorResults(current, {
      tasks: response.tasks,
      images: []
    }));
    const childBatchId = response.tasks[0]?.batch_id;
    if (childBatchId) {
      setActiveBatchId(childBatchId);
      await activeBatch.refresh(childBatchId);
    }
    return response.tasks;
  };

  const restoreHistorySnapshot = (item: HistoryItem) => {
    const confirmed = window.confirm("这会替换当前上方任务行，但不会删除历史记录。继续载入吗？");
    if (!confirmed) {
      return;
    }

    if (courseware.document) {
      const sourceVersion = currentLoadVersion.current;
      void (async () => {
        try {
          await courseware.flush();
          const adopted = await adoptHistory(item.batch.id);
          if (currentLoadVersion.current !== sourceVersion) return;
          await courseware.open(adopted.id);
        } catch (cause) { setSubmitError(cause instanceof Error ? cause.message : "历史课件载入失败"); }
      })();
      return;
    }

    const snapshot = createEditorSnapshotFromHistory(item, defaults, allModels, DEFAULT_EDITOR_ROWS);
    setRows(snapshot.rows);
    setEditorResults(snapshot.editorResults);
    setActiveBatchId(item.batch.id);
    setSubmitError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AppShell>
      <section className="column-stack">
        <MonitorDrawer
          open={monitorOpen}
          onOpenChange={setMonitorOpen}
          activeBatch={activeBatch.activeBatch}
          onPause={() => void activeBatch.pause()}
          onResume={() => void activeBatch.resume()}
          onRetryFailed={() => void retryFailedTasksFromHistory(failedTaskIds, activeBatch.activeBatch?.batch.id ?? "")}
        />
        <div className="dialog-sync-bar">
          <div>
            <strong>历史记录</strong>
            <p>结果图默认保留在上方任务行；需要同步下面历史区域时再手动更新。</p>
          </div>
          <button className="ghost-button" disabled={history.loading} onClick={() => void history.refresh()}>
            {history.loading ? "更新中..." : "刷新历史记录"}
          </button>
        </div>

        <DefaultsBar
          defaults={defaults}
          roles={settings.roles}
          uploading={uploadingGlobalReference}
          globalReferenceImage={globalReferenceImage}
          onDefaultsChange={(next) => {
            setDefaults(next);
            if (courseware.document && next.globalReferenceImageId !== courseware.document.globalReferenceImageId) courseware.edit({ ...courseware.document, globalReferenceImageId: next.globalReferenceImageId });
          }}
          onUploadGlobalReference={uploadGlobalReference}
        />

        <CoursewareToolbar document={courseware.document} detail={courseware.detail} saving={courseware.saving} error={courseware.error} models={settings.roles.image.models} onEdit={courseware.edit} onOpen={courseware.open} onEnsure={ensureCourseware} flush={courseware.flush} />

        <SubmitBar
          variant="top"
          readyCount={readyTaskCount}
          maxBatchSize={settings.maxBatchSize}
          textConcurrency={settings.roles.text.maxConcurrency}
          imageConcurrency={settings.roles.image.maxConcurrency}
          submitting={submitting}
          settingsLoading={settingsLoading || Boolean(settingsError)}
          hasInvalidTasks={invalidRows.length > 0}
          errorMessage={submitError ?? invalidRows[0]?.error}
          onSubmit={() => void submitBatch()}
        />

        <TaskTable
          rows={effectiveRows}
          defaults={defaults}
          settings={settings}
          previewImages={editorResults.images}
          batchTasks={editorResults.tasks}
          generatingRowId={generatingRowId}
          generationDisabled={Boolean(settingsError) || !courseware.ready}
          onRowsChange={changeRows}
          onImport={importCourseware}
          renderPageControls={(row, index) => {
            const doc = courseware.document;
            const page = doc?.pages.find((item) => item.id === row.id);
            if (!doc || !page) return null;
            return <PageSelectionPanel page={page} detail={courseware.detail} first={index === 0} last={index === effectiveRows.length - 1} onChange={(next) => courseware.edit({ ...doc, pages: doc.pages.map((item) => item.id === next.id ? next : item) })} onMove={(offset) => { const next = [...effectiveRows]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; changeRows(next); }} />;
          }}
          onGenerateRow={(index) => void submitRows([index])}
          onUploadReferenceImage={uploadReferenceImage}
          onCreateChildTasks={createChildTasksFromImage}
        />

        <SubmitBar
          readyCount={readyTaskCount}
          maxBatchSize={settings.maxBatchSize}
          textConcurrency={settings.roles.text.maxConcurrency}
          imageConcurrency={settings.roles.image.maxConcurrency}
          submitting={submitting}
          settingsLoading={settingsLoading || Boolean(settingsError)}
          hasInvalidTasks={invalidRows.length > 0}
          errorMessage={submitError ?? invalidRows[0]?.error}
          onSubmit={() => void submitBatch()}
        />

        {settingsError ? <p className="error-copy">{settingsError}</p> : null}
      </section>

      <HistoryList
        items={history.history}
        loading={history.loading}
        error={history.error}
        exportDirectory={exportDirectory}
        exportMessage={history.lastExportMessage}
        onExportDirectoryChange={setExportDirectory}
        onDeleteBatch={history.deleteBatch}
        onDeleteImage={history.deleteImage}
        onExportBatch={history.exportBatch}
        onRetryTasks={retryFailedTasksFromHistory}
        onRestoreBatch={restoreHistorySnapshot}
      />
    </AppShell>
  );
}

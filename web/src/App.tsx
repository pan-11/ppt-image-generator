import { useEffect, useMemo, useState } from "react";
import { createBatch, createChildTasks, retryTasks, uploadReferenceImage } from "./lib/api";
import { loadEditorSession, saveEditorSession } from "./lib/editor-session";
import { mergeEditorResults, type EditorResultsCache } from "./lib/editor-results-cache";
import { createEditorSnapshotFromHistory } from "./lib/history-snapshot";
import { formatTaskDimensions, getModelOption, normalizeModelSelection } from "./lib/model-options";
import { loadPreferences, savePreferences } from "./lib/preferences";
import { createTaskDrafts } from "./lib/task-draft";
import type { DefaultsState, HistoryItem, ReferenceImageRecord, TaskDraft } from "./lib/types";
import { AppShell } from "./components/layout/app-shell";
import { HistoryList } from "./components/history/history-list";
import { RunSummary } from "./components/monitor/run-summary";
import { DefaultsBar } from "./components/tasks/defaults-bar";
import { SubmitBar } from "./components/tasks/submit-bar";
import { TaskTable } from "./components/tasks/task-table";
import { StaticPreviewPage } from "./components/preview/static-preview-page";
import { useActiveBatch } from "./hooks/use-active-batch";
import { useHistory } from "./hooks/use-history";
import { fallbackSettings, useSettings } from "./hooks/use-settings";

export default function App() {
  if (window.location.pathname === "/preview") {
    return <StaticPreviewPage />;
  }

  const { settings, loading: settingsLoading, error: settingsError } = useSettings();
  const [globalReferenceImage, setGlobalReferenceImage] = useState<ReferenceImageRecord | null>(null);
  const [defaults, setDefaults] = useState<DefaultsState>({
    model: fallbackSettings.models[0].value,
    aspectRatio: fallbackSettings.models[0].aspectRatios.includes("16:9") ? "16:9" : fallbackSettings.models[0].aspectRatios[0],
    resolution: fallbackSettings.models[0].resolutions[0],
    n: 1,
    globalReferenceImageId: null
  });
  const [exportDirectory, setExportDirectory] = useState("");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [rows, setRows] = useState<TaskDraft[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [editorResults, setEditorResults] = useState<EditorResultsCache>({ tasks: [], images: [] });
  const [submitting, setSubmitting] = useState(false);
  const [generatingRowId, setGeneratingRowId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadingGlobalReference, setUploadingGlobalReference] = useState(false);
  const [editorSessionReady, setEditorSessionReady] = useState(false);
  const history = useHistory();
  const activeBatch = useActiveBatch(activeBatchId);
  const failedTaskIds = activeBatch.activeBatch?.tasks
    .filter((task) => task.status === "failed")
    .map((task) => task.id) ?? [];

  const effectiveRows = useMemo(
    () => rows.length > 0 ? rows : createTaskDrafts(defaults, 30),
    [defaults, rows]
  );
  const readyTaskCount = effectiveRows.filter((row) => row.prompt.trim()).length;

  useEffect(() => {
    if (settingsLoading || preferencesReady || settings.models.length === 0) {
      return;
    }

    const loaded = loadPreferences(settings.models);
    setDefaults((current) => ({
      ...loaded.defaults,
      globalReferenceImageId: current.globalReferenceImageId
    }));
    setExportDirectory(loaded.exportDirectory);
    setPreferencesReady(true);
  }, [preferencesReady, settings.models, settingsLoading]);

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
    if (!preferencesReady || editorSessionReady) {
      return;
    }

    const storedSession = loadEditorSession();
    if (storedSession) {
      setRows(storedSession.rows);
      setEditorResults(storedSession.editorResults);
      setActiveBatchId(storedSession.activeBatchId);
    }
    setEditorSessionReady(true);
  }, [editorSessionReady, preferencesReady]);

  useEffect(() => {
    if (!editorSessionReady) {
      return;
    }

    if (rows.length === 0 && editorResults.tasks.length === 0 && editorResults.images.length === 0) {
      return;
    }

    saveEditorSession({
      rows,
      editorResults,
      activeBatchId
    });
  }, [activeBatchId, editorResults, editorSessionReady, rows]);

  useEffect(() => {
    if (
      !editorSessionReady ||
      history.loading ||
      rows.length > 0 ||
      editorResults.tasks.length > 0 ||
      history.history.length === 0
    ) {
      return;
    }

    const snapshot = createEditorSnapshotFromHistory(history.history[0], defaults, settings.models, 30);
    setRows(snapshot.rows);
    setEditorResults(snapshot.editorResults);
    setActiveBatchId(history.history[0].batch.id);
  }, [defaults, editorResults.tasks.length, editorSessionReady, history.history, history.loading, rows.length, settings.models]);

  useEffect(() => {
    const currentBatch = activeBatch.activeBatch;
    if (!currentBatch) {
      return;
    }

    setEditorResults((current) => mergeEditorResults(current, currentBatch));
  }, [activeBatch.activeBatch]);

  const submitRows = async (rowIndexes?: number[]) => {
    const selectedIndexes = rowIndexes ?? effectiveRows.map((_, index) => index);
    const validRows = selectedIndexes
      .map((index) => ({ index, row: effectiveRows[index] }))
      .filter((item): item is { index: number; row: TaskDraft } => Boolean(item.row?.prompt.trim()))
      .map(({ index, row }) => ({
        index,
        row: normalizeModelSelection(getModelOption(settings.models, row.model), row)
      }));

    if (validRows.length === 0) {
      return;
    }

    setSubmitError(null);
    if (rowIndexes) {
      setGeneratingRowId(effectiveRows[rowIndexes[0]]?.id ?? null);
    } else {
      setSubmitting(true);
    }

    try {
      const response = await createBatch({
        name: `Batch ${new Date().toLocaleString()}`,
        tasks: validRows.map((item) => item.row),
        globalReferenceImageId: defaults.globalReferenceImageId
      });

      setRows(
        effectiveRows.map((row, index) => {
          const submittedIndex = validRows.findIndex((item) => item.index === index);
          if (submittedIndex === -1) {
            return row;
          }

          const submittedTask = response.tasks[submittedIndex];
          const submittedRow = validRows[submittedIndex]?.row ?? row;

          return {
            ...submittedRow,
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
    setUploadingGlobalReference(true);
    try {
      const reference = await uploadReferenceImage(file);
      setGlobalReferenceImage(reference);
      setDefaults((current) => ({
        ...current,
        globalReferenceImageId: reference.id
      }));
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
    const response = await createChildTasks(
      parentImageId,
      tasks.map((task) => normalizeModelSelection(getModelOption(settings.models, task.model), task))
    );
    if (activeBatchId) {
      await activeBatch.refresh(activeBatchId);
    }
    return response.tasks;
  };

  const restoreHistorySnapshot = (item: HistoryItem) => {
    const confirmed = window.confirm("这会替换当前上方任务行，但不会删除历史记录。继续载入吗？");
    if (!confirmed) {
      return;
    }

    const snapshot = createEditorSnapshotFromHistory(item, defaults, settings.models, 30);
    setRows(snapshot.rows);
    setEditorResults(snapshot.editorResults);
    setActiveBatchId(item.batch.id);
    setSubmitError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AppShell>
      <section className="column-stack">
        <div className="dialog-sync-bar">
          <div>
            <strong>对话框更新</strong>
            <p>结果图默认保留在上方任务行；需要同步下面历史区域时再手动更新。</p>
          </div>
          <button className="ghost-button" disabled={history.loading} onClick={() => void history.refresh()}>
            {history.loading ? "更新中..." : "更新对话框"}
          </button>
        </div>

        <DefaultsBar
          defaults={defaults}
          models={settings.models}
          uploading={uploadingGlobalReference}
          maxConcurrency={settings.maxConcurrency}
          globalReferenceImage={globalReferenceImage}
          onDefaultsChange={setDefaults}
          onUploadGlobalReference={uploadGlobalReference}
        />

        <SubmitBar
          variant="top"
          readyCount={readyTaskCount}
          maxBatchSize={settings.maxBatchSize}
          maxConcurrency={settings.maxConcurrency}
          submitting={submitting}
          settingsLoading={settingsLoading}
          errorMessage={submitError}
          onSubmit={() => void submitBatch()}
        />

        <TaskTable
          rows={effectiveRows}
          defaults={defaults}
          settings={settings}
          previewImages={editorResults.images}
          batchTasks={editorResults.tasks}
          generatingRowId={generatingRowId}
          onRowsChange={setRows}
          onGenerateRow={(index) => void submitRows([index])}
          onUploadReferenceImage={uploadReferenceImage}
          onCreateChildTasks={createChildTasksFromImage}
        />

        <SubmitBar
          readyCount={readyTaskCount}
          maxBatchSize={settings.maxBatchSize}
          maxConcurrency={settings.maxConcurrency}
          submitting={submitting}
          settingsLoading={settingsLoading}
          errorMessage={submitError}
          onSubmit={() => void submitBatch()}
        />

        {settingsError ? <p className="error-copy">{settingsError}</p> : null}
      </section>

      <section className="column-stack">
        <RunSummary
          queued={activeBatch.activeBatch?.scheduler.queued ?? 0}
          running={activeBatch.activeBatch?.scheduler.running ?? 0}
          completed={activeBatch.activeBatch?.scheduler.completed ?? 0}
          failed={activeBatch.activeBatch?.scheduler.failed ?? 0}
          paused={activeBatch.activeBatch?.scheduler.paused ?? false}
          onPause={() => void activeBatch.pause()}
          onResume={() => void activeBatch.resume()}
        />

        <section className="panel live-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">当前批次</p>
              <h2>{activeBatch.activeBatch?.batch.name ?? "还没有运行中的批次"}</h2>
            </div>
            {activeBatch.activeBatch ? (
              <button
                className="ghost-button"
                onClick={() => void retryFailedTasksFromHistory(failedTaskIds, activeBatch.activeBatch?.batch.id ?? "")}
              >
                重试失败项
              </button>
            ) : null}
          </div>

          <div className="live-task-list">
            {(activeBatch.activeBatch?.tasks ?? []).map((task) => (
              <article key={task.id} className="live-task-card">
                <div>
                  <strong>{task.prompt}</strong>
                  <p>{task.model} · {formatTaskDimensions(task)}</p>
                </div>
                <span className={`status-chip status-${task.status}`}>{task.status}</span>
              </article>
            ))}
          </div>
        </section>
      </section>

      <HistoryList
        items={history.history}
        loading={history.loading}
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

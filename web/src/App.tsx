import { useEffect, useMemo, useState } from "react";
import { createBatch, retryTasks, uploadReferenceImage } from "./lib/api";
import { formatTaskDimensions } from "./lib/model-options";
import { loadPreferences, savePreferences } from "./lib/preferences";
import { createTaskDraft } from "./lib/task-draft";
import type { DefaultsState, ReferenceImageRecord, TaskDraft } from "./lib/types";
import { AppShell } from "./components/layout/app-shell";
import { HistoryList } from "./components/history/history-list";
import { RunSummary } from "./components/monitor/run-summary";
import { DefaultsBar } from "./components/tasks/defaults-bar";
import { TaskTable } from "./components/tasks/task-table";
import { useActiveBatch } from "./hooks/use-active-batch";
import { useHistory } from "./hooks/use-history";
import { fallbackSettings, useSettings } from "./hooks/use-settings";

export default function App() {
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
  const [submitting, setSubmitting] = useState(false);
  const [uploadingGlobalReference, setUploadingGlobalReference] = useState(false);
  const history = useHistory();
  const activeBatch = useActiveBatch(activeBatchId);
  const failedTaskIds = activeBatch.activeBatch?.tasks
    .filter((task) => task.status === "failed")
    .map((task) => task.id) ?? [];

  const effectiveRows = useMemo(
    () => rows.length > 0 ? rows : [createTaskDraft(defaults)],
    [defaults, rows]
  );

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

  const submitBatch = async () => {
    const validRows = effectiveRows.filter((row) => row.prompt.trim());

    if (validRows.length === 0) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await createBatch({
        name: `Batch ${new Date().toLocaleString()}`,
        tasks: validRows,
        globalReferenceImageId: defaults.globalReferenceImageId
      });

      let taskIndex = 0;
      setRows(
        effectiveRows.map((row) => {
          if (!row.prompt.trim()) {
            return row;
          }

          const submittedTask = response.tasks[taskIndex];
          taskIndex += 1;

          return {
            ...row,
            submittedTaskId: submittedTask?.id ?? null
          };
        })
      );

      setActiveBatchId(response.batch.id);
      await history.refresh();
    } finally {
      setSubmitting(false);
    }
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
    await Promise.all([
      history.refresh(),
      activeBatch.refresh(batchId)
    ]);
  };

  return (
    <AppShell>
      <section className="column-stack">
        <DefaultsBar
          defaults={defaults}
          models={settings.models}
          uploading={uploadingGlobalReference}
          globalReferenceImage={globalReferenceImage}
          onDefaultsChange={setDefaults}
          onUploadGlobalReference={uploadGlobalReference}
        />

        <TaskTable
          rows={effectiveRows}
          defaults={defaults}
          settings={settings}
          previewImages={activeBatch.activeBatch?.images ?? []}
          onRowsChange={setRows}
          onUploadReferenceImage={uploadReferenceImage}
        />

        <div className="submit-bar">
          <div>
            <strong>准备提交 {effectiveRows.filter((row) => row.prompt.trim()).length} 条任务</strong>
            <p>单批最多 {settings.maxBatchSize} 条，固定并发 {settings.maxConcurrency} 条。</p>
          </div>
          <button className="primary-button large-button" disabled={submitting || settingsLoading} onClick={() => void submitBatch()}>
            {submitting ? "提交中..." : "开始生成"}
          </button>
        </div>

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
      />
    </AppShell>
  );
}

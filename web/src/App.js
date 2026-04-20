import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { createBatch, retryTasks, uploadReferenceImage } from "./lib/api";
import { createTaskDraft } from "./lib/task-draft";
import { AppShell } from "./components/layout/app-shell";
import { HistoryList } from "./components/history/history-list";
import { RunSummary } from "./components/monitor/run-summary";
import { DefaultsBar } from "./components/tasks/defaults-bar";
import { TaskTable } from "./components/tasks/task-table";
import { useActiveBatch } from "./hooks/use-active-batch";
import { useHistory } from "./hooks/use-history";
import { useSettings } from "./hooks/use-settings";
export default function App() {
    const { settings, loading: settingsLoading, error: settingsError } = useSettings();
    const [globalReferenceImage, setGlobalReferenceImage] = useState(null);
    const [defaults, setDefaults] = useState({
        model: "gpt-image-1",
        size: "1024x1024",
        n: 1,
        globalReferenceImageId: null
    });
    const [rows, setRows] = useState([]);
    const [activeBatchId, setActiveBatchId] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingGlobalReference, setUploadingGlobalReference] = useState(false);
    const history = useHistory();
    const activeBatch = useActiveBatch(activeBatchId);
    const failedTaskIds = activeBatch.activeBatch?.tasks
        .filter((task) => task.status === "failed")
        .map((task) => task.id) ?? [];
    const effectiveRows = useMemo(() => rows.length > 0 ? rows : [createTaskDraft(defaults)], [defaults, rows]);
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
            setActiveBatchId(response.batch.id);
            await history.refresh();
        }
        finally {
            setSubmitting(false);
        }
    };
    const uploadGlobalReference = async (file) => {
        setUploadingGlobalReference(true);
        try {
            const reference = await uploadReferenceImage(file);
            setGlobalReferenceImage(reference);
            setDefaults((current) => ({
                ...current,
                globalReferenceImageId: reference.id
            }));
        }
        finally {
            setUploadingGlobalReference(false);
        }
    };
    return (_jsxs(AppShell, { children: [_jsxs("section", { className: "column-stack", children: [_jsx(DefaultsBar, { defaults: defaults, models: settings.models, uploading: uploadingGlobalReference, globalReferenceImage: globalReferenceImage, onDefaultsChange: setDefaults, onUploadGlobalReference: uploadGlobalReference }), _jsx(TaskTable, { rows: effectiveRows, defaults: defaults, settings: settings, onRowsChange: setRows, onUploadReferenceImage: uploadReferenceImage }), _jsxs("div", { className: "submit-bar", children: [_jsxs("div", { children: [_jsxs("strong", { children: ["\u51C6\u5907\u63D0\u4EA4 ", effectiveRows.filter((row) => row.prompt.trim()).length, " \u6761\u4EFB\u52A1"] }), _jsxs("p", { children: ["\u5355\u6279\u6700\u591A ", settings.maxBatchSize, " \u6761\uFF0C\u56FA\u5B9A\u5E76\u53D1 ", settings.maxConcurrency, " \u6761\u3002"] })] }), _jsx("button", { className: "primary-button large-button", disabled: submitting || settingsLoading, onClick: () => void submitBatch(), children: submitting ? "提交中..." : "开始生成" })] }), settingsError ? _jsx("p", { className: "error-copy", children: settingsError }) : null] }), _jsxs("section", { className: "column-stack", children: [_jsx(RunSummary, { queued: activeBatch.activeBatch?.scheduler.queued ?? 0, running: activeBatch.activeBatch?.scheduler.running ?? 0, completed: activeBatch.activeBatch?.scheduler.completed ?? 0, failed: activeBatch.activeBatch?.scheduler.failed ?? 0, paused: activeBatch.activeBatch?.scheduler.paused ?? false, onPause: () => void activeBatch.pause(), onResume: () => void activeBatch.resume() }), _jsxs("section", { className: "panel live-panel", children: [_jsxs("div", { className: "panel-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "panel-kicker", children: "\u5F53\u524D\u6279\u6B21" }), _jsx("h2", { children: activeBatch.activeBatch?.batch.name ?? "还没有运行中的批次" })] }), activeBatch.activeBatch ? (_jsx("button", { className: "ghost-button", onClick: () => void retryTasks(failedTaskIds), children: "\u91CD\u8BD5\u5931\u8D25\u9879" })) : null] }), _jsx("div", { className: "live-task-list", children: (activeBatch.activeBatch?.tasks ?? []).map((task) => (_jsxs("article", { className: "live-task-card", children: [_jsxs("div", { children: [_jsx("strong", { children: task.prompt }), _jsxs("p", { children: [task.model, " \u00B7 ", task.size, " \u00B7 ", task.n, " \u5F20"] })] }), _jsx("span", { className: `status-chip status-${task.status}`, children: task.status })] }, task.id))) })] })] }), _jsx(HistoryList, { items: history.history, loading: history.loading, onDeleteBatch: history.deleteBatch, onDeleteImage: history.deleteImage })] }));
}

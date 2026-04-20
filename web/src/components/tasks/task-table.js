import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { createTaskDraft } from "../../lib/task-draft";
import { BulkPasteModal } from "./bulk-paste-modal";
import { TaskRow } from "./task-row";
export function TaskTable(props) {
    const [bulkOpen, setBulkOpen] = useState(false);
    const rows = useMemo(() => props.rows.length > 0 ? props.rows : [createTaskDraft(props.defaults)], [props.defaults, props.rows]);
    const setRow = (index, next) => {
        const updated = [...rows];
        updated[index] = next;
        props.onRowsChange(updated);
    };
    const removeRow = (index) => {
        const updated = rows.filter((_, itemIndex) => itemIndex !== index);
        props.onRowsChange(updated);
    };
    return (_jsxs("section", { className: "panel task-panel", children: [_jsxs("div", { className: "panel-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "panel-kicker", children: "\u4EFB\u52A1\u7F16\u8F91\u5668" }), _jsx("h2", { children: "\u6700\u591A\u4E00\u6B21\u63D0\u4EA4 50 \u6761" })] }), _jsxs("div", { className: "toolbar", children: [_jsx("button", { className: "ghost-button", onClick: () => setBulkOpen(true), children: "\u6279\u91CF\u7C98\u8D34" }), _jsx("button", { className: "primary-button", onClick: () => props.onRowsChange([...rows, createTaskDraft(props.defaults)]), children: "\u65B0\u589E\u4E00\u884C" })] })] }), _jsx("div", { className: "task-table", children: rows.map((row, index) => (_jsx(TaskRow, { row: row, models: props.settings.models, onChange: (next) => setRow(index, next), onDuplicate: () => props.onRowsChange([...rows, { ...row, id: `${row.id}-copy-${index}` }]), onDelete: () => removeRow(index), onUploadReference: props.onUploadReferenceImage }, row.id))) }), _jsx(BulkPasteModal, { open: bulkOpen, maxBatchSize: props.settings.maxBatchSize, onClose: () => setBulkOpen(false), onImport: (prompts) => {
                    props.onRowsChange(prompts.map((prompt) => createTaskDraft(props.defaults, { prompt })));
                    setBulkOpen(false);
                } })] }));
}

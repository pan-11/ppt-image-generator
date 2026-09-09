import { Fragment, useMemo, useState, type ReactNode } from "react";
import { createTaskDraft, createTaskDrafts, DEFAULT_EDITOR_ROWS } from "../../lib/task-draft";
import type { DefaultsState, ImageRecord, ReferenceImageRecord, Settings, TaskDraft, TaskRecord } from "../../lib/types";
import { BulkPasteModal, type BulkImportPayload } from "./bulk-paste-modal";
import type { PageSelectionProps } from "../courseware/page-selection-panel";
import { TaskRow } from "./task-row";

export function TaskTable(props: {
  rows: TaskDraft[];
  defaults: DefaultsState;
  settings: Pick<Settings, "roles" | "maxBatchSize">;
  previewImages?: ImageRecord[];
  batchTasks?: TaskRecord[];
  generatingRowId?: string | null;
  generationDisabled?: boolean;
  onRowsChange: (rows: TaskDraft[]) => void;
  onImport?: (payload: BulkImportPayload, rows: TaskDraft[]) => Promise<void>;
  toolbar?: ReactNode;
  pageScopeId?: string;
  getPageSelection?: (row: TaskDraft, index: number) => PageSelectionProps | undefined;
  renderPageControls?: (row: TaskDraft, index: number) => ReactNode;
  onGenerateRow: (index: number) => void;
  onUploadReferenceImage: (file: File) => Promise<ReferenceImageRecord>;
  onCreateChildTasks: (parentImageId: string, tasks: TaskDraft[]) => Promise<TaskRecord[]>;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);

  const rows = useMemo(
    () => props.rows.length > 0 ? props.rows : createTaskDrafts(props.defaults, DEFAULT_EDITOR_ROWS),
    [props.defaults, props.rows]
  );

  const setRow = (index: number, next: TaskDraft) => {
    const updated = [...rows];
    updated[index] = next;
    props.onRowsChange(updated);
  };

  const removeRow = (index: number) => {
    if (!window.confirm("移除当前页？历史记录和已生成图片会保留。")) return;
    const updated = rows.filter((_, itemIndex) => itemIndex !== index);
    props.onRowsChange(updated);
  };

  return (
    <section className="panel task-panel" id="task-editor">
      <div className="panel-heading workbench-task-heading" id="page-tasks">
        <div>

          <h2>页面任务</h2>
          <p className="panel-description">当前 {rows.length} 行 · 单批最多 {props.settings.maxBatchSize} 条</p>
        </div>
        <div className="toolbar">
          <button className="ghost-button" data-testid="bulk-open" onClick={() => setBulkOpen(true)}>
            批量导入提示词
          </button>
          <button className="ghost-button" onClick={() => props.onRowsChange([...rows, createTaskDraft(props.defaults)])}>
            新增页面
          </button>
          {props.toolbar}
        </div>
      </div>

      <div className="task-table">
        {rows.map((row, index) => (
          <Fragment key={`${props.pageScopeId ?? "legacy"}:${row.id}`}><TaskRow
            rowNumber={index + 1}
            row={row}
            pageSelection={props.getPageSelection?.(row, index)}
            roles={props.settings.roles}
            globalReferenceImageId={props.defaults.globalReferenceImageId}
            previewImages={(props.previewImages ?? []).filter((image) => image.task_id === row.submittedTaskId)}
            allImages={props.previewImages ?? []}
            batchTasks={props.batchTasks ?? []}
            onChange={(next) => setRow(index, next)}
            onDuplicate={() => props.onRowsChange([...rows, { ...row, id: crypto.randomUUID(), submittedTaskId: null }])}
            onDelete={() => removeRow(index)}
            generating={props.generatingRowId === row.id}
            generationDisabled={props.generationDisabled}
            onGenerate={() => props.onGenerateRow(index)}
            onUploadReference={props.onUploadReferenceImage}
            onCreateChildTasks={props.onCreateChildTasks}
          />{!props.getPageSelection && props.renderPageControls?.(row, index)}</Fragment>
        ))}
      </div>

      <BulkPasteModal
        open={bulkOpen}
        maxBatchSize={props.settings.maxBatchSize}
        onClose={() => setBulkOpen(false)}
        onImport={async (items, payload) => {
          if (
            rows.some((row) => row.prompt.trim()) &&
            !window.confirm("导入将替换当前任务列表，是否继续？")
          ) {
            return;
          }

          const importedRows = items.map((item) => createTaskDraft(props.defaults, item));
          if (props.onImport) await props.onImport(payload, importedRows);
          else props.onRowsChange(importedRows);
          setBulkOpen(false);
        }}
      />
    </section>
  );
}

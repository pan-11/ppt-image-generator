import { useMemo, useState } from "react";
import { createTaskDraft, createTaskDrafts, DEFAULT_EDITOR_ROWS } from "../../lib/task-draft";
import type { DefaultsState, ImageRecord, ReferenceImageRecord, Settings, TaskDraft, TaskRecord } from "../../lib/types";
import { BulkPasteModal } from "./bulk-paste-modal";
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
    const updated = rows.filter((_, itemIndex) => itemIndex !== index);
    props.onRowsChange(updated);
  };

  return (
    <section className="panel task-panel" id="task-editor">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">任务编辑器</p>
          <h2>任务列表</h2>
          <p className="panel-description">当前 {rows.length} 行 · 单批最多 {props.settings.maxBatchSize} 条</p>
        </div>
        <div className="toolbar">
          <button className="ghost-button" data-testid="bulk-open" onClick={() => setBulkOpen(true)}>
            批量导入提示词
          </button>
          <button className="primary-button" onClick={() => props.onRowsChange([...rows, createTaskDraft(props.defaults)])}>
            新增任务
          </button>
        </div>
      </div>

      <div className="task-table">
        {rows.map((row, index) => (
          <TaskRow
            key={row.id}
            rowNumber={index + 1}
            row={row}
            roles={props.settings.roles}
            globalReferenceImageId={props.defaults.globalReferenceImageId}
            previewImages={(props.previewImages ?? []).filter((image) => image.task_id === row.submittedTaskId)}
            allImages={props.previewImages ?? []}
            batchTasks={props.batchTasks ?? []}
            onChange={(next) => setRow(index, next)}
            onDuplicate={() => props.onRowsChange([...rows, { ...row, id: `${row.id}-copy-${index}` }])}
            onDelete={() => removeRow(index)}
            generating={props.generatingRowId === row.id}
            generationDisabled={props.generationDisabled}
            onGenerate={() => props.onGenerateRow(index)}
            onUploadReference={props.onUploadReferenceImage}
            onCreateChildTasks={props.onCreateChildTasks}
          />
        ))}
      </div>

      <BulkPasteModal
        open={bulkOpen}
        maxBatchSize={props.settings.maxBatchSize}
        onClose={() => setBulkOpen(false)}
        onImport={(items) => {
          if (
            rows.some((row) => row.prompt.trim()) &&
            !window.confirm("导入将替换当前任务列表，是否继续？")
          ) {
            return;
          }

          props.onRowsChange(
            items.map((item) => createTaskDraft(props.defaults, item))
          );
          setBulkOpen(false);
        }}
      />
    </section>
  );
}

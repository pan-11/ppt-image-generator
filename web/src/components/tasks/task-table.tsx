import { useMemo, useState } from "react";
import { createTaskDraft } from "../../lib/task-draft";
import type { DefaultsState, ReferenceImageRecord, Settings, TaskDraft } from "../../lib/types";
import { BulkPasteModal } from "./bulk-paste-modal";
import { TaskRow } from "./task-row";

export function TaskTable(props: {
  rows: TaskDraft[];
  defaults: DefaultsState;
  settings: Pick<Settings, "models" | "maxBatchSize">;
  onRowsChange: (rows: TaskDraft[]) => void;
  onUploadReferenceImage: (file: File) => Promise<ReferenceImageRecord>;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);

  const rows = useMemo(
    () => props.rows.length > 0 ? props.rows : [createTaskDraft(props.defaults)],
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
    <section className="panel task-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">任务编辑器</p>
          <h2>最多一次提交 {props.settings.maxBatchSize} 条</h2>
        </div>
        <div className="toolbar">
          <button className="ghost-button" onClick={() => setBulkOpen(true)}>批量粘贴</button>
          <button className="primary-button" onClick={() => props.onRowsChange([...rows, createTaskDraft(props.defaults)])}>
            新增一行
          </button>
        </div>
      </div>

      <div className="task-table">
        {rows.map((row, index) => (
          <TaskRow
            key={row.id}
            row={row}
            models={props.settings.models}
            onChange={(next) => setRow(index, next)}
            onDuplicate={() => props.onRowsChange([...rows, { ...row, id: `${row.id}-copy-${index}` }])}
            onDelete={() => removeRow(index)}
            onUploadReference={props.onUploadReferenceImage}
          />
        ))}
      </div>

      <BulkPasteModal
        open={bulkOpen}
        maxBatchSize={props.settings.maxBatchSize}
        onClose={() => setBulkOpen(false)}
        onImport={(prompts) => {
          props.onRowsChange(prompts.map((prompt) => createTaskDraft(props.defaults, { prompt })));
          setBulkOpen(false);
        }}
      />
    </section>
  );
}

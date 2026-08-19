import { getModelOption, normalizeModelSelection } from "./model-options";
import { createTaskDraft, createTaskDrafts } from "./task-draft";
import type { DefaultsState, HistoryItem, ModelOption, TaskDraft, TaskRecord } from "./types";
import type { EditorResultsCache } from "./editor-results-cache";

function coerceReferenceMode(value: string | undefined): TaskDraft["referenceMode"] {
  return value === "global" || value === "row" ? value : "none";
}

function taskToDraft(task: TaskRecord, defaults: DefaultsState, models: ModelOption[]): TaskDraft {
  const model = getModelOption(models, task.model);
  const draft = createTaskDraft(defaults, {
    prompt: task.prompt,
    note: task.note ?? "",
    model: task.model,
    aspectRatio: task.aspect_ratio ?? task.size ?? defaults.aspectRatio,
    resolution: task.resolution ?? defaults.resolution,
    n: task.n,
    referenceMode: coerceReferenceMode(task.reference_mode),
    referenceImageId: task.reference_image_id ?? null,
    submittedTaskId: task.id
  });

  return normalizeModelSelection(model, draft);
}

export function createEditorSnapshotFromHistory(
  item: HistoryItem,
  defaults: DefaultsState,
  models: ModelOption[],
  minimumRows = 30
): { rows: TaskDraft[]; editorResults: EditorResultsCache } {
  const rootTasks = item.tasks.filter((task) => !task.parent_image_id);
  const restoredRows = rootTasks.map((task) => taskToDraft(task, defaults, models));
  const paddedRows = restoredRows.length < minimumRows
    ? [...restoredRows, ...createTaskDrafts(defaults, minimumRows - restoredRows.length)]
    : restoredRows;

  return {
    rows: paddedRows,
    editorResults: {
      tasks: item.tasks,
      images: item.images
    }
  };
}

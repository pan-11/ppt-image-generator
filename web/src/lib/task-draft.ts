import type { DefaultsState, TaskDraft } from "./types";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `task-${Math.random().toString(36).slice(2, 10)}`;
}

export function createTaskDraft(defaults: DefaultsState, overrides?: Partial<TaskDraft>): TaskDraft {
  return {
    id: createId(),
    prompt: "",
    note: "",
    model: defaults.model,
    aspectRatio: defaults.aspectRatio,
    resolution: defaults.resolution,
    n: defaults.n,
    referenceMode: defaults.globalReferenceImageId ? "global" : "none",
    referenceImageId: defaults.globalReferenceImageId,
    submittedTaskId: null,
    ...overrides
  };
}

export function createTaskDrafts(defaults: DefaultsState, count: number, overrides?: Array<Partial<TaskDraft>>) {
  return Array.from({ length: count }, (_, index) => createTaskDraft(defaults, overrides?.[index]));
}

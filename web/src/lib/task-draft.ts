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
    model: defaults.model,
    size: defaults.size,
    n: defaults.n,
    referenceMode: defaults.globalReferenceImageId ? "global" : "none",
    referenceImageId: defaults.globalReferenceImageId,
    ...overrides
  };
}

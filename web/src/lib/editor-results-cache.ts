import type { ActiveBatchResponse, ImageRecord, TaskRecord } from "./types";

export type EditorResultsCache = {
  tasks: TaskRecord[];
  images: ImageRecord[];
};

export function mergeEditorResults(
  current: EditorResultsCache,
  next: Pick<ActiveBatchResponse, "tasks" | "images">
): EditorResultsCache {
  const tasksById = new Map(current.tasks.map((task) => [task.id, task]));
  next.tasks.forEach((task) => tasksById.set(task.id, task));

  const imagesById = new Map(current.images.map((image) => [image.id, image]));
  next.images.forEach((image) => imagesById.set(image.id, image));

  return {
    tasks: Array.from(tasksById.values()),
    images: Array.from(imagesById.values())
  };
}

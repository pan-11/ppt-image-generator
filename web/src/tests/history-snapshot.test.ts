import { describe, expect, it } from "vitest";
import { createEditorSnapshotFromHistory } from "../lib/history-snapshot";
import type { DefaultsState, HistoryItem, ModelOption } from "../lib/types";

const defaults: DefaultsState = {
  model: "gpt-image-2",
  aspectRatio: "16:9",
  resolution: "1K",
  n: 1,
  globalReferenceImageId: null
};

const models: ModelOption[] = [
  {
    value: "gpt-image-2",
    label: "gpt-image-2",
    aspectRatios: ["1:1", "16:9"],
    resolutions: ["1K", "2K"],
    maxN: 4,
    supportsReferenceImages: true
  }
];

const historyItem: HistoryItem = {
  batch: {
    id: "batch-history",
    name: "Batch History",
    status: "completed",
    total_tasks: 2,
    success_count: 2,
    failed_count: 0,
    created_at: "2026-06-03T08:00:00.000Z"
  },
  tasks: [
    {
      id: "task-root",
      batch_id: "batch-history",
      prompt: "PPT cover image",
      note: "P1 · Restored page",
      model: "gpt-image-2",
      aspect_ratio: "16:9",
      resolution: "1K",
      size: "16:9",
      n: 1,
      status: "completed"
    },
    {
      id: "task-child",
      batch_id: "batch-history",
      prompt: "No text version",
      model: "gpt-image-2",
      aspect_ratio: "16:9",
      resolution: "1K",
      size: "16:9",
      n: 1,
      parent_image_id: "image-root",
      status: "completed"
    }
  ],
  jobs: [],
  images: [
    {
      id: "image-root",
      task_id: "task-root",
      filename: "root.png",
      local_path: "batch/root.png"
    },
    {
      id: "image-child",
      task_id: "task-child",
      filename: "child.png",
      local_path: "batch/child.png"
    }
  ]
};

describe("createEditorSnapshotFromHistory", () => {
  it("loads only root history tasks into editor rows and keeps branch data in results", () => {
    const snapshot = createEditorSnapshotFromHistory(historyItem, defaults, models, 30);

    expect(snapshot.rows).toHaveLength(30);
    expect(snapshot.rows[0]).toMatchObject({
      prompt: "PPT cover image",
      note: "P1 · Restored page",
      model: "gpt-image-2",
      aspectRatio: "16:9",
      resolution: "1K",
      n: 1,
      referenceMode: "none",
      referenceImageId: null,
      submittedTaskId: "task-root"
    });
    expect(snapshot.rows[1].prompt).toBe("");
    expect(snapshot.editorResults.tasks.map((task) => task.id)).toEqual(["task-root", "task-child"]);
    expect(snapshot.editorResults.images.map((image) => image.id)).toEqual(["image-root", "image-child"]);
  });
});

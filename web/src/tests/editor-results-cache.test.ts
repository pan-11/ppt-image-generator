import { describe, expect, it } from "vitest";
import { mergeEditorResults } from "../lib/editor-results-cache";
import type { ActiveBatchResponse } from "../lib/types";

const batchA: ActiveBatchResponse = {
  batch: {
    id: "batch-a",
    name: "Batch A",
    status: "completed",
    total_tasks: 1,
    success_count: 1,
    failed_count: 0,
    created_at: "2026-05-28T00:00:00.000Z"
  },
  tasks: [
    {
      id: "task-a",
      batch_id: "batch-a",
      prompt: "first image",
      model: "gpt-image-2",
      aspect_ratio: "16:9",
      resolution: "1K",
      size: "16:9",
      n: 1,
      status: "completed"
    }
  ],
  jobs: [],
  images: [
    {
      id: "image-a",
      task_id: "task-a",
      filename: "a.png",
      local_path: "a.png"
    }
  ],
  scheduler: {
    queued: 0,
    running: 0,
    completed: 1,
    failed: 0,
    unknown: 0,
    paused: false
  }
};

describe("mergeEditorResults", () => {
  it("keeps previous row images when a later single-row batch arrives", () => {
    const merged = mergeEditorResults({
      tasks: batchA.tasks,
      images: batchA.images
    }, {
      ...batchA,
      tasks: [
        {
          ...batchA.tasks[0],
          id: "task-b",
          prompt: "second image"
        }
      ],
      images: [
        {
          id: "image-b",
          task_id: "task-b",
          filename: "b.png",
          local_path: "b.png"
        }
      ]
    });

    expect(merged.tasks.map((task) => task.id)).toEqual(["task-a", "task-b"]);
    expect(merged.images.map((image) => image.id)).toEqual(["image-a", "image-b"]);
  });
});

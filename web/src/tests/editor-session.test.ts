import { afterEach, describe, expect, it } from "vitest";
import { loadEditorSession, saveEditorSession } from "../lib/editor-session";
import type { EditorResultsCache } from "../lib/editor-results-cache";
import type { TaskDraft } from "../lib/types";

afterEach(() => {
  window.localStorage.clear();
});

describe("editor session persistence", () => {
  it("saves and loads the editor rows with cached result images", () => {
    const rows: TaskDraft[] = [
      {
        id: "row-1",
        prompt: "saved prompt",
        model: "gpt-image-2",
        aspectRatio: "16:9",
        resolution: "1K",
        n: 1,
        referenceMode: "none",
        referenceImageId: null,
        submittedTaskId: "task-1"
      }
    ];
    const editorResults: EditorResultsCache = {
      tasks: [
        {
          id: "task-1",
          prompt: "saved prompt",
          model: "gpt-image-2",
          aspect_ratio: "16:9",
          resolution: "1K",
          size: "16:9",
          n: 1,
          status: "completed"
        }
      ],
      images: [
        {
          id: "image-1",
          task_id: "task-1",
          filename: "saved.png",
          local_path: "saved.png"
        }
      ]
    };

    saveEditorSession({ rows, editorResults, activeBatchId: "batch-1" });

    expect(loadEditorSession()).toEqual({ rows, editorResults, activeBatchId: "batch-1" });
  });

  it("ignores empty saved rows so history can be restored after refresh", () => {
    const rows: TaskDraft[] = [
      {
        id: "row-empty",
        prompt: "",
        model: "gpt-image-2",
        aspectRatio: "16:9",
        resolution: "1K",
        n: 1,
        referenceMode: "none",
        referenceImageId: null,
        submittedTaskId: null
      }
    ];

    saveEditorSession({
      rows,
      editorResults: { tasks: [], images: [] },
      activeBatchId: null
    });

    expect(loadEditorSession()).toBeNull();
  });
});

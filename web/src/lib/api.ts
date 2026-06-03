import type { ActiveBatchResponse, ReferenceImageRecord, Settings, TaskDraft } from "./types";

async function jsonFetch<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "请求失败");
  }

  return response.json() as Promise<T>;
}

export async function fetchSettings() {
  return jsonFetch<Settings>("/api/settings");
}

export async function createBatch(payload: { name: string; tasks: TaskDraft[]; globalReferenceImageId: string | null }) {
  return jsonFetch<{ batch: { id: string }; tasks: Array<{ id: string }> }>("/api/batches", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: payload.name,
      tasks: payload.tasks.map((task) => ({
        prompt: task.prompt,
        model: task.model,
        aspectRatio: task.aspectRatio,
        resolution: task.resolution,
        size: task.aspectRatio,
        n: task.n,
        referenceMode: task.referenceMode,
        referenceImageId: task.referenceMode === "global" ? payload.globalReferenceImageId : task.referenceImageId
      }))
    })
  });
}

export async function fetchActiveBatch(batchId: string) {
  return jsonFetch<ActiveBatchResponse>(`/api/batches/${batchId}`);
}

export async function fetchHistory() {
  return jsonFetch<Array<{
    batch: ActiveBatchResponse["batch"];
    tasks: ActiveBatchResponse["tasks"];
    images: ActiveBatchResponse["images"];
  }>>("/api/history");
}

export async function uploadReferenceImage(file: File) {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch("/api/reference-images", {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<ReferenceImageRecord>;
}

export async function deleteBatch(batchId: string) {
  return jsonFetch<{ ok: true }>(`/api/history/batches/${batchId}`, { method: "DELETE" });
}

export async function deleteImage(imageId: string) {
  return jsonFetch<{ ok: true }>(`/api/history/images/${imageId}`, { method: "DELETE" });
}

export async function pauseBatch(batchId: string) {
  return jsonFetch<{ ok: true }>(`/api/batches/${batchId}/pause`, { method: "POST" });
}

export async function resumeBatch(batchId: string) {
  return jsonFetch<{ ok: true }>(`/api/batches/${batchId}/resume`, { method: "POST" });
}

export async function retryTasks(taskIds: string[]) {
  return jsonFetch<{ retried: number }>("/api/tasks/retry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ taskIds })
  });
}

export async function createChildTasks(parentImageId: string, tasks: TaskDraft[]) {
  return jsonFetch<{ tasks: ActiveBatchResponse["tasks"] }>(`/api/images/${parentImageId}/children`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tasks: tasks.map((task) => ({
        prompt: task.prompt,
        model: task.model,
        aspectRatio: task.aspectRatio,
        resolution: task.resolution,
        size: task.aspectRatio,
        n: task.n
      }))
    })
  });
}

export async function exportBatch(batchId: string, destinationDir: string) {
  return jsonFetch<{ ok: true; exportedCount: number; destinationDir: string }>(`/api/history/batches/${batchId}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ destinationDir })
  });
}

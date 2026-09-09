import type { ActiveBatchResponse, HistoryItem, ReferenceImageRecord, Settings, TaskDraft } from "./types";

export class HttpResponseError extends Error {
  constructor(public status: number, public diagnosticText: string) {
    let message = diagnosticText;
    try {
      const payload: unknown = JSON.parse(diagnosticText);
      if (typeof payload === "string") message = payload;
      else if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") message = payload.message;
      else if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") message = payload.error;
      else message = "请求失败";
    } catch { /* Plain text responses remain readable without parsing. */ }
    super(message.trim() ? message : `请求失败（HTTP ${status}）`);
    this.name = "HttpResponseError";
  }
}

async function jsonFetch<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw new HttpResponseError(response.status, await response.text());
  }

  return response.json() as Promise<T>;
}

export async function fetchSettings() {
  return jsonFetch<Settings>("/api/settings");
}

export async function createBatch(payload: { name: string; tasks: TaskDraft[]; globalReferenceImageId: string | null; coursewareId?: string }) {
  return jsonFetch<{ batch: { id: string }; tasks: Array<{ id: string }> }>("/api/batches", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: payload.name,
      ...(payload.coursewareId ? { coursewareId: payload.coursewareId } : {}),
      tasks: payload.tasks.map((task) => ({
        ...(payload.coursewareId ? { pageId: task.id } : {}),
        prompt: task.prompt,
        note: task.note,
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
  return jsonFetch<HistoryItem[]>("/api/history");
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
  const submit = async (confirmUnknown = false) => {
    const response = await fetch("/api/tasks/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds, ...(confirmUnknown ? { confirmUnknown: true } : {}) })
    });
    const payload = await response.json().catch(() => null) as {
      code?: string;
      message?: string;
      retriedJobs?: number;
      affectedTasks?: number;
    } | null;
    return { response, payload };
  };

  const first = await submit();
  if (first.response.ok) {
    return {
      retriedJobs: first.payload?.retriedJobs ?? 0,
      affectedTasks: first.payload?.affectedTasks ?? 0
    };
  }
  if (first.payload?.code === "UNKNOWN_CHARGE_RISK") {
    const message = first.payload.message
      ?? "该请求状态未知，中转站可能已经扣费。仍要重新生成吗？";
    if (!window.confirm(message)) return { retriedJobs: 0, affectedTasks: 0 };
    const confirmed = await submit(true);
    if (confirmed.response.ok) {
      return {
        retriedJobs: confirmed.payload?.retriedJobs ?? 0,
        affectedTasks: confirmed.payload?.affectedTasks ?? 0
      };
    }
    throw new Error(confirmed.payload?.message ?? "重试失败");
  }
  throw new Error(first.payload?.message ?? "重试失败");
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

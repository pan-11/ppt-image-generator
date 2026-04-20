async function jsonFetch(input, init) {
    const response = await fetch(input, init);
    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "请求失败");
    }
    return response.json();
}
export async function fetchSettings() {
    return jsonFetch("/api/settings");
}
export async function createBatch(payload) {
    return jsonFetch("/api/batches", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            name: payload.name,
            tasks: payload.tasks.map((task) => ({
                prompt: task.prompt,
                model: task.model,
                size: task.size,
                n: task.n,
                referenceMode: task.referenceMode,
                referenceImageId: task.referenceMode === "global" ? payload.globalReferenceImageId : task.referenceImageId
            }))
        })
    });
}
export async function fetchActiveBatch(batchId) {
    return jsonFetch(`/api/batches/${batchId}`);
}
export async function fetchHistory() {
    return jsonFetch("/api/history");
}
export async function uploadReferenceImage(file) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/reference-images", {
        method: "POST",
        body: form
    });
    if (!response.ok) {
        throw new Error(await response.text());
    }
    return response.json();
}
export async function deleteBatch(batchId) {
    return jsonFetch(`/api/history/batches/${batchId}`, { method: "DELETE" });
}
export async function deleteImage(imageId) {
    return jsonFetch(`/api/history/images/${imageId}`, { method: "DELETE" });
}
export async function pauseBatch(batchId) {
    return jsonFetch(`/api/batches/${batchId}/pause`, { method: "POST" });
}
export async function resumeBatch(batchId) {
    return jsonFetch(`/api/batches/${batchId}/resume`, { method: "POST" });
}
export async function retryTasks(taskIds) {
    return jsonFetch("/api/tasks/retry", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ taskIds })
    });
}

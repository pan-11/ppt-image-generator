import type { ImageRecord, TaskDraft, TaskRecord } from "./types";

export type CoursewarePage = {
  id: string; position: number; sourcePageNumber: string; sourcePageName: string;
  draft: Omit<TaskDraft, "id" | "submittedTaskId">;
  included: boolean; selectedImageId: string | null;
};
export type CoursewareDocument = {
  id: string; name: string; sourceKind: "import" | "manual" | "history" | "legacy-session";
  rawImportText: string | null; importMode: "structured" | "lines" | null;
  legacyBatchId: string | null; globalReferenceImageId: string | null;
  revision: number; pages: CoursewarePage[];
};
export type CoursewareLink = { taskId: string; coursewareId: string; pageId: string; purpose: "original" | "variation" | "textless"; textlessRunId: string | null; sourceImageId: string | null };
export type CoursewareDetail = { courseware: CoursewareDocument; tasks: TaskRecord[]; images: (ImageRecord & { validation_status?: "valid" | "invalid" | "unverified" })[]; links: CoursewareLink[] };
export type CoursewareSummary = { id: string; name: string; pageCount: number; sourceKind: string; updatedAt: string; revision: number };
export type TextlessPage = { pageId: string; position: number; pageLabel: string; sourceImageId: string; taskId: string; aspectRatio: string; resolution: string };
export type TextlessRun = { id: string; coursewareId: string; requestId: string; sourceRevision: number; promptText: string; model: string; manifest: TextlessPage[] };
export type TextlessDetail = { run: TextlessRun; pages: (TextlessPage & { status: string; errorMessage?: string | null; imageId: string | null })[]; tasks: TaskRecord[]; images: ImageRecord[] };

async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw Object.assign(new Error(payload?.message ?? `请求失败 (${response.status})`), { code: payload?.code, status: response.status });
  }
  return response.json() as Promise<T>;
}
export const listCoursewares = () => request<{ coursewares: CoursewareSummary[] }>("/api/coursewares");
export const fetchCourseware = (id: string) => request<CoursewareDetail>(`/api/coursewares/${encodeURIComponent(id)}`);
export async function uploadCoursewareImage(coursewareId: string, pageId: string, file: File, uploadId: string, expectedRevision: number): Promise<CoursewareDetail> {
  const form = new FormData();
  form.append("uploadId", uploadId);
  form.append("expectedRevision", String(expectedRevision));
  form.append("file", file);
  const response = await fetch(`/api/coursewares/${encodeURIComponent(coursewareId)}/pages/${encodeURIComponent(pageId)}/images`, { method: "POST", body: form });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw Object.assign(new Error(payload?.message ?? `图片上传失败 (${response.status})`), { code: payload?.code, status: response.status });
  }
  return response.json() as Promise<CoursewareDetail>;
}
export const createCourseware = (document: CoursewareDocument) => request<CoursewareDocument>(`/api/coursewares/${encodeURIComponent(document.id)}`, "PUT", document);
export const patchCourseware = (document: CoursewareDocument) => request<CoursewareDocument>(`/api/coursewares/${encodeURIComponent(document.id)}`, "PATCH", { expectedRevision: document.revision, name: document.name, pages: document.pages, globalReferenceImageId: document.globalReferenceImageId });
export const adoptHistory = (batchId: string) => request<CoursewareDocument>(`/api/coursewares/from-history/${encodeURIComponent(batchId)}`, "POST", {});
export const listTextlessRuns = (id: string) => request<{ runs: TextlessRun[] }>(`/api/coursewares/${encodeURIComponent(id)}/textless-runs`);
export const fetchTextlessRun = (id: string) => request<TextlessDetail>(`/api/textless-runs/${encodeURIComponent(id)}`);
export const restoreTextlessRun = (id: string) => request<TextlessDetail>(`/api/textless-runs/${encodeURIComponent(id)}/restore-results`, "POST");
export const createTextlessRun = (doc: CoursewareDocument, model: string, requestId: string, pageIds: string[], regenerate = false) => request<TextlessDetail>(`/api/coursewares/${encodeURIComponent(doc.id)}/textless-runs`, "POST", { expectedRevision: doc.revision, requestId, pageIds, model, regenerate });
export async function downloadPptx(url: string, body: unknown, filename: string) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? "PPT 导出失败");
  }
  downloadBlob(await response.blob(), filename);
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportFilename(id: string, variant: string, extension: string) {
  return `courseware-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}-${variant}-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
}
export function pagesFromRows(rows: TaskDraft[], previous: CoursewarePage[] = []): CoursewarePage[] {
  return rows.map(({ id, submittedTaskId: _submitted, ...draft }, position) => {
    const existing = previous.find((page) => page.id === id);
    return { id, sourcePageNumber: "", sourcePageName: "", included: true, selectedImageId: null, ...existing, draft, position };
  });
}

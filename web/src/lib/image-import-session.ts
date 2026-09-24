import type { ImportItem } from "./image-import";

export type ImportManifest = { projectId: string; name: string; items: Array<{ pageId: string; uploadId: string; name: string; fileName: string; size: number; lastModified: number; width: number; height: number; aspectRatio: string; status: "pending" | "success" }> };

const key = (projectId: string) => `image-generator-import:${projectId}`;

export function createImportManifest(projectId: string, name: string, items: ImportItem[]): void {
  const manifest: ImportManifest = { projectId, name, items: items.map(item => ({ pageId: item.pageId, uploadId: item.uploadId, name: item.name, fileName: item.file.name, size: item.file.size, lastModified: item.file.lastModified, width: item.width, height: item.height, aspectRatio: item.aspectRatio, status: "pending" })) };
  localStorage.setItem(key(projectId), JSON.stringify(manifest));
}

export function readImportManifest(projectId: string): ImportManifest | null {
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return null;
    const value = JSON.parse(raw) as ImportManifest;
    return value.projectId === projectId && Array.isArray(value.items) && value.items.every(item => item.pageId && item.uploadId && item.fileName && ["pending", "success"].includes(item.status)) ? value : null;
  } catch { return null; }
}

export function updateImportStatus(projectId: string, uploadId: string, status: "pending" | "success"): void {
  const current = readImportManifest(projectId);
  if (!current) return;
  localStorage.setItem(key(projectId), JSON.stringify({ ...current, items: current.items.map(item => item.uploadId === uploadId ? { ...item, status } : item) }));
}

export function resumeImportFiles(files: File[], manifest: ImportManifest): { items: ImportItem[]; errors: string[] } {
  const errors: string[] = [];
  const items: ImportItem[] = [];
  for (const file of files) {
    const matches = manifest.items.filter(item => item.status === "pending" && item.fileName === file.name && item.size === file.size && item.lastModified === file.lastModified);
    if (matches.length !== 1) { errors.push(`${file.name}：无法唯一匹配未导入的页面，请检查原文件或在对应页面单独上传`); continue; }
    const matched = matches[0];
    if (items.some(item => item.uploadId === matched.uploadId)) { errors.push(`${file.name}：同一文件重复选择`); continue; }
    items.push({ file, pageId: matched.pageId, uploadId: matched.uploadId, name: matched.name, width: matched.width, height: matched.height, aspectRatio: matched.aspectRatio });
  }
  items.sort((a, b) => manifest.items.findIndex(item => item.uploadId === a.uploadId) - manifest.items.findIndex(item => item.uploadId === b.uploadId));
  return { items, errors };
}

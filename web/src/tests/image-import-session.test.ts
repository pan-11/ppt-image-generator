import { beforeEach, expect, it } from "vitest";
import { createImportManifest, readImportManifest, resumeImportFiles, updateImportStatus } from "../lib/image-import-session";

beforeEach(() => localStorage.clear());

it("keeps successful pages and reuses pending page/upload IDs after reselecting files", () => {
  const first = new File(["a"], "1.png", { type: "image/png", lastModified: 100 });
  const second = new File(["b"], "2.png", { type: "image/png", lastModified: 200 });
  createImportManifest("project-b", "项目 B", [
    { file: first, pageId: "page-1", uploadId: "upload-1", name: "1", width: 1920, height: 1080, aspectRatio: "16:9" },
    { file: second, pageId: "page-2", uploadId: "upload-2", name: "2", width: 1920, height: 1080, aspectRatio: "16:9" }
  ]);
  updateImportStatus("project-b", "upload-1", "success");
  expect(readImportManifest("project-b")?.items.map(item => item.status)).toEqual(["success", "pending"]);
  const resumed = resumeImportFiles([second], readImportManifest("project-b")!);
  expect(resumed.errors).toEqual([]);
  expect(resumed.items.map(item => [item.pageId, item.uploadId])).toEqual([["page-2", "upload-2"]]);
  expect(resumeImportFiles([new File(["other"], "2.png", { type: "image/png", lastModified: 200 })], readImportManifest("project-b")!).errors[0]).toContain("2.png");
});

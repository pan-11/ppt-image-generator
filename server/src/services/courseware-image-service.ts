import { basename } from "node:path";
import type Database from "better-sqlite3";
import sharp from "sharp";
import { imageAspectRatiosMatch } from "../lib/image-dimensions.js";
import { CoursewareError, CoursewareService } from "./courseware-service.js";
import type { ReferenceImageService } from "./reference-image-service.js";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export type ImageUpload = { filename: string; mimeType: string; buffer: Buffer };

export async function validateImageUpload(input: ImageUpload) {
  if (input.buffer.length > MAX_UPLOAD_BYTES) throw new CoursewareError(413, "IMAGE_TOO_LARGE", "图片不能超过 20 MiB");
  if (!["image/png", "image/jpeg", "image/webp"].includes(input.mimeType)) throw new CoursewareError(415, "UNSUPPORTED_IMAGE", "仅支持 PNG、JPEG、WebP 图片");
  try {
    const metadata = await sharp(input.buffer, { failOn: "warning" }).metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? "") || input.mimeType !== `image/${metadata.format}` || (metadata.pages ?? 1) > 1) throw new CoursewareError(415, "UNSUPPORTED_IMAGE", "请上传单张 PNG、JPEG、WebP 图片，文件格式必须正确");
    const decoded = await sharp(input.buffer, { failOn: "warning" }).rotate().raw().toBuffer({ resolveWithObject: true });
    return { width: decoded.info.width, height: decoded.info.height, mimeType: input.mimeType, filename: basename(input.filename) };
  } catch (error) {
    if (error instanceof CoursewareError) throw error;
    throw new CoursewareError(422, "INVALID_IMAGE", "图片无法完整解码，请重新选择有效图片");
  }
}

export class CoursewareImageService {
  constructor(private db: Database.Database, private courses: CoursewareService, private references: ReferenceImageService) {}

  async upload(coursewareId: string, pageId: string, input: ImageUpload & { uploadId: string; expectedRevision: number }) {
    const check = () => {
      const doc = this.courses.require(coursewareId);
      const repeated = this.db.prepare("select courseware_id,page_id from courseware_uploaded_images where upload_id=?").get(input.uploadId) as { courseware_id: string; page_id: string } | undefined;
      if (repeated && (repeated.courseware_id !== coursewareId || repeated.page_id !== pageId)) throw new CoursewareError(409, "UPLOAD_CONFLICT", "此上传 ID 已用于其他页面");
      if (this.db.prepare("select id from generated_images where id=?").get(input.uploadId)) throw new CoursewareError(409, "UPLOAD_CONFLICT", "此上传 ID 已被图片占用，请重新选择文件");
      const page = doc.pages.find(p => p.id === pageId);
      if (!page) throw new CoursewareError(409, "INVALID_PAGE", "页面不存在或不属于本课件");
      if (!repeated && doc.revision !== input.expectedRevision) throw new CoursewareError(409, "REVISION_CONFLICT", "课件已发生变化，请重新打开该页后上传");
      return { doc, page, repeated };
    };
    if (check().repeated) return this.courses.detail(coursewareId);
    const metadata = await validateImageUpload(input);
    return this.db.transaction(() => {
      const { doc, page, repeated } = check();
      if (repeated) return this.courses.detail(coursewareId);
      const ratio = /^(\d+(?:\.\d+)?)[x:](\d+(?:\.\d+)?)$/.exec(page.draft.aspectRatio);
      if (!ratio) throw new CoursewareError(422, "INVALID_ASPECT_RATIO", "页面比例无效，请先设置页面比例");
      const expected = { width: 1600, height: 1600 * Number(ratio[2]) / Number(ratio[1]) };
      if (!imageAspectRatiosMatch(metadata, expected)) throw new CoursewareError(422, "ASPECT_RATIO_MISMATCH", `图片比例与本页 ${page.draft.aspectRatio} 不符`);
      const reference = this.references.createLocalReference({ ...input, filename: metadata.filename });
      const imageId = input.uploadId;
      this.db.prepare("insert into courseware_uploaded_images (id,upload_id,courseware_id,page_id,reference_image_id,width,height,created_at) values (?,?,?,?,?,?,?,?)").run(imageId, input.uploadId, coursewareId, pageId, reference.id, metadata.width, metadata.height, new Date().toISOString());
      this.courses.update(coursewareId, { ...doc, expectedRevision: input.expectedRevision, pages: doc.pages.map(p => p.id === pageId ? { ...p, selectedImageId: imageId } : p) });
      return this.courses.detail(coursewareId);
    }).immediate();
  }
}

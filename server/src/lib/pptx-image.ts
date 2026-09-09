import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { CoursewareError } from "../services/courseware-service.js";

export async function preparePptxImage(path: string, label: string) {
  try {
    const bytes = (await stat(path)).size;
    if (bytes > 200 * 1024 * 1024) throw new CoursewareError(413, "EXPORT_TOO_LARGE", `${label} 图片过大`);
    const original = await readFile(path);
    const meta = await sharp(original, { failOn: "warning" }).metadata();
    const decoded = await sharp(original, { failOn: "warning" }).rotate().png().toBuffer({ resolveWithObject: true });
    const preserve = (meta.format === "png" || meta.format === "jpeg") && (!meta.orientation || meta.orientation === 1);
    return { buffer: preserve ? original : decoded.data, width: decoded.info.width, height: decoded.info.height, mime: preserve && meta.format === "jpeg" ? "image/jpeg" : "image/png", bytes };
  } catch (error) {
    if (error instanceof CoursewareError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new CoursewareError(409, "MISSING_IMAGE", `${label} 图片文件已不存在`);
    throw new CoursewareError(422, "INVALID_IMAGE", `${label} 图片缺失或无法完整解码`);
  }
}

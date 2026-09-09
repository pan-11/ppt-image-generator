import { createRequire } from "node:module";
import { stat } from "node:fs/promises";
import { preparePptxImage } from "./pptx-image.js";
import { CoursewareError } from "../services/courseware-service.js";

const PptxGenJS = createRequire(import.meta.url)("pptxgenjs") as typeof import("pptxgenjs").default;
let packing = false;

export async function createImagePptx(images: Array<{ path: string; label: string; sourcePath?: string }>) {
  if (packing) throw new CoursewareError(409, "EXPORT_BUSY", "正在导出另一份 PPT，请稍后重试");
  packing = true;
  try {
    if (!images.length) throw new CoursewareError(400, "EMPTY_SELECTION", "请选择页面");
    if (images.length > 100) throw new CoursewareError(413, "TOO_MANY_PAGES", "单次最多导出 100 页");
    let bytes = 0;
    for (const image of images) {
      try { bytes += (await stat(image.path)).size; }
      catch { throw new CoursewareError(409, "MISSING_IMAGE", `${image.label} 图片文件已不存在或无法读取`); }
      if (bytes > 200 * 1024 * 1024) throw new CoursewareError(413, "EXPORT_TOO_LARGE", "图片总大小超过 200 MiB");
    }
    const prepared = [];
    for (const image of images) {
      const result = await preparePptxImage(image.path, image.label);
      if (image.sourcePath) {
        const source = await preparePptxImage(image.sourcePath, image.label);
        if (source.width * result.height !== result.width * source.height) throw new CoursewareError(422, "ASPECT_RATIO_MISMATCH", `${image.label} 去字结果与源图比例不同`);
      }
      const first = prepared[0];
      if (first && result.width * first.height !== first.width * result.height) throw new CoursewareError(422, "ASPECT_RATIO_MISMATCH", `${image.label} 图片 ${result.width}×${result.height} 与首页 ${first.width}×${first.height} 比例不同`);
      prepared.push(result);
    }
    const pptx = new PptxGenJS();
    const width = 13.333333;
    const height = width * prepared[0].height / prepared[0].width;
    pptx.defineLayout({ name: "COURSEWARE", width, height });
    pptx.layout = "COURSEWARE";
    for (const image of prepared) pptx.addSlide().addImage({ data: `data:${image.mime};base64,${image.buffer.toString("base64")}`, x: 0, y: 0, w: width, h: height });
    return Buffer.from(await pptx.write({ outputType: "nodebuffer" }) as Buffer);
  } finally {
    packing = false;
  }
}

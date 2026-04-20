import { basename } from "node:path";
import JSZip from "jszip";

export async function createZipBuffer(files: Array<{ filename?: string; buffer: Buffer; path?: string }>) {
  const zip = new JSZip();

  files.forEach((file, index) => {
    const fallback = file.path ? basename(file.path) : `image-${index + 1}.png`;
    zip.file(file.filename ?? fallback, file.buffer);
  });

  return zip.generateAsync({ type: "nodebuffer" });
}

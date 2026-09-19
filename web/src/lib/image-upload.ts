export const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;

export function validateImageUpload(file: File): string | null {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return "请选择 PNG、JPG 或 WebP 图片。";
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return "图片超过 20 MiB，请选择较小的图片。";
  if (!file.size) return "图片文件为空，请重新选择。";
  return null;
}

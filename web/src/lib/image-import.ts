export type ImportItem = { file: File; pageId: string; uploadId: string; name: string; width: number; height: number; aspectRatio: string };
export type ImportPlan = { items: ImportItem[]; errors: string[] };
const maxFileBytes = 20 * 1024 * 1024;
const maxTotalBytes = 200 * 1024 * 1024;
const nameOrder = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
const commonRatios = ["16:9", "9:16", "4:3", "3:4", "1:1", "3:2", "2:3", "21:9"];

function ratio(width: number, height: number) {
  const matched = commonRatios.find(value => {
    const [w, h] = value.split(":").map(Number);
    return Math.abs(width / height - w / h) < 0.003;
  });
  if (matched) return matched;
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

async function dimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("图片无法读取"));
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

export async function planImageImport(files: File[], maxBatchSize: number): Promise<ImportPlan> {
  const errors: string[] = [];
  if (!files.length) errors.push("请选择图片");
  const limit = Math.min(maxBatchSize, 100);
  if (files.length > limit) errors.push(`单次最多 ${limit} 页`);
  if (files.reduce((sum, file) => sum + file.size, 0) > maxTotalBytes) errors.push("图片总大小不能超过 200 MiB");
  const ordered = files.map((file, index) => ({ file, index })).sort((a, b) => nameOrder.compare(a.file.name, b.file.name) || a.index - b.index);
  const items: ImportItem[] = [];
  for (const { file } of ordered) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size || file.size > maxFileBytes) {
      errors.push(`${file.name}：请选择不超过 20 MiB 的 PNG、JPG 或 WebP 图片`);
      continue;
    }
    try {
      const { width, height } = await dimensions(file);
      if (!width || !height) throw new Error("图片尺寸无效");
      items.push({ file, pageId: crypto.randomUUID(), uploadId: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, "") || file.name, width, height, aspectRatio: ratio(width, height) });
    } catch {
      errors.push(`${file.name}：图片无法读取`);
    }
  }
  return { items, errors };
}

export function reorderImages(items: ImportItem[], from: number, to: number): ImportItem[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const moved = [...items];
  moved.splice(to, 0, moved.splice(from, 1)[0]);
  return moved;
}

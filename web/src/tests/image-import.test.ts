import { afterEach, expect, it, vi } from "vitest";
import { planImageImport, reorderImages } from "../lib/image-import";

const file = (name: string, size = 4) => new File([new Uint8Array(size)], name, { type: "image/png" });
afterEach(() => vi.unstubAllGlobals());

it("sorts numeric filenames once and keeps page and upload identities while reordering", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1672, height: 941, close() {} })));
  const plan = await planImageImport([file("10.png"), file("2.png"), file("1.png")], 100);
  expect(plan.errors).toEqual([]);
  expect(plan.items.map(item => item.file.name)).toEqual(["1.png", "2.png", "10.png"]);
  expect(plan.items.map(item => item.aspectRatio)).toEqual(["16:9", "16:9", "16:9"]);
  const reordered = reorderImages(plan.items, 2, 0);
  expect(reordered.map(item => item.file.name)).toEqual(["10.png", "1.png", "2.png"]);
  expect(reordered[0].pageId).toBe(plan.items[2].pageId);
  expect(reordered[0].uploadId).toBe(plan.items[2].uploadId);
  expect(new Set(plan.items.map(item => item.pageId)).size).toBe(3);
});

it("reports named invalid files and keeps upload limits consistent with the server", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1920, height: 1080, close() {} })));
  const invalid = new File(["bad"], "bad.gif", { type: "image/gif" });
  const plan = await planImageImport([file("one.png"), invalid], 1);
  expect(plan.errors).toEqual(expect.arrayContaining([expect.stringContaining("bad.gif"), expect.stringContaining("最多 1 页")]));
  const tooLarge = await planImageImport([file("large.png", 20 * 1024 * 1024 + 1)], 100);
  expect(tooLarge.errors[0]).toContain("large.png");
});

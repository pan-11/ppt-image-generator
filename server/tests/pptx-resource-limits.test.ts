import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({ oversized: false, reads: 0 }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    stat: async (...args: Parameters<typeof actual.stat>) => mocks.oversized ? { size: 110 * 1024 * 1024 } : actual.stat(...args),
    readFile: async (...args: Parameters<typeof actual.readFile>) => { mocks.reads++; return actual.readFile(...args); }
  };
});
import { createImagePptx } from "../src/lib/pptx-service.js";

beforeEach(() => { mocks.oversized = false; mocks.reads = 0; });
describe("PPT packing resource guards", () => {
  it("rejects the total input size before reading or decoding any image", async () => {
    mocks.oversized = true;
    await expect(createImagePptx([{ path: "one.png", label: "1" }, { path: "two.png", label: "2" }])).rejects.toMatchObject({ statusCode: 413, code: "EXPORT_TOO_LARGE" });
    expect(mocks.reads).toBe(0);
  });
  it("allows one global export and releases its lock after both failure and completion", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pptx-lock-"));
    const path = join(dir, "image.png");
    writeFileSync(path, await sharp({ create: { width: 16, height: 9, channels: 3, background: "red" } }).png().toBuffer());
    const images = [{ path, label: "1" }];
    const running = createImagePptx(images);
    await expect(createImagePptx(images)).rejects.toMatchObject({ statusCode: 409, code: "EXPORT_BUSY" });
    expect((await running).length).toBeGreaterThan(1000);
    await expect(createImagePptx([{ path: join(dir, "missing.png"), label: "missing" }])).rejects.toMatchObject({ statusCode: 409, code: "MISSING_IMAGE" });
    expect((await createImagePptx(images)).length).toBeGreaterThan(1000);
  });
});

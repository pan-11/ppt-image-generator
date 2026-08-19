import { describe, expect, it } from "vitest";
import { readImageDimensions } from "../src/lib/image-dimensions.js";

describe("readImageDimensions", () => {
  it("reads PNG dimensions from the IHDR header", () => {
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
    png.writeUInt32BE(2048, 16);
    png.writeUInt32BE(1152, 20);

    expect(readImageDimensions(png)).toEqual({ width: 2048, height: 1152 });
  });

  it("reads JPEG dimensions from a start-of-frame segment", () => {
    const jpeg = Buffer.from([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08,
      0x04, 0x80,
      0x08, 0x00,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
      0xff, 0xd9
    ]);

    expect(readImageDimensions(jpeg)).toEqual({ width: 2048, height: 1152 });
  });

  it("rejects unrecognized image bytes", () => {
    expect(() => readImageDimensions(Buffer.from("not-an-image")))
      .toThrow("无法识别返回图片尺寸");
  });
});

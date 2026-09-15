import { describe, expect, it } from "vitest";
import { imageAspectRatiosMatch, imageDimensionsMatch, readImageDimensions } from "../src/lib/image-dimensions.js";

describe("rounded image dimensions", () => {
  it.each([
    { source: { width: 1280, height: 720 }, requested: { width: 1672, height: 941 } },
    { source: { width: 1536, height: 864 }, requested: { width: 1672, height: 941 } },
    { source: { width: 3840, height: 2160 }, requested: { width: 1672, height: 941 } },
    { source: { width: 8192, height: 4608 }, requested: { width: 1672, height: 941 } },
    { source: { width: 1280, height: 720 }, requested: { width: 3344, height: 1881 } },
    { source: { width: 1280, height: 720 }, requested: { width: 6688, height: 3762 } },
    { source: { width: 720, height: 1280 }, requested: { width: 941, height: 1672 } },
    { source: { width: 1024, height: 1024 }, requested: { width: 2048, height: 2048 } }
  ])("accepts every allowed two-axis deviation for $source -> $requested", ({ source, requested }) => {
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        const actual = { width: requested.width + dx, height: requested.height + dy };
        expect(imageDimensionsMatch(actual, requested)).toBe(true);
        expect(imageAspectRatiosMatch(source, actual), JSON.stringify({ source, actual })).toBe(true);
        expect(imageAspectRatiosMatch(actual, source)).toBe(true);
      }
    }
  });

  it("accepts the reported page 12 and opposite rounding directions", () => {
    expect(imageAspectRatiosMatch({ width: 1280, height: 720 }, { width: 1670, height: 942 })).toBe(true);
    expect(imageAspectRatiosMatch({ width: 1674, height: 939 }, { width: 1670, height: 943 })).toBe(true);
  });

  it("still rejects larger size errors and materially different canvases", () => {
    const requested = { width: 1672, height: 941 };
    expect(imageDimensionsMatch({ width: 1669, height: 941 }, requested)).toBe(false);
    expect(imageDimensionsMatch({ width: 1672, height: 944 }, requested)).toBe(false);
    expect(imageDimensionsMatch({ width: 1280, height: 720 }, requested)).toBe(false);
    for (const actual of [{ width: 1672, height: 960 }, { width: 1280, height: 800 }, { width: 941, height: 1672 }, { width: 941, height: 941 }, { width: 0, height: 720 }]) {
      expect(imageAspectRatiosMatch({ width: 1280, height: 720 }, actual)).toBe(false);
    }
  });
});

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

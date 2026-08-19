const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const jpegStartOfFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf
]);

export function readImageDimensions(buffer: Buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(pngSignature)) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === undefined || offset + 4 > buffer.length) break;
      const length = buffer.readUInt16BE(offset + 2);
      if (jpegStartOfFrameMarkers.has(marker)) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5)
        };
      }
      if (length < 2 || offset + 2 + length > buffer.length) break;
      offset += 2 + length;
    }
  }

  throw new Error("无法识别返回图片尺寸");
}

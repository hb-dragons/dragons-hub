/**
 * Build-time blurhash → BMP data URI (the BlurImage placeholder).
 *
 * The legacy site decoded hashes with unlazy's `createPlaceholderFromHash`;
 * here the decode runs during `astro build` (no canvas in Node), so the RGBA
 * pixels are wrapped in an uncompressed 24-bit BMP — a fixed 54-byte header
 * plus bottom-up BGR rows, no encoder dependency needed. Blurhashes are always
 * opaque, so dropping alpha is lossless.
 */
import { decode } from "blurhash";

const FILE_HEADER_SIZE = 14;
const INFO_HEADER_SIZE = 40;

export function blurhashToDataUri(hash: string, width = 32, height = 32): string {
  const pixels = decode(hash, width, height); // RGBA, top-down
  const rowSize = Math.ceil((width * 3) / 4) * 4; // rows pad to 4 bytes
  const pixelBytes = rowSize * height;
  const fileSize = FILE_HEADER_SIZE + INFO_HEADER_SIZE + pixelBytes;
  const bmp = Buffer.alloc(fileSize);

  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(FILE_HEADER_SIZE + INFO_HEADER_SIZE, 10); // pixel data offset
  bmp.writeUInt32LE(INFO_HEADER_SIZE, 14);
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(height, 22);
  bmp.writeUInt16LE(1, 26); // planes
  bmp.writeUInt16LE(24, 28); // bits per pixel
  bmp.writeUInt32LE(pixelBytes, 34);

  for (let y = 0; y < height; y++) {
    // BMP stores rows bottom-up.
    const rowStart = FILE_HEADER_SIZE + INFO_HEADER_SIZE + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = rowStart + x * 3;
      bmp[dst] = pixels[src + 2]!; // B
      bmp[dst + 1] = pixels[src + 1]!; // G
      bmp[dst + 2] = pixels[src]!; // R
    }
  }

  return `data:image/bmp;base64,${bmp.toString("base64")}`;
}

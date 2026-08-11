import { describe, expect, it } from "vitest";

import { blurhashToDataUri } from "./blurhash";

/** Valid blurhash taken from the legacy banner image (BannerImage.vue). */
const BANNER_HASH = "UBBgG39Z0K_4~WD%D%%M56xa-UIoIUt7n+Rj";

function decodePayload(uri: string): Buffer {
  const base64 = uri.slice(uri.indexOf(",") + 1);
  return Buffer.from(base64, "base64");
}

describe("blurhashToDataUri", () => {
  it("returns a BMP data URI", () => {
    const uri = blurhashToDataUri(BANNER_HASH);
    expect(uri.startsWith("data:image/bmp;base64,")).toBe(true);
  });

  it("encodes a well-formed BMP: magic bytes, declared size and dimensions", () => {
    const bmp = decodePayload(blurhashToDataUri(BANNER_HASH, 32, 32));
    expect(bmp.subarray(0, 2).toString("ascii")).toBe("BM");
    expect(bmp.readUInt32LE(2)).toBe(bmp.length);
    expect(bmp.readInt32LE(18)).toBe(32); // width
    expect(bmp.readInt32LE(22)).toBe(32); // height
  });

  it("pads BMP rows to 4-byte boundaries for non-aligned widths", () => {
    const width = 17; // 17 * 3 = 51 bytes → padded to 52 per row
    const height = 5;
    const bmp = decodePayload(blurhashToDataUri(BANNER_HASH, width, height));
    const headerSize = 14 + 40;
    expect(bmp.length).toBe(headerSize + 52 * height);
    expect(bmp.readInt32LE(18)).toBe(width);
    expect(bmp.readInt32LE(22)).toBe(height);
  });

  it("is deterministic for the same hash", () => {
    expect(blurhashToDataUri(BANNER_HASH)).toBe(blurhashToDataUri(BANNER_HASH));
  });

  it("produces different pixels for different hashes", () => {
    const other = "UZIF9*NGtQt7~XV@jbkCxdt7RjofMwWVR%of";
    expect(blurhashToDataUri(BANNER_HASH)).not.toBe(blurhashToDataUri(other));
  });

  it("throws on an invalid hash", () => {
    expect(() => blurhashToDataUri("not-a-blurhash")).toThrow();
  });
});

import { isBlurhashValid } from "blurhash";
import { describe, expect, it } from "vitest";

import { encodeBlurhash } from "./blurhash";
import { ONE_BY_ONE_PNG } from "./test-fixtures";

describe("encodeBlurhash", () => {
  it("encodes a valid image to a valid blurhash", async () => {
    const hash = await encodeBlurhash(ONE_BY_ONE_PNG);
    expect(hash.length).toBeGreaterThan(0);
    expect(isBlurhashValid(hash).result).toBe(true);
  });

  it("throws on a non-image buffer", async () => {
    await expect(encodeBlurhash(Buffer.from("not an image"))).rejects.toThrow();
  });
});

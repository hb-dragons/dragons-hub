import { describe, expect, it } from "vitest";

import {
  MAX_PORTRAIT_BYTES,
  MAX_PORTRAIT_DIMENSION,
  PORTRAIT_EXT_BY_CONTENT_TYPE,
  PORTRAIT_PREFIX,
  isPortraitContentType,
} from "./portrait-rules";

/**
 * The values the API's `team-staff-photo.service.ts` uses, written out by
 * hand: the two packages cannot import each other, so this is the one place
 * a change on either side turns into a failing test instead of an object the
 * public portrait route cannot serve.
 */
describe("portrait rules", () => {
  it("match the API's portrait service", () => {
    expect(PORTRAIT_PREFIX).toBe("team-staff-photos");
    expect(MAX_PORTRAIT_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_PORTRAIT_DIMENSION).toBe(512);
    expect(PORTRAIT_EXT_BY_CONTENT_TYPE).toEqual({
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
    });
  });

  it("accept only the three stored image types", () => {
    expect(isPortraitContentType("image/jpeg")).toBe(true);
    expect(isPortraitContentType("image/gif")).toBe(false);
    expect(isPortraitContentType("toString")).toBe(false);
  });
});

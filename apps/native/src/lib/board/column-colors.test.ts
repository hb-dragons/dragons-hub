import { describe, expect, it } from "vitest";
import { COLUMN_COLOR_PRESETS } from "@/lib/board/column-colors";

describe("COLUMN_COLOR_PRESETS", () => {
  it("starts with the 'no colour' option", () => {
    expect(COLUMN_COLOR_PRESETS[0]).toBeNull();
  });

  it("has 8 distinct entries (1 null + 7 unique hex colours)", () => {
    expect(COLUMN_COLOR_PRESETS).toHaveLength(8);
    const hexValues = COLUMN_COLOR_PRESETS.filter(
      (c): c is Exclude<typeof c, null> => c !== null,
    );
    expect(new Set(hexValues).size).toBe(hexValues.length);
    for (const hex of hexValues) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

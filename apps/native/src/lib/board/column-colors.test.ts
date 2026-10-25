import { describe, expect, it } from "vitest";
import { COLUMN_COLOR_PRESETS, columnColorLabelKey } from "@/lib/board/column-colors";
import de from "@/i18n/de.json";
import en from "@/i18n/en.json";
import { lookup } from "../../../test/i18n-bundles";

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

describe("columnColorLabelKey", () => {
  it.each(COLUMN_COLOR_PRESETS)("names swatch %s with a key both bundles carry", (preset) => {
    const key = columnColorLabelKey(preset);
    expect(lookup(de, key)).toEqual(expect.any(String));
    expect(lookup(en, key)).toEqual(expect.any(String));
  });

  it("gives every swatch its own name", () => {
    const keys = COLUMN_COLOR_PRESETS.map(columnColorLabelKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

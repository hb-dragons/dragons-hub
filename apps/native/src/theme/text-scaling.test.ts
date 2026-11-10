import { describe, expect, it } from "vitest";
import {
  MAX_FONT_SIZE_MULTIPLIER,
  STACKED_LAYOUT_FONT_SCALE,
  maxFontSizeMultiplierFor,
  scaledSize,
  tableLayoutFor,
} from "./text-scaling";

describe("tableLayoutFor", () => {
  // iOS reports these fontScale values for its text-size steps; Android's
  // largest steps are 1.3 (before 14) and 1.5 / 1.8 / 2.0 (14 and later).
  it.each([
    [0.823, "columns"], // iOS xSmall
    [1, "columns"], // iOS Large, the default
    [1.3, "columns"], // Android "largest" before 14
    [1.353, "columns"], // iOS xxxLarge, the largest non-accessibility size
    [1.5, "stacked"], // Android 14 150 %
    [1.786, "stacked"], // iOS AX1, the first accessibility size
    [2, "stacked"], // Android 14 200 %
    [3.571, "stacked"], // iOS AX5, the largest size
  ] as const)("fontScale %s lays tables out as %s", (fontScale, layout) => {
    expect(tableLayoutFor(fontScale)).toBe(layout);
  });

  it("switches exactly at the threshold", () => {
    expect(tableLayoutFor(STACKED_LAYOUT_FONT_SCALE - 0.001)).toBe("columns");
    expect(tableLayoutFor(STACKED_LAYOUT_FONT_SCALE)).toBe("stacked");
  });

  it("treats a missing or nonsense scale as the default size", () => {
    expect(tableLayoutFor(Number.NaN)).toBe("columns");
    expect(tableLayoutFor(0)).toBe("columns");
  });
});

describe("maxFontSizeMultiplierFor", () => {
  it.each(["score", "stat", "tableHeader"] as const)("caps %s", (role) => {
    const cap = maxFontSizeMultiplierFor(role);
    expect(cap).toBeDefined();
    // Around 1.5-2 (audit §4.1): still grows, but cannot push its row apart.
    expect(cap).toBeGreaterThanOrEqual(1.5);
    expect(cap).toBeLessThanOrEqual(2);
  });

  it.each(["body", "caption", "label", "button", "cardTitle", "sectionTitle", "screenTitle"] as const)(
    "leaves %s uncapped",
    (role) => {
      expect(maxFontSizeMultiplierFor(role)).toBeUndefined();
    },
  );

  it("names only the capped roles in the table", () => {
    expect(Object.keys(MAX_FONT_SIZE_MULTIPLIER).sort()).toEqual(["score", "stat", "tableHeader"]);
  });
});

describe("scaledSize", () => {
  it("keeps the base size at or below the default text size", () => {
    expect(scaledSize(72, 1)).toBe(72);
    expect(scaledSize(72, 0.823)).toBe(72);
  });

  it("grows with the text above it, rounded up to whole points", () => {
    expect(scaledSize(72, 1.353)).toBe(98);
    expect(scaledSize(58, 3.571)).toBe(208);
  });

  it("treats a missing or nonsense scale as the default size", () => {
    expect(scaledSize(72, Number.NaN)).toBe(72);
  });
});

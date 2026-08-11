import { describe, expect, it } from "vitest";
import { clubLogoMetrics } from "./club-logo";

describe("clubLogoMetrics", () => {
  it("renders a plain logo at exactly the requested size with no chrome", () => {
    expect(clubLogoMetrics(24, "plain")).toEqual({
      boxSize: 24,
      imageSize: 24,
      padding: 0,
      borderRadius: 6,
      chip: false,
    });
  });

  it("defaults to plain when no variant is given", () => {
    expect(clubLogoMetrics(24)).toEqual(clubLogoMetrics(24, "plain"));
  });

  it("gives the chip variant real chrome, so it is no longer a silently ignored prop", () => {
    // The bug: `variant` was declared as "plain" | "chip" but never
    // destructured, so six call sites passing variant="chip" got plain chrome.
    const chip = clubLogoMetrics(64, "chip");

    expect(chip.chip).toBe(true);
    expect(chip.boxSize).toBe(64);
    expect(chip.padding).toBeGreaterThan(0);
    expect(chip.imageSize).toBe(64 - 2 * chip.padding);
  });

  it("keeps the chip's outer footprint identical to the plain variant", () => {
    // Layout must not shift when a caller switches variants.
    for (const size of [16, 24, 40, 64, 96]) {
      expect(clubLogoMetrics(size, "chip").boxSize).toBe(clubLogoMetrics(size, "plain").boxSize);
    }
  });

  it("always leaves a visible glyph, even at tiny sizes", () => {
    for (const size of [8, 12, 16]) {
      expect(clubLogoMetrics(size, "chip").imageSize).toBeGreaterThan(0);
    }
  });

  it("scales the chip corner radius with the box", () => {
    expect(clubLogoMetrics(64, "chip").borderRadius).toBeGreaterThan(
      clubLogoMetrics(24, "chip").borderRadius,
    );
  });
});

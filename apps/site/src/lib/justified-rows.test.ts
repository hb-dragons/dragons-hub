import { describe, expect, it } from "vitest";

import { getJustifiedRows } from "./justified-rows";

const img = (width: number | null, height: number | null) => ({ width, height });

describe("getJustifiedRows", () => {
  it("returns no rows for an empty gallery", () => {
    expect(getJustifiedRows([])).toEqual([]);
  });

  it("renders a single image at the target row height", () => {
    const rows = getJustifiedRows([img(1200, 800)], 250);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(1);
    expect(rows[0]![0]!.displayHeight).toBe(250);
    expect(rows[0]![0]!.displayWidth).toBeCloseTo(250 * 1.5);
  });

  it("keeps images on one row while they fit the 1200px container", () => {
    // Two 1.5-ratio images at 250px: 375 + 16 + 375 = 766 < 1200.
    const rows = getJustifiedRows([img(1200, 800), img(1200, 800)], 250);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(2);
    // Last row is never scaled.
    expect(rows[0]![0]!.displayHeight).toBe(250);
  });

  it("wraps into a scaled row when the next image would overflow", () => {
    // Three 2:1 images at 250px are 500px each; the third overflows
    // (500+516+500+16 > 1200) and starts a new row.
    const wide = img(2000, 1000);
    const rows = getJustifiedRows([wide, wide, wide], 250);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(2);
    expect(rows[1]).toHaveLength(1);
    // First row scales by the legacy factor: available width over the
    // accumulated row width (which, as in the legacy code, includes the gap).
    const first = rows[0]!;
    const scale = (1200 - 16) / (500 + 500 + 16);
    expect(first[0]!.displayWidth).toBeCloseTo(500 * scale);
    expect(first[1]!.displayWidth).toBeCloseTo(500 * scale);
    // Scaled rows keep a uniform height.
    expect(first[0]!.displayHeight).toBeCloseTo(250 * scale);
    expect(first[1]!.displayHeight).toBeCloseTo(250 * scale);
    // The overflowing image lands unscaled on the last row.
    expect(rows[1]![0]!.displayHeight).toBe(250);
  });

  it("keeps the source image on each entry", () => {
    const a = img(1200, 800);
    const rows = getJustifiedRows([a]);
    expect(rows[0]![0]!.image).toBe(a);
  });

  it("assumes a 3:2 ratio when dimensions are missing", () => {
    const rows = getJustifiedRows([img(null, null)], 200);
    expect(rows[0]![0]!.displayWidth).toBeCloseTo(300);
  });

  it("assumes a 3:2 ratio when a dimension is zero", () => {
    const rows = getJustifiedRows([img(1200, 0)], 200);
    expect(rows[0]![0]!.displayWidth).toBeCloseTo(300);
  });
});

import { describe, expect, it } from "vitest";
import { deriveClockMs } from "./clock-ms";

describe("deriveClockMs", () => {
  it("converts MM:SS to whole ms", () => {
    expect(deriveClockMs("08:17", 497)).toBe(497_000);
    expect(deriveClockMs("10:00", 600)).toBe(600_000);
  });

  it("recovers sub-minute tenths from SS.t", () => {
    expect(deriveClockMs("42.7", 42)).toBe(42_700);
    expect(deriveClockMs("9.0", 9)).toBe(9_000);
  });

  it("falls back to clockSeconds when text is unparseable", () => {
    expect(deriveClockMs("--:--", 12)).toBe(12_000);
    expect(deriveClockMs("--:--", null)).toBeNull();
  });
});

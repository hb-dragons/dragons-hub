import { describe, expect, it } from "vitest";
import {
  computeSecondsSince,
  SCOREBOARD_ONLINE_THRESHOLD_MS,
  BROADCAST_STALE_THRESHOLD_MS,
} from "./constants";

describe("computeSecondsSince", () => {
  it("returns 0 for null/undefined", () => {
    expect(computeSecondsSince(null)).toBe(0);
    expect(computeSecondsSince(undefined)).toBe(0);
  });

  it("computes seconds for a Date object", () => {
    const past = new Date(Date.now() - 5_000);
    expect(computeSecondsSince(past)).toBeGreaterThanOrEqual(4);
    expect(computeSecondsSince(past)).toBeLessThanOrEqual(6);
  });

  it("computes seconds for an ISO string", () => {
    const past = new Date(Date.now() - 10_000).toISOString();
    expect(computeSecondsSince(past)).toBeGreaterThanOrEqual(9);
  });

  it("clamps future timestamps to 0", () => {
    const future = new Date(Date.now() + 5_000);
    expect(computeSecondsSince(future)).toBe(0);
  });

  it("returns 0 for invalid date strings", () => {
    expect(computeSecondsSince("not a date")).toBe(0);
  });
});

describe("scoreboard thresholds", () => {
  it("exposes positive constants", () => {
    expect(SCOREBOARD_ONLINE_THRESHOLD_MS).toBeGreaterThan(0);
    expect(BROADCAST_STALE_THRESHOLD_MS).toBeGreaterThan(0);
  });
});

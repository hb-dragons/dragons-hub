import { describe, expect, it } from "vitest";
import {
  formatGameClock,
  formatShotClock,
  interpolate,
  isStale,
  STALE_MS,
  type ClockAnchor,
} from "./clock-interpolation";

describe("formatGameClock", () => {
  it("renders MM:SS at or above one minute (ceil to the whole second)", () => {
    expect(formatGameClock(600_000)).toBe("10:00");
    expect(formatGameClock(60_000)).toBe("01:00");
    expect(formatGameClock(329_500)).toBe("05:30"); // ceil(329.5)=330
  });
  it("renders S.t tenths under a minute (floor to a tenth)", () => {
    expect(formatGameClock(59_900)).toBe("59.9");
    expect(formatGameClock(42_750)).toBe("42.7");
    expect(formatGameClock(0)).toBe("0.0");
  });
});

describe("formatShotClock", () => {
  it("renders whole seconds at/above 5 (ceil)", () => {
    expect(formatShotClock(24)).toBe("24");
    expect(formatShotClock(23.4)).toBe("24");
    expect(formatShotClock(5)).toBe("5");
  });
  it("renders tenths under 5 and 0 at expiry", () => {
    expect(formatShotClock(4.7)).toBe("4.7");
    // Just under 5 stays in the tenths regime (don't round back up to "5").
    expect(formatShotClock(4.999)).toBe("4.9");
    expect(formatShotClock(0)).toBe("0");
    expect(formatShotClock(-1)).toBe("0");
  });
});

function anchor(o: Partial<ClockAnchor> = {}): ClockAnchor {
  return {
    clockMs: 300_000,
    clockText: "05:00",
    shotClock: 18,
    shotClockText: "18",
    clockRunning: true,
    timeoutActive: false,
    anchorAt: 1_000,
    ...o,
  };
}

describe("interpolate", () => {
  it("counts both clocks down from the anchor while running", () => {
    const r = interpolate(anchor(), 3_000); // 2s later
    expect(r.clockText).toBe("04:58");
    expect(r.shotClockText).toBe("16");
  });
  it("holds server text when the clock is stopped", () => {
    const r = interpolate(anchor({ clockRunning: false, clockText: "05:00", shotClockText: "18" }), 9_000);
    expect(r.clockText).toBe("05:00");
    expect(r.shotClockText).toBe("18");
  });
  it("holds the shot clock during a timeout", () => {
    const r = interpolate(anchor({ timeoutActive: true, shotClockText: "18" }), 5_000);
    expect(r.shotClockText).toBe("18");
  });
  it("clamps at zero", () => {
    const r = interpolate(anchor({ clockMs: 1_000, shotClock: 1 }), 11_000); // 10s later
    expect(r.clockText).toBe("0.0");
    expect(r.shotClockText).toBe("0");
  });
});

describe("isStale", () => {
  it("is true once the gap exceeds STALE_MS", () => {
    expect(isStale(anchor({ anchorAt: 0 }), STALE_MS - 1)).toBe(false);
    expect(isStale(anchor({ anchorAt: 0 }), STALE_MS)).toBe(false); // exact boundary holds
    expect(isStale(anchor({ anchorAt: 0 }), STALE_MS + 1)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  broadcastRelevantChange,
  type BroadcastChangeFields,
} from "./broadcast-change";

function base(overrides: Partial<BroadcastChangeFields> = {}): BroadcastChangeFields {
  return {
    scoreHome: 10,
    scoreGuest: 8,
    foulsHome: 1,
    foulsGuest: 2,
    timeoutsHome: 2,
    timeoutsGuest: 1,
    period: 2,
    clockRunning: true,
    timeoutActive: false,
    clockSeconds: 300,
    shotClock: 18,
    ...overrides,
  };
}

describe("broadcastRelevantChange", () => {
  it("is true on the first frame (no previous)", () => {
    expect(broadcastRelevantChange(null, base())).toBe(true);
  });

  it("is false when nothing changed", () => {
    expect(broadcastRelevantChange(base(), base())).toBe(false);
  });

  it("is true when a discrete field changes", () => {
    expect(broadcastRelevantChange(base(), base({ scoreHome: 12 }))).toBe(true);
    expect(broadcastRelevantChange(base(), base({ clockRunning: false }))).toBe(true);
    expect(broadcastRelevantChange(base(), base({ timeoutActive: true }))).toBe(true);
  });

  it("is true when the shot clock resets (increases)", () => {
    expect(broadcastRelevantChange(base({ shotClock: 4 }), base({ shotClock: 24 }))).toBe(true);
    expect(broadcastRelevantChange(base({ shotClock: 8 }), base({ shotClock: 14 }))).toBe(true);
  });

  it("is true when the shot clock toggles on/off", () => {
    expect(broadcastRelevantChange(base({ shotClock: null }), base({ shotClock: 24 }))).toBe(true);
    expect(broadcastRelevantChange(base({ shotClock: 12 }), base({ shotClock: null }))).toBe(true);
  });

  it("is true on a game-clock correction (increase)", () => {
    expect(broadcastRelevantChange(base({ clockSeconds: 290 }), base({ clockSeconds: 300 }))).toBe(true);
  });

  it("is false on a plain countdown of either clock", () => {
    expect(broadcastRelevantChange(base({ clockSeconds: 300, shotClock: 18 }), base({ clockSeconds: 299, shotClock: 17 }))).toBe(false);
    expect(broadcastRelevantChange(base({ shotClock: 4.7 }), base({ shotClock: 4.6 }))).toBe(false);
  });
});

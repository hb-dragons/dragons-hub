import { describe, expect, it } from "vitest";
import { computePhase } from "./phase";

describe("computePhase", () => {
  it("returns idle when not live", () => {
    expect(
      computePhase({
        isLive: false,
        matchId: 1,
        period: 0,
        clockRunning: false,
      }),
    ).toBe("idle");
  });

  it("returns idle when matchId is null even if isLive", () => {
    expect(
      computePhase({
        isLive: true,
        matchId: null,
        period: 0,
        clockRunning: false,
      }),
    ).toBe("idle");
  });

  it("returns pregame when live, period=0, clock stopped", () => {
    expect(
      computePhase({
        isLive: true,
        matchId: 1,
        period: 0,
        clockRunning: false,
      }),
    ).toBe("pregame");
  });

  it("returns live when clock starts in Q1", () => {
    expect(
      computePhase({
        isLive: true,
        matchId: 1,
        period: 1,
        clockRunning: true,
      }),
    ).toBe("live");
  });

  it("stays live during halftime (clock stopped, period > 0)", () => {
    expect(
      computePhase({
        isLive: true,
        matchId: 1,
        period: 2,
        clockRunning: false,
      }),
    ).toBe("live");
  });

  it("returns live even when scoreboard data is missing if period > 0", () => {
    expect(
      computePhase({
        isLive: true,
        matchId: 1,
        period: 4,
        clockRunning: false,
      }),
    ).toBe("live");
  });
});

import { describe, expect, it } from "vitest";
import type { HallTimeWindow } from "@dragons/shared";
import {
  findFit,
  gameEnd,
  programmeWindow,
  type BufferConfig,
  type PlacedGame,
} from "./hall-occupancy";

const config: BufferConfig = {
  bufferBeforeMinutes: 60,
  bufferAfterMinutes: 60,
  defaultGameDurationMinutes: 90,
};

function open(start: string, end: string): HallTimeWindow {
  return { kind: "open", startTime: start, endTime: end, note: null };
}

function g(kickoffTime: string, durationMinutes: number | null = null): PlacedGame {
  return { kickoffTime, durationMinutes };
}

describe("gameEnd", () => {
  it("adds the default duration when none is set", () => {
    expect(gameEnd(g("11:00:00"), config)).toBe("12:30:00");
  });

  it("uses the game duration when set, accepting HH:mm", () => {
    expect(gameEnd(g("11:00", 60), config)).toBe("12:00:00");
  });
});

describe("programmeWindow", () => {
  const cfg: BufferConfig = {
    bufferBeforeMinutes: 30,
    bufferAfterMinutes: 15,
    defaultGameDurationMinutes: 90,
  };

  it("returns null for no games", () => {
    expect(programmeWindow([], cfg)).toBeNull();
  });

  it("spans buffers around a single default-duration game", () => {
    expect(programmeWindow([g("14:00:00")], cfg)).toEqual({
      start: "13:30:00",
      end: "15:45:00",
    });
  });

  it("prefers the team duration over the default", () => {
    expect(programmeWindow([g("14:00:00", 60)], cfg)).toEqual({
      start: "13:30:00",
      end: "15:15:00",
    });
  });

  it("covers earliest kickoff to latest end across mixed games", () => {
    expect(
      programmeWindow([g("12:00:00", 120), g("10:00:00"), g("14:00:00", 60)], cfg),
    ).toEqual({ start: "09:30:00", end: "15:15:00" });
  });

  it("takes the latest end when games share a kickoff", () => {
    expect(programmeWindow([g("16:00:00", 60), g("16:00:00", 120)], cfg)).toEqual({
      start: "15:30:00",
      end: "18:15:00",
    });
  });

  it("keeps a zero team duration instead of falling back to the default", () => {
    expect(programmeWindow([g("10:00:00", 0)], cfg)).toEqual({
      start: "09:30:00",
      end: "10:15:00",
    });
  });

  it("handles zero buffers", () => {
    const noBuffers = { ...cfg, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };
    expect(programmeWindow([g("10:00:00")], noBuffers)).toEqual({
      start: "10:00:00",
      end: "11:30:00",
    });
  });

  it("clamps start to 00:00:00", () => {
    expect(programmeWindow([g("00:15:00")], cfg)).toEqual({
      start: "00:00:00",
      end: "02:00:00",
    });
  });

  it("clamps end to 23:59:59", () => {
    expect(programmeWindow([g("23:00:00")], cfg)).toEqual({
      start: "22:30:00",
      end: "23:59:59",
    });
  });
});

describe("findFit", () => {
  const fit = (
    hallTime: HallTimeWindow | null,
    games: PlacedGame[],
    durationMinutes = 90,
  ) => findFit({ hallTime, games, durationMinutes, config });

  it("suggests start plus buffer in an empty open hall", () => {
    expect(fit(open("10:00", "18:00"), [])).toEqual({
      fits: true,
      suggestedKickoffTime: "11:00:00",
    });
  });

  it("places after the programme when it fits", () => {
    expect(fit(open("10:00:00", "20:00:00"), [g("11:00:00")])).toEqual({
      fits: true,
      suggestedKickoffTime: "13:30:00",
    });
  });

  it("does not fit when neither after nor before works", () => {
    expect(fit(open("10:00", "14:00"), [g("11:00:00")])).toEqual({
      fits: false,
      suggestedKickoffTime: null,
    });
  });

  it("falls back to before the first game when the hall opens early enough", () => {
    expect(fit(open("08:00", "14:00"), [g("11:00:00")]).fits).toBe(false);
    expect(fit(open("07:00", "14:00"), [g("11:00:00")])).toEqual({
      fits: true,
      suggestedKickoffTime: "08:30:00",
    });
  });

  it("prefers after the programme over a gap", () => {
    expect(fit(open("09:00", "22:00"), [g("10:00:00"), g("16:00:00")])).toEqual({
      fits: true,
      suggestedKickoffTime: "18:30:00",
    });
  });

  it("uses a gap between games when after and before fail", () => {
    expect(fit(open("09:00", "18:00"), [g("10:00:00"), g("16:00:00")])).toEqual({
      fits: true,
      suggestedKickoffTime: "12:30:00",
    });
  });

  it("never fits a closed hall", () => {
    const closed: HallTimeWindow = {
      kind: "closed",
      startTime: null,
      endTime: null,
      note: "holiday",
    };
    expect(fit(closed, [])).toEqual({ fits: false, suggestedKickoffTime: null });
  });

  it("never fits a null hall time", () => {
    expect(fit(null, [])).toEqual({ fits: false, suggestedKickoffTime: null });
  });

  it("never fits an open window without times", () => {
    const bad: HallTimeWindow = { kind: "open", startTime: null, endTime: null, note: null };
    expect(fit(bad, [])).toEqual({ fits: false, suggestedKickoffTime: null });
  });

  it("does not let an existing game that overruns the hall block placement", () => {
    expect(fit(open("12:00", "18:00"), [g("11:00:00")])).toEqual({
      fits: true,
      suggestedKickoffTime: "13:30:00",
    });
  });

  it("rounds suggestions up to the quarter hour", () => {
    expect(fit(open("10:00", "20:00"), [g("10:05:00")])).toEqual({
      fits: true,
      suggestedKickoffTime: "12:45:00",
    });
  });

  it("rejects a game that would run past 23:59", () => {
    expect(fit(open("18:00", "23:59"), [g("21:00:00")])).toEqual({
      fits: false,
      suggestedKickoffTime: null,
    });
  });
});

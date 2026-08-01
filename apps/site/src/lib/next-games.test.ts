import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextGames } from "./next-games";

/**
 * Port of the legacy `server/api/games/next.get.ts` semantics (dragons-app):
 * games whose kickoff falls within the next seven club-zone days; if that
 * window is empty, the Monday–Sunday week of the next upcoming game. The
 * legacy endpoint ran on a Berlin-localtime server — these tables pin the
 * same behavior to Europe/Berlin regardless of the runtime's zone, so the
 * whole suite runs under a forced non-Berlin TZ (CLAUDE.md date rule; a
 * Berlin dev box would otherwise hide exactly the bugs under test).
 */

beforeEach(() => {
  vi.stubEnv("TZ", "America/New_York");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

interface TestGame {
  id: number;
  kickoffDate: string;
  kickoffTime: string;
}

function game(id: number, kickoffDate: string, kickoffTime = "15:00:00"): TestGame {
  return { id, kickoffDate, kickoffTime };
}

function ids(games: readonly TestGame[]): number[] {
  return games.map((g) => g.id);
}

describe("nextGames", () => {
  interface Case {
    name: string;
    now: string;
    games: TestGame[];
    expected: number[];
  }

  const cases: Case[] = [
    {
      name: "returns games within the next seven club days, both bounds inclusive",
      // 2026-08-04T22:30Z is already Wed 2026-08-05 00:30 in Berlin (CEST).
      now: "2026-08-04T22:30:00Z",
      games: [
        game(1, "2026-08-04"), // yesterday in Berlin (still 08-04 in UTC) — out
        game(2, "2026-08-05"), // today — in
        game(3, "2026-08-12"), // today + 7 — in
        game(4, "2026-08-13"), // today + 8 — out
      ],
      expected: [2, 3],
    },
    {
      name: "keeps a game earlier today even when its tip-off already passed",
      // Berlin Wed 2026-08-05 12:00; legacy compared calendar days only.
      now: "2026-08-05T10:00:00Z",
      games: [game(1, "2026-08-05", "08:00:00")],
      expected: [1],
    },
    {
      name: "sorts by kickoff date, then time, before capping at six",
      now: "2026-08-05T10:00:00Z",
      games: [
        game(1, "2026-08-09", "12:00:00"),
        game(2, "2026-08-08", "17:30:00"),
        game(3, "2026-08-08", "09:00:00"),
        game(4, "2026-08-06", "19:00:00"),
        game(5, "2026-08-10", "11:00:00"),
        game(6, "2026-08-07", "20:00:00"),
        game(7, "2026-08-11", "14:00:00"),
        game(8, "2026-08-12", "16:00:00"),
      ],
      expected: [4, 6, 3, 2, 1, 5],
    },
    {
      name: "spans the autumn DST switch without shrinking the window",
      // Berlin Sun 2026-10-25 00:30 (CEST, the night the clocks fall back).
      // Naive +7*24h arithmetic lands on 10-31 and would drop game 2.
      now: "2026-10-24T22:30:00Z",
      games: [
        game(1, "2026-10-26"),
        game(2, "2026-11-01"), // today + 7 — in
      ],
      expected: [1, 2],
    },
    {
      name: "falls back to the whole Monday-Sunday week of the next upcoming game",
      // Berlin Wed 2026-08-05; window ends 08-12; next game Wed 08-19.
      now: "2026-08-05T10:00:00Z",
      games: [
        game(1, "2026-08-01"), // past — out
        game(2, "2026-08-19"), // next upcoming (Wed)
        game(3, "2026-08-17"), // Monday of that week — in
        game(4, "2026-08-23"), // Sunday of that week — in
        game(5, "2026-08-24"), // Monday of the following week — out
      ],
      expected: [3, 2, 4],
    },
    {
      name: "treats Sunday as the end of the week, not the start",
      // Next game is Sun 2026-08-16: its week is Mon 08-10 – Sun 08-16.
      // A Sunday-starts-the-week bug would return game 2 instead.
      now: "2026-08-03T10:00:00Z", // Berlin Mon 2026-08-03
      games: [
        game(1, "2026-08-16"), // Sunday — the next upcoming game
        game(2, "2026-08-17"), // Monday after — out
      ],
      expected: [1],
    },
    {
      name: "keeps the fallback week intact across the spring DST switch",
      // Berlin Tue 2026-03-10; next game Sat 2026-03-28; DST starts Sun 03-29.
      now: "2026-03-10T11:00:00Z",
      games: [
        game(1, "2026-03-28", "20:00:00"),
        game(2, "2026-03-29", "10:00:00"), // the shortened DST Sunday — in
        game(3, "2026-03-30"), // Monday after — out
      ],
      expected: [1, 2],
    },
    {
      name: "caps the fallback week at six games",
      now: "2026-08-05T10:00:00Z",
      games: [
        game(1, "2026-08-17", "10:00:00"),
        game(2, "2026-08-17", "12:00:00"),
        game(3, "2026-08-18", "10:00:00"),
        game(4, "2026-08-19", "10:00:00"),
        game(5, "2026-08-20", "10:00:00"),
        game(6, "2026-08-21", "10:00:00"),
        game(7, "2026-08-22", "10:00:00"),
      ],
      expected: [1, 2, 3, 4, 5, 6],
    },
    {
      name: "returns nothing when no game is upcoming",
      now: "2026-08-05T10:00:00Z",
      games: [game(1, "2026-08-01"), game(2, "2025-12-24")],
      expected: [],
    },
  ];

  test.each(cases)("$name", ({ now, games, expected }) => {
    expect(ids(nextGames(games, new Date(now)))).toEqual(expected);
  });

  test("is independent of the device timezone", () => {
    const boundary = cases[0]!;
    for (const tz of ["UTC", "Pacific/Kiritimati", "Pacific/Honolulu", "Europe/Berlin"]) {
      vi.stubEnv("TZ", tz);
      expect(ids(nextGames(boundary.games, new Date(boundary.now)))).toEqual(
        boundary.expected,
      );
    }
  });

  test("defaults to the real clock and handles an empty list", () => {
    expect(nextGames([])).toEqual([]);
  });

  test("returns the caller's objects untouched", () => {
    const input = [game(1, "2026-08-06")];
    const result = nextGames(input, new Date("2026-08-05T10:00:00Z"));
    expect(result[0]).toBe(input[0]);
  });
});

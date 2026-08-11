import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from "vitest";

// --- Mocks (hoisted before imports) ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

// --- Imports (after mocks) ---

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { matches, teams } from "@dragons/db/schema";
import { todayInClubZone } from "@dragons/shared";
import { listBroadcastableMatches } from "./match-picker";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function seedOwnClubTeams(): Promise<void> {
  await ctx.db.insert(teams).values([
    {
      apiTeamPermanentId: 10,
      seasonTeamId: 10,
      teamCompetitionId: 10,
      clubId: 1,
      name: "Dragons",
      isOwnClub: true,
    },
    {
      apiTeamPermanentId: 20,
      seasonTeamId: 20,
      teamCompetitionId: 20,
      clubId: 2,
      name: "Visitors",
      isOwnClub: false,
    },
  ]);
}

describe("listBroadcastableMatches", () => {
  it("returns an empty list when the club owns no teams", async () => {
    // Not just an empty database: seed non-own-club teams and a match
    // between them, so the assertion exercises the ownership guard itself
    // rather than an incidentally-empty table.
    await ctx.db.insert(teams).values([
      {
        apiTeamPermanentId: 1,
        seasonTeamId: 1,
        teamCompetitionId: 1,
        clubId: 42,
        name: "Visitors A",
        isOwnClub: false,
      },
      {
        apiTeamPermanentId: 2,
        seasonTeamId: 2,
        teamCompetitionId: 2,
        clubId: 43,
        name: "Visitors B",
        isOwnClub: false,
      },
    ]);
    await ctx.db.insert(matches).values({
      apiMatchId: 1,
      matchNo: 1,
      matchDay: 1,
      kickoffDate: "2026-01-01",
      kickoffTime: "19:00:00",
      homeTeamApiId: 1,
      guestTeamApiId: 2,
    });

    await expect(listBroadcastableMatches({})).resolves.toEqual([]);
  });

  it("filters to today when scope is today", async () => {
    await seedOwnClubTeams();
    // Same helper the service uses: the club day, not the UTC day.
    const today = todayInClubZone();
    await ctx.db.insert(matches).values([
      {
        apiMatchId: 1,
        matchNo: 1,
        matchDay: 1,
        kickoffDate: today,
        kickoffTime: "19:00:00",
        homeTeamApiId: 10,
        guestTeamApiId: 20,
      },
      {
        apiMatchId: 2,
        matchNo: 2,
        matchDay: 2,
        kickoffDate: "2099-01-01",
        kickoffTime: "19:00:00",
        homeTeamApiId: 10,
        guestTeamApiId: 20,
      },
    ]);

    const result = await listBroadcastableMatches({ scope: "today" });
    expect(result).toHaveLength(1);
    expect(result[0]?.kickoffDate).toBe(today);
  });

  // Both instants sit in the window between club midnight and UTC midnight,
  // where the UTC calendar day is still yesterday in Berlin — the exact case a
  // late-evening scoreboard setup for the next day's fixture hits. One per
  // offset so a CET-only or CEST-only fix does not pass.
  it.each([
    { label: "CEST (+02:00)", now: "2026-04-25T22:30:00Z", clubDay: "2026-04-26" },
    { label: "CET (+01:00)", now: "2026-01-15T23:30:00Z", clubDay: "2026-01-16" },
  ])(
    "scope=today follows the club day, not the UTC day, at $label midnight",
    async ({ now, clubDay }) => {
      // Date only: the PGlite driver needs the real timer queue to resolve.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(now));
      const utcDay = new Date(now).toISOString().slice(0, 10);
      // Guards the fixture itself: if these ever agree the test proves nothing.
      expect(utcDay).not.toBe(clubDay);

      await seedOwnClubTeams();
      await ctx.db.insert(matches).values([
        {
          apiMatchId: 1,
          matchNo: 1,
          matchDay: 1,
          kickoffDate: clubDay,
          kickoffTime: "19:00:00",
          homeTeamApiId: 10,
          guestTeamApiId: 20,
        },
        {
          apiMatchId: 2,
          matchNo: 2,
          matchDay: 2,
          kickoffDate: utcDay,
          kickoffTime: "19:00:00",
          homeTeamApiId: 10,
          guestTeamApiId: 20,
        },
      ]);

      const result = await listBroadcastableMatches({ scope: "today" });
      expect(result.map((m) => m.kickoffDate)).toEqual([clubDay]);
    },
  );

  it("escapes LIKE metacharacters in the text filter", async () => {
    await ctx.db.insert(teams).values([
      {
        apiTeamPermanentId: 1,
        seasonTeamId: 1,
        teamCompetitionId: 1,
        clubId: 1,
        name: "Dragons",
        isOwnClub: true,
      },
      {
        apiTeamPermanentId: 2,
        seasonTeamId: 2,
        teamCompetitionId: 2,
        clubId: 2,
        name: "100% Basket",
        isOwnClub: false,
      },
    ]);
    await ctx.db.insert(matches).values({
      apiMatchId: 1,
      matchNo: 1,
      matchDay: 1,
      kickoffDate: "2026-01-01",
      kickoffTime: "19:00:00",
      homeTeamApiId: 1,
      guestTeamApiId: 2,
    });

    // "100%" as a literal substring is present in "100% Basket".
    const hit = await listBroadcastableMatches({ q: "100%" });
    expect(hit).toHaveLength(1);

    // "1%B" is not a literal substring of "100% Basket" (there's "0", "0",
    // "%", " " between "1" and "B"). If "%" were left unescaped, "1%B" would
    // read as the wildcard "1" + anything + "B", which "100% Basket" *does*
    // satisfy — so this only stays empty when escaping actually happens.
    const miss = await listBroadcastableMatches({ q: "1%B" });
    expect(miss).toEqual([]);
  });
});

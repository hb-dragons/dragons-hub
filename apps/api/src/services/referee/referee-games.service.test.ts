import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked (issue #110).
// This file used to stub `eq`/`and`/`or` with identity functions and assert on a
// JSON.stringify of the resulting fake predicate tree. That form of assertion
// cannot see whether a predicate is *correct*: inverting the home/away filter
// from `eq(isHomeGame, true)` to `eq(isHomeGame, false)` left all 29 tests green.
// Everything below runs the real query against a real (in-process PGlite)
// Postgres and asserts which rows actually come back.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

// --- Imports (after mocks) ---

import {
  getRefereeGames,
  getRefereeGameById,
  computeMySlot,
} from "./referee-games.service";
import { refereeGames, matches, teams } from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

type GameSeed = Partial<typeof refereeGames.$inferInsert> & { apiMatchId: number };

async function seedGame(seed: GameSeed): Promise<number> {
  const [row] = await ctx.db
    .insert(refereeGames)
    .values({
      matchNo: seed.apiMatchId,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
      homeTeamName: "Dragons 1",
      guestTeamName: "Titans 1",
      leagueName: "Kreisliga Nord",
      leagueShort: "KLN",
      venueName: "Sporthalle West",
      venueCity: "Berlin",
      sr1OurClub: true,
      sr2OurClub: false,
      sr1Status: "open",
      sr2Status: "offered",
      isHomeGame: true,
      isGuestGame: false,
      ...seed,
    })
    .returning({ id: refereeGames.id });
  return row!.id;
}

/** Seed a real `matches` row (plus its FK dependencies) and return its id. */
async function seedMatch(apiMatchId: number): Promise<number> {
  for (const apiTeamPermanentId of [7001, 7002]) {
    await ctx.db.insert(teams).values({
      apiTeamPermanentId,
      seasonTeamId: apiTeamPermanentId,
      teamCompetitionId: apiTeamPermanentId,
      name: `Team ${apiTeamPermanentId}`,
      clubId: 1,
    });
  }
  const [row] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId,
      matchNo: apiMatchId,
      matchDay: 1,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
      homeTeamApiId: 7001,
      guestTeamApiId: 7002,
    })
    .returning({ id: matches.id });
  return row!.id;
}

/** Federation match ids of the returned page, in result order. */
function apiIds(result: { items: Array<{ apiMatchId: number }> }): number[] {
  return result.items.map((i) => i.apiMatchId);
}

const PAGE = { limit: 50, offset: 0 } as const;

// --- Tests ---

describe("getRefereeGames", () => {
  it("returns an empty page when the table is empty", async () => {
    const result = await getRefereeGames({ limit: 20, offset: 0 });

    expect(result).toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
  });

  it("paginates: limit caps the page, total counts the whole filtered set", async () => {
    for (const id of [1, 2, 3, 4, 5]) {
      await seedGame({ apiMatchId: id, kickoffTime: `1${id}:00:00` });
    }

    const first = await getRefereeGames({ limit: 2, offset: 0 });
    expect(apiIds(first)).toEqual([1, 2]);
    expect(first.total).toBe(5);
    expect(first.hasMore).toBe(true);

    const last = await getRefereeGames({ limit: 2, offset: 4 });
    expect(apiIds(last)).toEqual([5]);
    expect(last.total).toBe(5);
    expect(last.hasMore).toBe(false);
  });

  it("orders by kickoff date then kickoff time", async () => {
    await seedGame({ apiMatchId: 1, kickoffDate: "2026-05-02", kickoffTime: "09:00:00" });
    await seedGame({ apiMatchId: 2, kickoffDate: "2026-05-01", kickoffTime: "20:00:00" });
    await seedGame({ apiMatchId: 3, kickoffDate: "2026-05-01", kickoffTime: "09:00:00" });

    const result = await getRefereeGames(PAGE);

    expect(apiIds(result)).toEqual([3, 2, 1]);
  });

  it("never returns tombstoned (withdrawn) games (#105)", async () => {
    await seedGame({ apiMatchId: 1 });
    await seedGame({ apiMatchId: 2, removedAt: new Date("2026-04-01T00:00:00Z") });

    const result = await getRefereeGames({ ...PAGE, status: "all" });

    expect(apiIds(result)).toEqual([1]);
    expect(result.total).toBe(1);
  });
});

describe("getRefereeGames — status filter", () => {
  beforeEach(async () => {
    await seedGame({ apiMatchId: 1 });
    await seedGame({ apiMatchId: 2, isCancelled: true });
    await seedGame({ apiMatchId: 3, isForfeited: true });
  });

  it("defaults to active: excludes cancelled AND forfeited", async () => {
    const result = await getRefereeGames(PAGE);
    expect(apiIds(result)).toEqual([1]);
  });

  it("status 'active' excludes cancelled AND forfeited", async () => {
    const result = await getRefereeGames({ ...PAGE, status: "active" });
    expect(apiIds(result)).toEqual([1]);
  });

  it("status 'cancelled' returns only cancelled games", async () => {
    const result = await getRefereeGames({ ...PAGE, status: "cancelled" });
    expect(apiIds(result)).toEqual([2]);
  });

  it("status 'forfeited' returns only forfeited games", async () => {
    const result = await getRefereeGames({ ...PAGE, status: "forfeited" });
    expect(apiIds(result)).toEqual([3]);
  });

  it("status 'all' returns every game", async () => {
    const result = await getRefereeGames({ ...PAGE, status: "all" });
    expect(apiIds(result).sort()).toEqual([1, 2, 3]);
  });
});

describe("getRefereeGames — league filter", () => {
  beforeEach(async () => {
    await seedGame({ apiMatchId: 1, leagueApiId: 101 });
    await seedGame({ apiMatchId: 2, leagueApiId: 202 });
    await seedGame({ apiMatchId: 3, leagueApiId: 303 });
  });

  it("a single league id matches only that league", async () => {
    const result = await getRefereeGames({ ...PAGE, league: ["101"] });
    expect(apiIds(result)).toEqual([1]);
  });

  it("multiple league ids match exactly that set (inArray)", async () => {
    const result = await getRefereeGames({ ...PAGE, league: ["101", "202"] });
    expect(apiIds(result).sort()).toEqual([1, 2]);
  });

  it("drops non-numeric league ids and applies the remaining one", async () => {
    const result = await getRefereeGames({ ...PAGE, league: ["101", "not-a-number"] });
    expect(apiIds(result)).toEqual([1]);
  });

  it("an all-non-numeric league list applies no league filter", async () => {
    const result = await getRefereeGames({ ...PAGE, league: ["abc"] });
    expect(apiIds(result).sort()).toEqual([1, 2, 3]);
  });

  it("an empty league list applies no league filter", async () => {
    const result = await getRefereeGames({ ...PAGE, league: [] });
    expect(apiIds(result).sort()).toEqual([1, 2, 3]);
  });
});

describe("getRefereeGames — gameType filter", () => {
  beforeEach(async () => {
    await seedGame({ apiMatchId: 1, isHomeGame: true, isGuestGame: false });
    await seedGame({ apiMatchId: 2, isHomeGame: false, isGuestGame: true });
    await seedGame({ apiMatchId: 3, isHomeGame: false, isGuestGame: false });
  });

  // Issue #110's proof case: inverting `eq(refereeGames.isHomeGame, true)` to
  // `false` is a user-visible bug that the previous JSON.stringify assertion
  // could not see. This test fails on that mutation.
  it("gameType 'home' returns home games and excludes away/neutral ones", async () => {
    const result = await getRefereeGames({ ...PAGE, gameType: "home" });

    expect(apiIds(result)).toEqual([1]);
    expect(result.total).toBe(1);
    expect(result.items[0]?.isHomeGame).toBe(true);
  });

  it("gameType 'away' returns guest games and excludes home/neutral ones", async () => {
    const result = await getRefereeGames({ ...PAGE, gameType: "away" });

    expect(apiIds(result)).toEqual([2]);
    expect(result.items[0]?.isGuestGame).toBe(true);
  });

  it("gameType 'both' applies no home/away filter", async () => {
    const result = await getRefereeGames({ ...PAGE, gameType: "both" });
    expect(apiIds(result).sort()).toEqual([1, 2, 3]);
  });

  it("no gameType applies no home/away filter", async () => {
    const result = await getRefereeGames(PAGE);
    expect(apiIds(result).sort()).toEqual([1, 2, 3]);
  });
});

describe("getRefereeGames — date range filter", () => {
  beforeEach(async () => {
    await seedGame({ apiMatchId: 1, kickoffDate: "2026-03-31" });
    await seedGame({ apiMatchId: 2, kickoffDate: "2026-04-01" });
    await seedGame({ apiMatchId: 3, kickoffDate: "2026-05-01" });
    await seedGame({ apiMatchId: 4, kickoffDate: "2026-05-02" });
  });

  it("dateFrom is inclusive and excludes earlier games", async () => {
    const result = await getRefereeGames({ ...PAGE, dateFrom: "2026-04-01" });
    expect(apiIds(result)).toEqual([2, 3, 4]);
  });

  it("dateTo is inclusive and excludes later games", async () => {
    const result = await getRefereeGames({ ...PAGE, dateTo: "2026-05-01" });
    expect(apiIds(result)).toEqual([1, 2, 3]);
  });

  it("dateFrom and dateTo combine as a closed range", async () => {
    const result = await getRefereeGames({
      ...PAGE,
      dateFrom: "2026-04-01",
      dateTo: "2026-05-01",
    });
    expect(apiIds(result)).toEqual([2, 3]);
  });
});

describe("getRefereeGames — search filter", () => {
  beforeEach(async () => {
    await seedGame({
      apiMatchId: 1,
      homeTeamName: "Dragons U16",
      guestTeamName: "Titans 1",
      leagueName: "Kreisliga Nord",
    });
    await seedGame({
      apiMatchId: 2,
      homeTeamName: "Falcons 2",
      guestTeamName: "Dragons U18",
      leagueName: "Bezirksliga",
    });
    await seedGame({
      apiMatchId: 3,
      homeTeamName: "Falcons 3",
      guestTeamName: "Titans 2",
      leagueName: "Dragons Cup",
    });
    await seedGame({
      apiMatchId: 4,
      homeTeamName: "Falcons 4",
      guestTeamName: "Titans 3",
      leagueName: "Bezirksliga",
    });
  });

  it("matches home team, guest team or league name", async () => {
    const result = await getRefereeGames({ ...PAGE, search: "Dragons" });
    expect(apiIds(result).sort()).toEqual([1, 2, 3]);
  });

  it("is case-insensitive (ilike, not like)", async () => {
    const result = await getRefereeGames({ ...PAGE, search: "dRaGoNs" });
    expect(apiIds(result).sort()).toEqual([1, 2, 3]);
  });

  it("matches on a substring, not just a prefix", async () => {
    const result = await getRefereeGames({ ...PAGE, search: "ragon" });
    expect(apiIds(result).sort()).toEqual([1, 2, 3]);
  });

  it("requires every word of a multi-word search to match (AND across words)", async () => {
    // "Dragons" matches 1, 2 and 3; "Kreisliga" only matches 1.
    const result = await getRefereeGames({ ...PAGE, search: "Dragons Kreisliga" });
    expect(apiIds(result)).toEqual([1]);
  });

  it("returns nothing when a word matches no column", async () => {
    const result = await getRefereeGames({ ...PAGE, search: "Dragons Handball" });
    expect(apiIds(result)).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("ignores repeated whitespace between words", async () => {
    const result = await getRefereeGames({ ...PAGE, search: "  Dragons   Kreisliga  " });
    expect(apiIds(result)).toEqual([1]);
  });
});

describe("getRefereeGames — assignedRefereeApiId filter", () => {
  beforeEach(async () => {
    await seedGame({ apiMatchId: 1, sr1RefereeApiId: 9001, sr1Status: "assigned" });
    await seedGame({ apiMatchId: 2, sr2RefereeApiId: 9001, sr2Status: "assigned" });
    await seedGame({ apiMatchId: 3, sr1RefereeApiId: 5555, sr2RefereeApiId: 6666 });
    await seedGame({ apiMatchId: 4 });
  });

  it("matches the referee on either slot and excludes everyone else", async () => {
    const result = await getRefereeGames({ ...PAGE, assignedRefereeApiId: 9001 });
    expect(apiIds(result).sort()).toEqual([1, 2]);
  });

  it("returns nothing for a referee assigned to no game", async () => {
    const result = await getRefereeGames({ ...PAGE, assignedRefereeApiId: 4242 });
    expect(apiIds(result)).toEqual([]);
  });
});

describe("getRefereeGames — slotStatus filter", () => {
  beforeEach(async () => {
    await seedGame({ apiMatchId: 1, sr1Status: "open", sr2Status: "assigned" });
    await seedGame({ apiMatchId: 2, sr1Status: "assigned", sr2Status: "open" });
    await seedGame({ apiMatchId: 3, sr1Status: "offered", sr2Status: "assigned" });
    await seedGame({ apiMatchId: 4, sr1Status: "assigned", sr2Status: "offered" });
    await seedGame({ apiMatchId: 5, sr1Status: "assigned", sr2Status: "assigned" });
  });

  it("slotStatus 'open' keeps games with an open slot on either side", async () => {
    const result = await getRefereeGames({ ...PAGE, slotStatus: "open" });
    expect(apiIds(result).sort()).toEqual([1, 2]);
  });

  it("slotStatus 'offered' keeps open OR offered slots on either side", async () => {
    const result = await getRefereeGames({ ...PAGE, slotStatus: "offered" });
    expect(apiIds(result).sort()).toEqual([1, 2, 3, 4]);
  });

  it("slotStatus 'any' applies no slot filter", async () => {
    const result = await getRefereeGames({ ...PAGE, slotStatus: "any" });
    expect(apiIds(result).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("no slotStatus applies no slot filter", async () => {
    const result = await getRefereeGames(PAGE);
    expect(apiIds(result).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("getRefereeGames — filters combine with AND", () => {
  it("a row satisfying only one of two filters is excluded", async () => {
    // Home + Kreisliga
    await seedGame({ apiMatchId: 1, isHomeGame: true, leagueApiId: 101 });
    // Home but wrong league
    await seedGame({ apiMatchId: 2, isHomeGame: true, leagueApiId: 202 });
    // Right league but away
    await seedGame({
      apiMatchId: 3,
      isHomeGame: false,
      isGuestGame: true,
      leagueApiId: 101,
    });

    const result = await getRefereeGames({
      ...PAGE,
      gameType: "home",
      league: ["101"],
    });

    // Swapping the top-level and(...) for or(...) would return all three.
    expect(apiIds(result)).toEqual([1]);
    expect(result.total).toBe(1);
  });

  it("the count query applies the same filters as the item query", async () => {
    for (const id of [1, 2, 3]) {
      await seedGame({ apiMatchId: id, isHomeGame: true, isGuestGame: false });
    }
    for (const id of [4, 5]) {
      await seedGame({ apiMatchId: id, isHomeGame: false, isGuestGame: true });
    }

    const result = await getRefereeGames({ limit: 1, offset: 0, gameType: "home" });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(true);
  });
});

describe("getRefereeGames — projected row shape", () => {
  it("derives isTrackedLeague from whether a match is linked", async () => {
    const matchId = await seedMatch(555);
    await seedGame({ apiMatchId: 1, matchId });
    await seedGame({ apiMatchId: 2, matchId: null });

    const result = await getRefereeGames(PAGE);
    const byApiId = new Map(result.items.map((i) => [i.apiMatchId, i]));

    expect(byApiId.get(1)?.isTrackedLeague).toBe(true);
    expect(byApiId.get(1)?.matchId).toBe(matchId);
    expect(byApiId.get(2)?.isTrackedLeague).toBe(false);
    expect(byApiId.get(2)?.matchId).toBeNull();
  });

  it("returns every RefereeGameListItem field, decorated with mySlot/claimableSlots", async () => {
    await seedGame({
      apiMatchId: 4711,
      matchNo: 42,
      lastSyncedAt: new Date("2026-04-14T10:00:00Z"),
    });

    const result = await getRefereeGames(PAGE);
    const item = result.items[0]!;

    expect(item).toMatchObject({
      apiMatchId: 4711,
      matchNo: 42,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
      homeTeamName: "Dragons 1",
      guestTeamName: "Titans 1",
      leagueName: "Kreisliga Nord",
      leagueShort: "KLN",
      venueName: "Sporthalle West",
      venueCity: "Berlin",
      sr1OurClub: true,
      sr2OurClub: false,
      sr1Status: "open",
      sr2Status: "offered",
      isCancelled: false,
      isForfeited: false,
      isTrackedLeague: false,
      isHomeGame: true,
      isGuestGame: false,
      mySlot: null,
      claimableSlots: [],
    });
    expect(item.lastSyncedAt).toBe("2026-04-14T10:00:00.000Z");
  });

  // Regression (issue #153). `last_synced_at` is a timestamp column, so drizzle
  // hands back a `Date`, but `RefereeGameListItem` — the type web and native
  // read the response through — declares `string | null`. The list builders
  // asserted `as RefereeGameListItem`, so the compiler never saw the
  // disagreement and every reader got a `Date` where the type promised a
  // string. Assert the runtime type, not just a value that `toEqual` would
  // accept from either shape.
  it("emits lastSyncedAt as an ISO string, not a Date", async () => {
    await seedGame({ apiMatchId: 5150, lastSyncedAt: new Date("2026-04-14T10:00:00Z") });

    const fromList = (await getRefereeGames(PAGE)).items[0]!;
    expect(typeof fromList.lastSyncedAt).toBe("string");
    expect(fromList.lastSyncedAt).toBe("2026-04-14T10:00:00.000Z");

    const byId = await getRefereeGameById(fromList.id);
    expect(typeof byId?.lastSyncedAt).toBe("string");
    expect(byId?.lastSyncedAt).toBe("2026-04-14T10:00:00.000Z");
  });

  it("keeps a null lastSyncedAt null rather than coercing it", async () => {
    await seedGame({ apiMatchId: 5151, lastSyncedAt: null });

    const item = (await getRefereeGames(PAGE)).items[0]!;
    expect(item.lastSyncedAt).toBeNull();
  });
});

describe("computeMySlot", () => {
  it("returns null when refereeApiId is null", () => {
    expect(
      computeMySlot({ sr1RefereeApiId: 100, sr2RefereeApiId: 200 }, null),
    ).toBeNull();
  });

  it("returns 1 when refereeApiId matches sr1", () => {
    expect(
      computeMySlot({ sr1RefereeApiId: 100, sr2RefereeApiId: null }, 100),
    ).toBe(1);
  });

  it("returns 2 when refereeApiId matches sr2", () => {
    expect(
      computeMySlot({ sr1RefereeApiId: null, sr2RefereeApiId: 200 }, 200),
    ).toBe(2);
  });

  it("returns null when refereeApiId does not match either slot", () => {
    expect(
      computeMySlot({ sr1RefereeApiId: 100, sr2RefereeApiId: 200 }, 300),
    ).toBeNull();
  });
});

describe("getRefereeGameById", () => {
  it("returns the row when found", async () => {
    const id = await seedGame({ apiMatchId: 4711 });

    const result = await getRefereeGameById(id);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(id);
    expect(result?.apiMatchId).toBe(4711);
    expect(result?.mySlot).toBeNull();
    expect(result?.claimableSlots).toEqual([]);
  });

  it("selects by id, not simply the first row", async () => {
    await seedGame({ apiMatchId: 1 });
    const wanted = await seedGame({ apiMatchId: 2 });
    await seedGame({ apiMatchId: 3 });

    const result = await getRefereeGameById(wanted);

    expect(result?.apiMatchId).toBe(2);
  });

  it("returns null when no row matches", async () => {
    await seedGame({ apiMatchId: 1 });

    expect(await getRefereeGameById(9999)).toBeNull();
  });

  it("returns null for a tombstoned game (#105)", async () => {
    const id = await seedGame({
      apiMatchId: 1,
      removedAt: new Date("2026-04-01T00:00:00Z"),
    });

    expect(await getRefereeGameById(id)).toBeNull();
  });
});

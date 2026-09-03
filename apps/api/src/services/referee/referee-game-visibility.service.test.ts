import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked (issue #110).
// Visibility here IS the WHERE clause — which home games a referee may see, which
// away games, which slots an allowlist rule opens up. The previous version of this
// file stubbed `eq`/`and`/`or`/`not` with identity functions and fed the service
// pre-canned rows, so every "hides X" test passed by handing back an empty array
// the service never filtered. Everything below runs the real predicate tree
// against a real (in-process PGlite) Postgres and asserts which rows survive it.

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
  getVisibleRefereeGames,
  getVisibleRefereeGameById,
  getVisibleRefereeGameByMatchId,
  getVisibleRefereeGameByApiMatchId,
} from "./referee-game-visibility.service";
import {
  refereeGames,
  referees,
  refereeAssignmentRules,
  teams,
  matches,
  seasons,
  teamEntries,
  teamStaff,
} from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { invalidateActiveSeasonCache } from "../admin/season.service";
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
  // getActiveSeasonId() caches for 60s; each test starts with a clean DB.
  invalidateActiveSeasonCache();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

const REF_API_ID = 9001;

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
      sr1OurClub: true,
      sr2OurClub: true,
      sr1Status: "open",
      sr2Status: "open",
      isHomeGame: true,
      isGuestGame: false,
      ...seed,
    })
    .returning({ id: refereeGames.id });
  return row!.id;
}

async function seedTeam(apiTeamPermanentId: number): Promise<number> {
  const [row] = await ctx.db
    .insert(teams)
    .values({
      apiTeamPermanentId,
      seasonTeamId: apiTeamPermanentId,
      teamCompetitionId: apiTeamPermanentId,
      name: `Team ${apiTeamPermanentId}`,
      clubId: 1,
    })
    .returning({ id: teams.id });
  return row!.id;
}

async function seedMatch(apiMatchId: number, homeTeamApiId: number, guestTeamApiId: number) {
  const [row] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId,
      matchNo: apiMatchId,
      matchDay: 1,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
      homeTeamApiId,
      guestTeamApiId,
    })
    .returning({ id: matches.id });
  return row!.id;
}

async function seedReferee(opts: {
  allowAllHomeGames: boolean;
  allowAwayGames: boolean;
  isOwnClub: boolean;
  apiId?: number;
}): Promise<number> {
  const [row] = await ctx.db
    .insert(referees)
    .values({
      apiId: opts.apiId ?? REF_API_ID,
      firstName: "Max",
      lastName: "Muster",
      allowAllHomeGames: opts.allowAllHomeGames,
      allowAwayGames: opts.allowAwayGames,
      isOwnClub: opts.isOwnClub,
    })
    .returning({ id: referees.id });
  return row!.id;
}

async function seedRule(
  refereeId: number,
  teamId: number,
  rule: { deny?: boolean; allowSr1?: boolean; allowSr2?: boolean },
): Promise<void> {
  await ctx.db.insert(refereeAssignmentRules).values({
    refereeId,
    teamId,
    deny: rule.deny ?? false,
    allowSr1: rule.allowSr1 ?? false,
    allowSr2: rule.allowSr2 ?? false,
  });
}

function apiIds(result: { items: Array<{ apiMatchId: number }> }): number[] {
  return result.items.map((i) => i.apiMatchId).sort((a, b) => a - b);
}

const PAGE = { limit: 50, offset: 0 } as const;

// `referees.apiId` is NOT NULL in the schema, so a referee with "no federation
// apiId" cannot be seeded; the null-apiId branches of the service are dead code
// against the real table. See the note in the report.

// ---------------------------------------------------------------------------
// Referee mode
// ---------------------------------------------------------------------------

describe("getVisibleRefereeGames — referee gating", () => {
  it("returns empty when the referee does not exist", async () => {
    await seedGame({ apiMatchId: 1 });

    const result = await getVisibleRefereeGames(999, PAGE);

    expect(result).toEqual({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      hasMore: false,
    });
  });

  it("returns empty when the referee is not own-club, even for a fully open game", async () => {
    await seedGame({ apiMatchId: 1 });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: false,
    });

    const result = await getVisibleRefereeGames(refId, PAGE);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("getVisibleRefereeGames — open our-club slot base filter", () => {
  let refId: number;

  beforeEach(async () => {
    refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: true,
    });
  });

  it("shows a game whose sr1 slot is ours and open", async () => {
    await seedGame({ apiMatchId: 1, sr1OurClub: true, sr1Status: "open", sr2OurClub: false, sr2Status: "assigned" });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([1]);
  });

  it("shows a game whose sr2 slot is ours and open", async () => {
    await seedGame({ apiMatchId: 2, sr1OurClub: false, sr1Status: "assigned", sr2OurClub: true, sr2Status: "open" });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([2]);
  });

  it("hides a game whose only open slot belongs to the other club", async () => {
    await seedGame({
      apiMatchId: 3,
      sr1OurClub: false,
      sr1Status: "open",
      sr2OurClub: false,
      sr2Status: "open",
    });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([]);
  });

  it("hides a game where both our-club slots are already taken", async () => {
    await seedGame({
      apiMatchId: 4,
      sr1Status: "assigned",
      sr2Status: "assigned",
    });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([]);
  });

  it("hides an offered — not open — our-club slot", async () => {
    await seedGame({ apiMatchId: 5, sr1Status: "offered", sr2Status: "offered" });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([]);
  });

  it("never returns a tombstoned game (#105)", async () => {
    await seedGame({ apiMatchId: 6 });
    await seedGame({ apiMatchId: 7, removedAt: new Date("2026-04-01T00:00:00Z") });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([6]);
  });
});

describe("getVisibleRefereeGames — allowAllHomeGames", () => {
  it("shows all home games and hides away games when allowAwayGames is false", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });
    await seedGame({ apiMatchId: 1, isHomeGame: true });
    await seedGame({ apiMatchId: 2, isHomeGame: false, isGuestGame: true });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([1]);
  });

  it("hides a home game whose home team carries a deny rule", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const deniedTeam = await seedTeam(101);
    const otherTeam = await seedTeam(102);
    await seedRule(refId, deniedTeam, { deny: true });

    await seedGame({ apiMatchId: 1, homeTeamId: deniedTeam });
    await seedGame({ apiMatchId: 2, homeTeamId: otherTeam });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([2]);
  });

  it("still shows a home game with a null homeTeamId when a deny rule exists", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const deniedTeam = await seedTeam(101);
    await seedRule(refId, deniedTeam, { deny: true });

    await seedGame({ apiMatchId: 1, homeTeamId: deniedTeam });
    await seedGame({ apiMatchId: 2, homeTeamId: null });

    // NOT IN (…) is null-propagating, hence the explicit isNull(homeTeamId) arm.
    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([2]);
  });

  it("a deny rule for one team does not hide another team's home games", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const denied = await seedTeam(101);
    const allowed = await seedTeam(102);
    await seedRule(refId, denied, { deny: true });

    await seedGame({ apiMatchId: 1, homeTeamId: denied });
    await seedGame({ apiMatchId: 2, homeTeamId: allowed });
    await seedGame({ apiMatchId: 3, homeTeamId: null });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([2, 3]);
  });

  it("an allow (non-deny) rule does not restrict allowAllHomeGames", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const teamA = await seedTeam(101);
    const teamB = await seedTeam(102);
    await seedRule(refId, teamA, { allowSr1: true });

    await seedGame({ apiMatchId: 1, homeTeamId: teamA });
    await seedGame({ apiMatchId: 2, homeTeamId: teamB });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([1, 2]);
  });
});

describe("getVisibleRefereeGames — allowlist mode (allowAllHomeGames = false)", () => {
  it("shows only home games of allowlisted teams", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const allowed = await seedTeam(101);
    const other = await seedTeam(102);
    await seedRule(refId, allowed, { allowSr1: true, allowSr2: true });

    await seedGame({ apiMatchId: 1, homeTeamId: allowed });
    await seedGame({ apiMatchId: 2, homeTeamId: other });
    await seedGame({ apiMatchId: 3, homeTeamId: null });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([1]);
  });

  it("hides a game when the open slot is not the slot the rule allows", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const allowed = await seedTeam(101);
    await seedRule(refId, allowed, { allowSr1: true, allowSr2: false });

    // Only sr2 is open, but the rule only allows sr1.
    await seedGame({
      apiMatchId: 1,
      homeTeamId: allowed,
      sr1Status: "assigned",
      sr2Status: "open",
    });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([]);
  });

  it("shows a game when the allowed slot is the open one", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const allowed = await seedTeam(101);
    await seedRule(refId, allowed, { allowSr1: true, allowSr2: false });

    await seedGame({
      apiMatchId: 1,
      homeTeamId: allowed,
      sr1Status: "open",
      sr2Status: "assigned",
    });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([1]);
  });

  it("a rule allowing both slots matches when only one of them is open", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const allowed = await seedTeam(101);
    await seedRule(refId, allowed, { allowSr1: true, allowSr2: true });

    // Only sr1 open — the two slot arms must be OR-ed, not AND-ed.
    await seedGame({
      apiMatchId: 1,
      homeTeamId: allowed,
      sr1Status: "open",
      sr2Status: "assigned",
    });
    // Only sr2 open.
    await seedGame({
      apiMatchId: 2,
      homeTeamId: allowed,
      sr1Status: "assigned",
      sr2Status: "open",
    });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([1, 2]);
  });

  it("requires the allowed slot to also be an our-club slot", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const allowed = await seedTeam(101);
    await seedRule(refId, allowed, { allowSr1: true });

    await seedGame({
      apiMatchId: 1,
      homeTeamId: allowed,
      sr1OurClub: false,
      sr1Status: "open",
      sr2OurClub: false,
      sr2Status: "assigned",
    });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([]);
  });

  it("a rule allowing neither slot hides that team's games", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: true,
      isOwnClub: true,
    });
    const team = await seedTeam(101);
    await seedRule(refId, team, { allowSr1: false, allowSr2: false });

    await seedGame({ apiMatchId: 1, homeTeamId: team });
    await seedGame({ apiMatchId: 2, isHomeGame: false, isGuestGame: true });

    // Away visibility still applies; the home game is hidden.
    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([2]);
  });

  it("combines multiple allow rules with OR, each keeping its own slot restriction", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const teamA = await seedTeam(101);
    const teamB = await seedTeam(102);
    await seedRule(refId, teamA, { allowSr1: true, allowSr2: false });
    await seedRule(refId, teamB, { allowSr1: false, allowSr2: true });

    // A: sr1 open → visible via rule A
    await seedGame({ apiMatchId: 1, homeTeamId: teamA, sr1Status: "open", sr2Status: "assigned" });
    // B: sr2 open → visible via rule B
    await seedGame({ apiMatchId: 2, homeTeamId: teamB, sr1Status: "assigned", sr2Status: "open" });
    // A but only sr2 open → rule A does not allow sr2, and rule B is for team B
    await seedGame({ apiMatchId: 3, homeTeamId: teamA, sr1Status: "assigned", sr2Status: "open" });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([1, 2]);
  });

  it("a deny rule is not treated as an allowlist entry", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const team = await seedTeam(101);
    await seedRule(refId, team, { deny: true, allowSr1: true, allowSr2: true });

    await seedGame({ apiMatchId: 1, homeTeamId: team });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([]);
  });

  it("another referee's rules do not grant visibility", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const otherRefId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
      apiId: 7777,
    });
    const team = await seedTeam(101);
    await seedRule(otherRefId, team, { allowSr1: true, allowSr2: true });

    await seedGame({ apiMatchId: 1, homeTeamId: team });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([]);
  });
});

describe("getVisibleRefereeGames — away visibility", () => {
  it("allowAwayGames shows non-home games and hides nothing else", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: true,
      isOwnClub: true,
    });
    await seedGame({ apiMatchId: 1, isHomeGame: false, isGuestGame: true });
    await seedGame({ apiMatchId: 2, isHomeGame: true });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([1]);
  });

  it("allowAwayGames=false hides away games", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });
    await seedGame({ apiMatchId: 1, isHomeGame: false, isGuestGame: true });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([]);
  });

  it("home and away visibility combine (OR), not intersect", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: true,
    });
    await seedGame({ apiMatchId: 1, isHomeGame: true });
    await seedGame({ apiMatchId: 2, isHomeGame: false, isGuestGame: true });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([1, 2]);
  });
});

describe("getVisibleRefereeGames — assigned-to-me bypass", () => {
  it("shows a game the referee holds even when no visibility rule matches", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
    });
    // No open our-club slot, not a home game, no rules — only the assignment matches.
    await seedGame({
      apiMatchId: 1,
      isHomeGame: false,
      isGuestGame: false,
      sr1RefereeApiId: REF_API_ID,
      sr1Status: "assigned",
      sr2Status: "assigned",
    });
    await seedGame({
      apiMatchId: 2,
      isHomeGame: false,
      isGuestGame: false,
      sr1RefereeApiId: 5555,
      sr1Status: "assigned",
      sr2Status: "assigned",
    });

    const result = await getVisibleRefereeGames(refId, PAGE);

    expect(apiIds(result)).toEqual([1]);
    expect(result.items[0]?.mySlot).toBe(1);
  });

  it("matches the bypass on slot 2 as well", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
    });
    await seedGame({
      apiMatchId: 1,
      isHomeGame: false,
      sr1Status: "assigned",
      sr2RefereeApiId: REF_API_ID,
      sr2Status: "assigned",
    });

    const result = await getVisibleRefereeGames(refId, PAGE);

    expect(apiIds(result)).toEqual([1]);
    expect(result.items[0]?.mySlot).toBe(2);
  });
});

describe("getVisibleRefereeGames — decoration", () => {
  it("sets mySlot only for the games this referee holds", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });
    await seedGame({ apiMatchId: 1, sr1RefereeApiId: REF_API_ID, sr1Status: "assigned" });
    await seedGame({ apiMatchId: 2, sr1RefereeApiId: 1234 });

    const result = await getVisibleRefereeGames(refId, PAGE);
    const byApiId = new Map(result.items.map((i) => [i.apiMatchId, i]));

    expect(byApiId.get(1)?.mySlot).toBe(1);
    expect(byApiId.get(2)?.mySlot).toBeNull();
  });

  it("derives claimableSlots from the row the DB actually returned", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });
    await seedGame({ apiMatchId: 1, sr1Status: "open", sr2Status: "open" });
    await seedGame({ apiMatchId: 2, sr1Status: "open", sr2OurClub: false, sr2Status: "open" });

    const result = await getVisibleRefereeGames(refId, PAGE);
    const byApiId = new Map(result.items.map((i) => [i.apiMatchId, i]));

    expect(byApiId.get(1)?.claimableSlots).toEqual([1, 2]);
    expect(byApiId.get(2)?.claimableSlots).toEqual([1]);
  });

  it("reports claimableSlots [] for a game visible only through the assignment bypass", async () => {
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });
    await seedGame({
      apiMatchId: 1,
      sr1RefereeApiId: REF_API_ID,
      sr1Status: "assigned",
      sr2Status: "assigned",
    });

    const result = await getVisibleRefereeGames(refId, PAGE);

    expect(result.items[0]?.claimableSlots).toEqual([]);
  });
});

describe("getVisibleRefereeGames — standard filters stack on top of visibility", () => {
  let refId: number;

  beforeEach(async () => {
    refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: true,
    });
  });

  it("excludes cancelled and forfeited games by default", async () => {
    await seedGame({ apiMatchId: 1 });
    await seedGame({ apiMatchId: 2, isCancelled: true });
    await seedGame({ apiMatchId: 3, isForfeited: true });

    expect(apiIds(await getVisibleRefereeGames(refId, PAGE))).toEqual([1]);
  });

  it("status 'cancelled' narrows to cancelled games only", async () => {
    await seedGame({ apiMatchId: 1 });
    await seedGame({ apiMatchId: 2, isCancelled: true });

    expect(
      apiIds(await getVisibleRefereeGames(refId, { ...PAGE, status: "cancelled" })),
    ).toEqual([2]);
  });

  it("status 'forfeited' narrows to forfeited games only", async () => {
    await seedGame({ apiMatchId: 1 });
    await seedGame({ apiMatchId: 2, isForfeited: true });

    expect(
      apiIds(await getVisibleRefereeGames(refId, { ...PAGE, status: "forfeited" })),
    ).toEqual([2]);
  });

  it("status 'all' keeps cancelled and forfeited games", async () => {
    await seedGame({ apiMatchId: 1 });
    await seedGame({ apiMatchId: 2, isCancelled: true });
    await seedGame({ apiMatchId: 3, isForfeited: true });

    expect(
      apiIds(await getVisibleRefereeGames(refId, { ...PAGE, status: "all" })),
    ).toEqual([1, 2, 3]);
  });

  it("filters by a single league id", async () => {
    await seedGame({ apiMatchId: 1, leagueApiId: 101 });
    await seedGame({ apiMatchId: 2, leagueApiId: 202 });

    expect(
      apiIds(await getVisibleRefereeGames(refId, { ...PAGE, league: ["101"] })),
    ).toEqual([1]);
  });

  it("filters by multiple league ids", async () => {
    await seedGame({ apiMatchId: 1, leagueApiId: 101 });
    await seedGame({ apiMatchId: 2, leagueApiId: 202 });
    await seedGame({ apiMatchId: 3, leagueApiId: 303 });

    expect(
      apiIds(await getVisibleRefereeGames(refId, { ...PAGE, league: ["101", "202"] })),
    ).toEqual([1, 2]);
  });

  it("filters by a closed date range", async () => {
    await seedGame({ apiMatchId: 1, kickoffDate: "2026-03-31" });
    await seedGame({ apiMatchId: 2, kickoffDate: "2026-04-15" });
    await seedGame({ apiMatchId: 3, kickoffDate: "2026-06-01" });

    expect(
      apiIds(
        await getVisibleRefereeGames(refId, {
          ...PAGE,
          dateFrom: "2026-04-01",
          dateTo: "2026-05-01",
        }),
      ),
    ).toEqual([2]);
  });

  it("search matches home team, guest team or league name", async () => {
    await seedGame({ apiMatchId: 1, homeTeamName: "Dragons U16" });
    await seedGame({ apiMatchId: 2, guestTeamName: "Dragons U18", homeTeamName: "Falcons" });
    await seedGame({ apiMatchId: 3, homeTeamName: "Falcons", guestTeamName: "Titans" });

    expect(
      apiIds(await getVisibleRefereeGames(refId, { ...PAGE, search: "Dragons" })),
    ).toEqual([1, 2]);
  });

  it("multi-word search requires every word to match", async () => {
    await seedGame({ apiMatchId: 1, homeTeamName: "Dragons U16", leagueName: "Kreisliga" });
    await seedGame({ apiMatchId: 2, homeTeamName: "Dragons U18", leagueName: "Bezirksliga" });

    expect(
      apiIds(await getVisibleRefereeGames(refId, { ...PAGE, search: "Dragons Kreisliga" })),
    ).toEqual([1]);
  });

  it("gameType 'home' excludes away games", async () => {
    await seedGame({ apiMatchId: 1, isHomeGame: true });
    await seedGame({ apiMatchId: 2, isHomeGame: false, isGuestGame: true });

    expect(
      apiIds(await getVisibleRefereeGames(refId, { ...PAGE, gameType: "home" })),
    ).toEqual([1]);
  });

  it("gameType 'away' excludes home games", async () => {
    await seedGame({ apiMatchId: 1, isHomeGame: true });
    await seedGame({ apiMatchId: 2, isHomeGame: false, isGuestGame: true });

    expect(
      apiIds(await getVisibleRefereeGames(refId, { ...PAGE, gameType: "away" })),
    ).toEqual([2]);
  });

  it("assignedRefereeApiId narrows to that referee's games", async () => {
    await seedGame({ apiMatchId: 1, sr1RefereeApiId: 4242, sr2Status: "open" });
    await seedGame({ apiMatchId: 2 });

    expect(
      apiIds(await getVisibleRefereeGames(refId, { ...PAGE, assignedRefereeApiId: 4242 })),
    ).toEqual([1]);
  });

  it("slotStatus 'open' keeps only games with an open slot", async () => {
    await seedGame({ apiMatchId: 1, sr1Status: "open", sr2Status: "assigned" });
    // Visible via the assignment bypass, but has no open slot at all.
    await seedGame({
      apiMatchId: 2,
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
      sr2Status: "assigned",
    });

    expect(
      apiIds(await getVisibleRefereeGames(refId, { ...PAGE, slotStatus: "open" })),
    ).toEqual([1]);
  });

  it("slotStatus 'offered' widens to offered slots for admins of the referee view", async () => {
    // sr1 open keeps the game inside the base filter; sr2 offered is the extra arm.
    await seedGame({ apiMatchId: 1, sr1Status: "open", sr2Status: "offered" });
    await seedGame({ apiMatchId: 2, sr1Status: "open", sr2Status: "assigned" });

    expect(
      apiIds(await getVisibleRefereeGames(refId, { ...PAGE, slotStatus: "offered" })),
    ).toEqual([1, 2]);
  });

  it("paginates and orders by kickoff date then time", async () => {
    await seedGame({ apiMatchId: 1, kickoffDate: "2026-05-02", kickoffTime: "09:00:00" });
    await seedGame({ apiMatchId: 2, kickoffDate: "2026-05-01", kickoffTime: "20:00:00" });
    await seedGame({ apiMatchId: 3, kickoffDate: "2026-05-01", kickoffTime: "09:00:00" });

    const page1 = await getVisibleRefereeGames(refId, { limit: 2, offset: 0 });
    expect(page1.items.map((i) => i.apiMatchId)).toEqual([3, 2]);
    expect(page1.total).toBe(3);
    expect(page1.hasMore).toBe(true);

    const page2 = await getVisibleRefereeGames(refId, { limit: 2, offset: 2 });
    expect(page2.items.map((i) => i.apiMatchId)).toEqual([1]);
    expect(page2.hasMore).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Admin mode (refereeId = null)
// ---------------------------------------------------------------------------

describe("getVisibleRefereeGames (admin mode)", () => {
  it("returns games with an open our-club slot without any referee lookup", async () => {
    await seedGame({ apiMatchId: 1 });
    await seedGame({ apiMatchId: 2, sr1Status: "assigned", sr2Status: "assigned" });

    const result = await getVisibleRefereeGames(null, PAGE);

    expect(apiIds(result)).toEqual([1]);
    expect(result.items[0]?.mySlot).toBeNull();
    expect(result.items[0]?.claimableSlots).toEqual([]);
    expect(result.total).toBe(1);
  });

  it("ignores home/away visibility entirely", async () => {
    await seedGame({ apiMatchId: 1, isHomeGame: true });
    await seedGame({ apiMatchId: 2, isHomeGame: false, isGuestGame: true });

    expect(apiIds(await getVisibleRefereeGames(null, PAGE))).toEqual([1, 2]);
  });

  it("never returns a tombstoned game (#105)", async () => {
    await seedGame({ apiMatchId: 1 });
    await seedGame({ apiMatchId: 2, removedAt: new Date("2026-04-01T00:00:00Z") });

    expect(apiIds(await getVisibleRefereeGames(null, PAGE))).toEqual([1]);
  });

  it("applies status, league, date and search filters together", async () => {
    await seedGame({
      apiMatchId: 1,
      leagueApiId: 101,
      kickoffDate: "2026-04-10",
      homeTeamName: "Dragons U16",
    });
    // Right league + date, wrong name
    await seedGame({
      apiMatchId: 2,
      leagueApiId: 101,
      kickoffDate: "2026-04-10",
      homeTeamName: "Falcons",
      guestTeamName: "Titans",
      leagueName: "Kreisliga",
    });
    // Right name, out of range
    await seedGame({
      apiMatchId: 3,
      leagueApiId: 101,
      kickoffDate: "2026-05-10",
      homeTeamName: "Dragons U18",
    });

    const result = await getVisibleRefereeGames(null, {
      limit: 10,
      offset: 0,
      league: ["101"],
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
      search: "Dragons",
    });

    expect(apiIds(result)).toEqual([1]);
  });

  it("status 'all' keeps cancelled games", async () => {
    await seedGame({ apiMatchId: 1, isCancelled: true });

    expect(
      apiIds(await getVisibleRefereeGames(null, { limit: 10, offset: 0, status: "all" })),
    ).toEqual([1]);
    expect(
      apiIds(await getVisibleRefereeGames(null, { limit: 10, offset: 0 })),
    ).toEqual([]);
  });

  it("status 'forfeited' narrows to forfeited games", async () => {
    await seedGame({ apiMatchId: 1, isForfeited: true });
    await seedGame({ apiMatchId: 2 });

    expect(
      apiIds(
        await getVisibleRefereeGames(null, { limit: 10, offset: 0, status: "forfeited" }),
      ),
    ).toEqual([1]);
  });

  it("filters by gameType, assignedRefereeApiId and slotStatus", async () => {
    await seedGame({ apiMatchId: 1, isHomeGame: true, sr1RefereeApiId: 4242, sr2Status: "open" });
    await seedGame({ apiMatchId: 2, isHomeGame: false, isGuestGame: true, sr1RefereeApiId: 4242 });
    await seedGame({ apiMatchId: 3, isHomeGame: true });

    expect(
      apiIds(await getVisibleRefereeGames(null, { ...PAGE, gameType: "home" })),
    ).toEqual([1, 3]);
    expect(
      apiIds(await getVisibleRefereeGames(null, { ...PAGE, assignedRefereeApiId: 4242 })),
    ).toEqual([1, 2]);
    expect(
      apiIds(await getVisibleRefereeGames(null, { ...PAGE, slotStatus: "open" })),
    ).toEqual([1, 2, 3]);
  });

  it("slotStatus 'offered' widens to offered slots in admin mode", async () => {
    // sr1 open keeps both inside the base filter; only #1 also has an offered slot.
    await seedGame({ apiMatchId: 1, sr1Status: "open", sr2Status: "offered" });
    await seedGame({ apiMatchId: 2, sr1Status: "open", sr2Status: "assigned" });

    expect(
      apiIds(await getVisibleRefereeGames(null, { ...PAGE, slotStatus: "offered" })),
    ).toEqual([1, 2]);
    expect(
      apiIds(await getVisibleRefereeGames(null, { ...PAGE, slotStatus: "any" })),
    ).toEqual([1, 2]);
  });

  it("multiple league ids use inArray", async () => {
    await seedGame({ apiMatchId: 1, leagueApiId: 101 });
    await seedGame({ apiMatchId: 2, leagueApiId: 202 });
    await seedGame({ apiMatchId: 3, leagueApiId: 303 });

    expect(
      apiIds(await getVisibleRefereeGames(null, { ...PAGE, league: ["101", "202"] })),
    ).toEqual([1, 2]);
  });

  it("returns total 0 and hasMore false for an empty table", async () => {
    const result = await getVisibleRefereeGames(null, PAGE);

    expect(result).toEqual({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      hasMore: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Single-row lookups
// ---------------------------------------------------------------------------

describe("getVisibleRefereeGameById", () => {
  it("returns null when the referee does not exist", async () => {
    const id = await seedGame({ apiMatchId: 1 });

    expect(await getVisibleRefereeGameById(999, id)).toBeNull();
  });

  it("returns null when the referee is not own-club", async () => {
    const id = await seedGame({ apiMatchId: 1 });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: false,
    });

    expect(await getVisibleRefereeGameById(refId, id)).toBeNull();
  });

  it("returns the row when visible", async () => {
    const id = await seedGame({ apiMatchId: 4711 });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    const result = await getVisibleRefereeGameById(refId, id);

    expect(result?.id).toBe(id);
    expect(result?.apiMatchId).toBe(4711);
    expect(result?.mySlot).toBeNull();
    expect(result?.claimableSlots).toEqual([1, 2]);
  });

  it("returns null when the row exists but the referee cannot see it", async () => {
    // Away game, referee may only see home games.
    const id = await seedGame({ apiMatchId: 1, isHomeGame: false, isGuestGame: true });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    expect(await getVisibleRefereeGameById(refId, id)).toBeNull();
  });

  it("returns an away game once allowAwayGames is set", async () => {
    const id = await seedGame({ apiMatchId: 12, isHomeGame: false, isGuestGame: true });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: true,
    });

    expect((await getVisibleRefereeGameById(refId, id))?.apiMatchId).toBe(12);
  });

  it("returns a game the referee holds even without matching visibility", async () => {
    const id = await seedGame({
      apiMatchId: 20,
      isHomeGame: false,
      sr1RefereeApiId: REF_API_ID,
      sr1Status: "assigned",
    });
    const refId = await seedReferee({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
    });

    const result = await getVisibleRefereeGameById(refId, id);

    expect(result?.id).toBe(id);
    expect(result?.mySlot).toBe(1);
  });

  it("sets mySlot = 2 when the referee is on slot 2", async () => {
    const id = await seedGame({
      apiMatchId: 21,
      sr2RefereeApiId: REF_API_ID,
      sr2Status: "assigned",
    });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    expect((await getVisibleRefereeGameById(refId, id))?.mySlot).toBe(2);
  });

  it("returns null for a tombstoned game (#105)", async () => {
    const id = await seedGame({
      apiMatchId: 1,
      removedAt: new Date("2026-04-01T00:00:00Z"),
    });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: true,
    });

    expect(await getVisibleRefereeGameById(refId, id)).toBeNull();
  });

  it("selects by the requested id, not simply the first visible row", async () => {
    await seedGame({ apiMatchId: 1 });
    const wanted = await seedGame({ apiMatchId: 2 });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    expect((await getVisibleRefereeGameById(refId, wanted))?.apiMatchId).toBe(2);
  });
});

describe("getVisibleRefereeGameById (admin mode)", () => {
  it("returns the row without visibility filtering and with null mySlot", async () => {
    const id = await seedGame({
      apiMatchId: 7,
      isHomeGame: false,
      sr1Status: "assigned",
      sr2Status: "assigned",
    });

    const result = await getVisibleRefereeGameById(null, id);

    expect(result?.id).toBe(id);
    expect(result?.mySlot).toBeNull();
    expect(result?.claimableSlots).toEqual([]);
  });

  it("returns null when the row is not found", async () => {
    expect(await getVisibleRefereeGameById(null, 99)).toBeNull();
  });

  it("returns null for a tombstoned game (#105)", async () => {
    const id = await seedGame({
      apiMatchId: 1,
      removedAt: new Date("2026-04-01T00:00:00Z"),
    });

    expect(await getVisibleRefereeGameById(null, id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The Einsatz brief (#309)
// ---------------------------------------------------------------------------

describe("getVisibleRefereeGameById — brief", () => {
  const BRIEF_SEED = {
    venueName: "Sporthalle West",
    venueCity: "Berlin",
    venueStreet: "Hauptstr. 1",
    venuePostalCode: "12345",
    sr1Tentative: true,
    sr2Tentative: false,
    venueChanged: true,
    timeChanged: false,
  } as const;

  it("carries the address, slot state, change flags and federation link", async () => {
    const id = await seedGame({ apiMatchId: 4242, ...BRIEF_SEED });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    const result = await getVisibleRefereeGameById(refId, id);

    expect(result?.brief).toEqual({
      venueStreet: "Hauptstr. 1",
      venuePostalCode: "12345",
      sr1Tentative: true,
      sr2Tentative: false,
      venueChanged: true,
      timeChanged: false,
      federationUrl: "https://www.basketball-bund.net/static/#/spiel/4242",
    });
  });

  it("carries the brief on the admin (unscoped) path too", async () => {
    const id = await seedGame({ apiMatchId: 4243, ...BRIEF_SEED });

    const result = await getVisibleRefereeGameById(null, id);

    expect(result?.brief).toMatchObject({
      venueStreet: "Hauptstr. 1",
      federationUrl: "https://www.basketball-bund.net/static/#/spiel/4243",
    });
  });

  // A row synced before the columns existed has no address at all. The nulls
  // travel to the client so the screen can drop the address line, rather than
  // being filled in with empty strings that would render as blanks.
  it("reports a null address for a row synced before the columns existed", async () => {
    const id = await seedGame({ apiMatchId: 4244 });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    expect((await getVisibleRefereeGameById(refId, id))?.brief).toMatchObject({
      venueStreet: null,
      venuePostalCode: null,
      sr1Tentative: false,
      sr2Tentative: false,
      venueChanged: false,
      timeChanged: false,
    });
  });

  // The list endpoint's shape is deliberately unchanged: only the single-game
  // Einsatz reader pays for the brief.
  it("leaves the list item shape alone — no brief columns leak into it", async () => {
    const id = await seedGame({ apiMatchId: 4245, ...BRIEF_SEED });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    const { brief: _brief, ...item } = (await getVisibleRefereeGameById(refId, id))!;
    for (const key of [
      "venueStreet",
      "venuePostalCode",
      "sr1Tentative",
      "sr2Tentative",
      "venueChanged",
      "timeChanged",
    ]) {
      expect(item).not.toHaveProperty(key);
    }

    const listed = await getVisibleRefereeGames(refId, PAGE);
    expect(listed.items[0]).not.toHaveProperty("brief");
    expect(listed.items[0]).not.toHaveProperty("venueStreet");
  });
});

// ---------------------------------------------------------------------------
// Kampfgericht and team contacts (#313)
// ---------------------------------------------------------------------------

describe("getVisibleRefereeGameById — Kampfgericht and contacts", () => {
  /**
   * An own-club team with a coach, playing at home. `seedGame` sets
   * `homeTeamId`, which is what the contact reader resolves the team from.
   */
  async function seedContactFixture(gameSeed: GameSeed) {
    const [season] = await ctx.db
      .insert(seasons)
      .values({ name: "2026/27", status: "active" })
      .returning({ id: seasons.id });
    const teamId = await seedTeam(7001);
    await ctx.db
      .update(teams)
      .set({ isOwnClub: true, name: "Dragons 1" })
      .where(eq(teams.id, teamId));
    const [entry] = await ctx.db
      .insert(teamEntries)
      .values({ teamId, seasonId: season!.id })
      .returning({ id: teamEntries.id });
    await ctx.db.insert(teamStaff).values({
      teamEntryId: entry!.id,
      firstName: "Ana",
      lastName: "Berger",
      role: "trainer",
      phone: "+49 111",
    });
    const gameId = await seedGame({ homeTeamId: teamId, ...gameSeed });
    return { gameId, teamId, entryId: entry!.id };
  }

  it("sends both blocks to the referee holding a slot", async () => {
    const { gameId, entryId } = await seedContactFixture({
      apiMatchId: 5301,
      sr1RefereeApiId: REF_API_ID,
      sr1Status: "assigned",
    });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    const result = await getVisibleRefereeGameById(refId, gameId);

    expect(result?.mySlot).toBe(1);
    expect(result?.contacts).toEqual([
      {
        teamEntryId: entryId,
        teamName: "Dragons 1",
        contacts: [
          {
            firstName: "Ana",
            lastName: "Berger",
            role: "trainer",
            phone: "+49 111",
            email: null,
          },
        ],
      },
    ]);
    // No linked match, so no Kampfgericht — but the key is present, because
    // this caller is allowed to see it.
    expect(result?.kampfgericht).toEqual([]);
  });

  it("sends both blocks on the admin (unscoped) path", async () => {
    const { gameId } = await seedContactFixture({ apiMatchId: 5302 });

    const result = await getVisibleRefereeGameById(null, gameId);

    expect(result?.contacts).toHaveLength(1);
    expect(result?.kampfgericht).toEqual([]);
  });

  // An open game a referee could claim advertises teams, venue and slots. A
  // coach's phone number is not part of that.
  it("omits both keys for a referee who does not hold a slot", async () => {
    const { gameId } = await seedContactFixture({ apiMatchId: 5303 });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    const result = await getVisibleRefereeGameById(refId, gameId);

    expect(result?.mySlot).toBeNull();
    expect(result).not.toHaveProperty("contacts");
    expect(result).not.toHaveProperty("kampfgericht");
  });

  it("keeps both keys off the other single-game readers", async () => {
    const { gameId } = await seedContactFixture({ apiMatchId: 5304 });
    const byApiMatch = await getVisibleRefereeGameByApiMatchId(null, 5304);

    expect(byApiMatch).not.toHaveProperty("contacts");
    expect(await getVisibleRefereeGameById(null, gameId)).toHaveProperty("contacts");
  });
});

describe("getVisibleRefereeGameByMatchId", () => {
  async function seedLinkedGame(apiMatchId: number, extra: Partial<GameSeed> = {}) {
    const homeApiId = 7000 + apiMatchId;
    const guestApiId = 8000 + apiMatchId;
    await seedTeam(homeApiId);
    await seedTeam(guestApiId);
    const matchId = await seedMatch(apiMatchId, homeApiId, guestApiId);
    await seedGame({ apiMatchId, matchId, ...extra });
    return matchId;
  }

  it("resolves by the internal match id in admin mode", async () => {
    const matchId = await seedLinkedGame(50);
    await seedLinkedGame(51);

    const result = await getVisibleRefereeGameByMatchId(null, matchId);

    expect(result?.apiMatchId).toBe(50);
    expect(result?.mySlot).toBeNull();
    expect(result?.claimableSlots).toEqual([]);
  });

  it("returns null when no referee-game references the match", async () => {
    expect(await getVisibleRefereeGameByMatchId(null, 999)).toBeNull();
  });

  it("returns null for a tombstoned game in admin mode (#105)", async () => {
    const matchId = await seedLinkedGame(52, {
      removedAt: new Date("2026-04-01T00:00:00Z"),
    });

    expect(await getVisibleRefereeGameByMatchId(null, matchId)).toBeNull();
  });

  it("applies referee visibility in referee mode", async () => {
    const matchId = await seedLinkedGame(53, { isHomeGame: false, isGuestGame: true });
    const homeOnly = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });
    const awayToo = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: true,
      apiId: 7777,
    });

    expect(await getVisibleRefereeGameByMatchId(homeOnly, matchId)).toBeNull();
    expect((await getVisibleRefereeGameByMatchId(awayToo, matchId))?.apiMatchId).toBe(53);
  });

  it("returns null when the referee is not own-club", async () => {
    const matchId = await seedLinkedGame(54);
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: false,
    });

    expect(await getVisibleRefereeGameByMatchId(refId, matchId)).toBeNull();
  });

  it("returns null when the referee does not exist", async () => {
    const matchId = await seedLinkedGame(55);

    expect(await getVisibleRefereeGameByMatchId(999, matchId)).toBeNull();
  });
});

describe("getVisibleRefereeGameByApiMatchId", () => {
  it("resolves by federation apiMatchId in admin mode", async () => {
    await seedGame({ apiMatchId: 4711 });
    await seedGame({ apiMatchId: 4712 });

    const result = await getVisibleRefereeGameByApiMatchId(null, 4711);

    expect(result?.apiMatchId).toBe(4711);
    expect(result?.mySlot).toBeNull();
    expect(result?.claimableSlots).toEqual([]);
  });

  it("returns null when no row has that apiMatchId", async () => {
    expect(await getVisibleRefereeGameByApiMatchId(null, 99999)).toBeNull();
  });

  it("returns null for a tombstoned game in admin mode (#105)", async () => {
    await seedGame({ apiMatchId: 4711, removedAt: new Date("2026-04-01T00:00:00Z") });

    expect(await getVisibleRefereeGameByApiMatchId(null, 4711)).toBeNull();
  });

  it("returns null when the referee does not exist", async () => {
    await seedGame({ apiMatchId: 4711 });

    expect(await getVisibleRefereeGameByApiMatchId(999, 4711)).toBeNull();
  });

  it("returns null when the referee is not own-club", async () => {
    await seedGame({ apiMatchId: 4711 });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: false,
    });

    expect(await getVisibleRefereeGameByApiMatchId(refId, 4711)).toBeNull();
  });

  it("returns the row when visible to the referee", async () => {
    await seedGame({ apiMatchId: 4711 });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    const result = await getVisibleRefereeGameByApiMatchId(refId, 4711);

    expect(result?.apiMatchId).toBe(4711);
    expect(result?.claimableSlots).toEqual([1, 2]);
  });

  it("returns null when the row exists but is not visible to the referee", async () => {
    await seedGame({ apiMatchId: 4711, isHomeGame: false, isGuestGame: true });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    expect(await getVisibleRefereeGameByApiMatchId(refId, 4711)).toBeNull();
  });

  it("returns null for a tombstoned game the referee otherwise holds (#105)", async () => {
    await seedGame({
      apiMatchId: 4711,
      sr1RefereeApiId: REF_API_ID,
      sr1Status: "assigned",
      removedAt: new Date("2026-04-01T00:00:00Z"),
    });
    const refId = await seedReferee({
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: true,
    });

    expect(await getVisibleRefereeGameByApiMatchId(refId, 4711)).toBeNull();
  });
});

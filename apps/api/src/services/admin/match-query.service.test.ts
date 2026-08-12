import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from "vitest";

// --- Mock setup ---
//
// drizzle-orm, drizzle-orm/pg-core and @dragons/db/schema are deliberately NOT
// mocked. The previous version of this file stubbed `eq`/`and`/`or`/`inArray`/
// `gte`/`lte`/`isNull`/`isNotNull` with identity functions and could therefore
// only test the pure row mappers — `getOwnClubMatches`, which owns every filter
// the admin match list exposes, was not covered at all, and swapping its
// `or(home, guest)` for `and(home, guest)` would have gone unnoticed.
//
// Everything below runs the real query (the two team aliases, the league/venue
// left joins, the filter predicates, ordering and pagination) against an
// in-process PGlite Postgres. `match-diff.service` is left real too, so the
// diff tail of `buildDetailResponse` executes.
//
// Referee-slot resolution has its own suite in
// `match-query.service.integration.test.ts`.

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

import { getDb } from "../../config/database";
import {
  getOwnClubMatches,
  getMatchDetail,
  getMatchChangeHistory,
  getPublicMatchDetail,
  loadOverrides,
  loadRemoteSnapshot,
  queryMatchWithJoins,
  rowToDetail,
  rowToListItem,
  rowToPublicDetail,
} from "./match-query.service";
import {
  leagues,
  matchChanges,
  matchOverrides,
  matchRemoteVersions,
  matches,
  teams,
  teamEntries,
  venueBookingMatches,
  venueBookings,
  venues,
} from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { seedActiveSeason } from "../../test/seed-season";

let ctx: TestDbContext;
let activeSeasonId: number;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  activeSeasonId = await seedActiveSeason(ctx);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

const OWN_A = 100;
const OWN_B = 101;
const FOREIGN_X = 200;
const FOREIGN_Y = 201;

let seq = 0;

async function seedTeams(): Promise<void> {
  await ctx.db.insert(teams).values([
    {
      apiTeamPermanentId: OWN_A,
      seasonTeamId: 1100,
      teamCompetitionId: 1,
      name: "Dragons I",
      nameShort: "DRG1",
      clubId: 500,
      isOwnClub: true,
      badgeColor: "#FF0000",
    },
    {
      apiTeamPermanentId: OWN_B,
      seasonTeamId: 1101,
      teamCompetitionId: 2,
      name: "Dragons II",
      nameShort: "DRG2",
      clubId: 500,
      isOwnClub: true,
    },
    {
      apiTeamPermanentId: FOREIGN_X,
      seasonTeamId: 1200,
      teamCompetitionId: 3,
      name: "Tigers",
      nameShort: "TIG",
      clubId: 600,
      isOwnClub: false,
      badgeColor: "#0000FF",
    },
    {
      apiTeamPermanentId: FOREIGN_Y,
      seasonTeamId: 1201,
      teamCompetitionId: 4,
      name: "Eagles",
      nameShort: "EAG",
      clubId: 601,
      isOwnClub: false,
    },
  ]);
}

async function seedLeague(name: string): Promise<number> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(leagues)
    .values({
      apiLigaId: 58000 + n,
      ligaNr: 4100 + n,
      name,
      seasonId: 2025,
      seasonName: "2025/26",
      seasonRefId: activeSeasonId,
    })
    .returning({ id: leagues.id });
  return row!.id;
}

async function seedVenue(name: string): Promise<number> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(venues)
    .values({
      apiId: 7000 + n,
      name,
      street: "Hauptstr. 1",
      postalCode: "12345",
      city: "Musterstadt",
    })
    .returning({ id: venues.id });
  return row!.id;
}

interface MatchSeed {
  home?: number;
  guest?: number;
  kickoffDate?: string;
  kickoffTime?: string;
  leagueId?: number | null;
  venueId?: number | null;
  homeScore?: number | null;
  guestScore?: number | null;
  isForfeited?: boolean | null;
  isCancelled?: boolean | null;
  currentLocalVersion?: number;
  currentRemoteVersion?: number;
  internalNotes?: string | null;
  publicComment?: string | null;
}

async function seedMatch(seed: MatchSeed = {}): Promise<number> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: 10000 + n,
      matchNo: n,
      matchDay: 1,
      kickoffDate: seed.kickoffDate ?? "2026-03-20",
      kickoffTime: seed.kickoffTime ?? "19:30:00",
      homeTeamApiId: seed.home ?? OWN_A,
      guestTeamApiId: seed.guest ?? FOREIGN_X,
      leagueId: seed.leagueId ?? null,
      venueId: seed.venueId ?? null,
      homeScore: seed.homeScore ?? null,
      guestScore: seed.guestScore ?? null,
      isForfeited: seed.isForfeited ?? false,
      isCancelled: seed.isCancelled ?? false,
      currentLocalVersion: seed.currentLocalVersion ?? 0,
      currentRemoteVersion: seed.currentRemoteVersion ?? 0,
      internalNotes: seed.internalNotes ?? null,
      publicComment: seed.publicComment ?? null,
      homeHalftimeScore: 40,
      guestHalftimeScore: 30,
      periodFormat: "quarters",
      homeQ1: 20,
      guestQ1: 15,
    })
    .returning({ id: matches.id });
  return row!.id;
}

async function firstRow(matchId: number) {
  const [row] = await queryMatchWithJoins(getDb()).where(eq(matches.id, matchId)).limit(1);
  return row!;
}

const listParams = { limit: 50, offset: 0 };

// --- Tests ---

describe("getOwnClubMatches — own-club scoping", () => {
  beforeEach(seedTeams);

  it("returns matches where the own club is home OR guest, but not foreign-only ones", async () => {
    const asHome = await seedMatch({ home: OWN_A, guest: FOREIGN_X });
    const asGuest = await seedMatch({ home: FOREIGN_Y, guest: OWN_B });
    const bothOwn = await seedMatch({ home: OWN_A, guest: OWN_B });
    await seedMatch({ home: FOREIGN_X, guest: FOREIGN_Y });

    const result = await getOwnClubMatches(listParams);

    expect(result.items.map((m) => m.id).sort()).toEqual([asHome, asGuest, bothOwn].sort());
    expect(result.total).toBe(3);
  });

  it("returns an empty page when no team is flagged as own club", async () => {
    await ctx.db.update(teams).set({ isOwnClub: false });
    await seedMatch();

    expect(await getOwnClubMatches(listParams)).toEqual({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      hasMore: false,
    });
  });
});

describe("getOwnClubMatches — filters", () => {
  beforeEach(seedTeams);

  it("filters by leagueId", async () => {
    const a = await seedLeague("Liga A");
    const b = await seedLeague("Liga B");
    const inA = await seedMatch({ leagueId: a });
    await seedMatch({ leagueId: b });
    await seedMatch({ leagueId: null });

    const result = await getOwnClubMatches({ ...listParams, leagueId: a });

    expect(result.items.map((m) => m.id)).toEqual([inA]);
    expect(result.total).toBe(1);
    expect(result.items[0]!.leagueName).toBe("Liga A");
  });

  it("keeps only matches on or after dateFrom", async () => {
    await seedMatch({ kickoffDate: "2026-01-01" });
    const mid = await seedMatch({ kickoffDate: "2026-06-01" });
    const late = await seedMatch({ kickoffDate: "2026-12-01" });

    const result = await getOwnClubMatches({ ...listParams, dateFrom: "2026-06-01" });

    expect(result.items.map((m) => m.id)).toEqual([mid, late]);
  });

  it("keeps only matches on or before dateTo", async () => {
    const early = await seedMatch({ kickoffDate: "2026-01-01" });
    const mid = await seedMatch({ kickoffDate: "2026-06-01" });
    await seedMatch({ kickoffDate: "2026-12-01" });

    const result = await getOwnClubMatches({ ...listParams, dateTo: "2026-06-01" });

    expect(result.items.map((m) => m.id)).toEqual([early, mid]);
  });

  it("intersects dateFrom and dateTo into a closed range", async () => {
    await seedMatch({ kickoffDate: "2026-01-01" });
    const mid = await seedMatch({ kickoffDate: "2026-06-01" });
    await seedMatch({ kickoffDate: "2026-12-01" });

    const result = await getOwnClubMatches({
      ...listParams,
      dateFrom: "2026-05-01",
      dateTo: "2026-07-01",
    });

    expect(result.items.map((m) => m.id)).toEqual([mid]);
  });

  it("teamApiId matches whether the team plays home or away", async () => {
    const home = await seedMatch({ home: OWN_A, guest: FOREIGN_X });
    const away = await seedMatch({ home: FOREIGN_Y, guest: OWN_A });
    await seedMatch({ home: OWN_B, guest: FOREIGN_X });

    const result = await getOwnClubMatches({ ...listParams, teamApiId: OWN_A });

    expect(result.items.map((m) => m.id).sort()).toEqual([home, away].sort());
  });

  it("ANDs teamApiId with opponentApiId to pin a fixture", async () => {
    const wanted = await seedMatch({ home: OWN_A, guest: FOREIGN_X });
    await seedMatch({ home: OWN_A, guest: FOREIGN_Y });
    await seedMatch({ home: OWN_B, guest: FOREIGN_X });

    const result = await getOwnClubMatches({
      ...listParams,
      teamApiId: OWN_A,
      opponentApiId: FOREIGN_X,
    });

    expect(result.items.map((m) => m.id)).toEqual([wanted]);
    expect(result.total).toBe(1);
  });

  it("hasScore=true requires BOTH scores to be present", async () => {
    const both = await seedMatch({ homeScore: 78, guestScore: 65 });
    await seedMatch({ homeScore: 78, guestScore: null });
    await seedMatch({ homeScore: null, guestScore: 65 });
    await seedMatch({ homeScore: null, guestScore: null });

    const result = await getOwnClubMatches({ ...listParams, hasScore: true });

    expect(result.items.map((m) => m.id)).toEqual([both]);
  });

  it("hasScore=false keeps a match with either score missing", async () => {
    await seedMatch({ homeScore: 78, guestScore: 65 });
    const halfA = await seedMatch({ homeScore: 78, guestScore: null });
    const halfB = await seedMatch({ homeScore: null, guestScore: 65 });
    const neither = await seedMatch({ homeScore: null, guestScore: null });

    const result = await getOwnClubMatches({ ...listParams, hasScore: false });

    expect(result.items.map((m) => m.id).sort()).toEqual([halfA, halfB, neither].sort());
  });

  it("omitting hasScore applies no score filter at all", async () => {
    await seedMatch({ homeScore: 78, guestScore: 65 });
    await seedMatch({ homeScore: null, guestScore: null });

    expect((await getOwnClubMatches(listParams)).total).toBe(2);
  });

  it("excludeInactive drops forfeited and cancelled matches but keeps NULL flags", async () => {
    const active = await seedMatch({ isForfeited: false, isCancelled: false });
    const nulls = await seedMatch({ isForfeited: null, isCancelled: null });
    await seedMatch({ isForfeited: true });
    await seedMatch({ isCancelled: true });

    const result = await getOwnClubMatches({ ...listParams, excludeInactive: true });

    expect(result.items.map((m) => m.id).sort()).toEqual([active, nulls].sort());
    expect(result.total).toBe(2);
  });

  it("without excludeInactive the inactive matches stay in the list", async () => {
    await seedMatch({ isForfeited: true });
    await seedMatch({ isCancelled: true });

    expect((await getOwnClubMatches(listParams)).total).toBe(2);
  });
});

describe("getOwnClubMatches — ordering and pagination", () => {
  beforeEach(seedTeams);

  it("sorts by kickoff date then time ascending by default", async () => {
    const later = await seedMatch({ kickoffDate: "2026-03-21", kickoffTime: "10:00:00" });
    const earlySameDay = await seedMatch({ kickoffDate: "2026-03-20", kickoffTime: "10:00:00" });
    const lateSameDay = await seedMatch({ kickoffDate: "2026-03-20", kickoffTime: "20:00:00" });

    const result = await getOwnClubMatches(listParams);

    expect(result.items.map((m) => m.id)).toEqual([earlySameDay, lateSameDay, later]);
  });

  it("reverses the order when sort is 'desc'", async () => {
    const first = await seedMatch({ kickoffDate: "2026-03-20", kickoffTime: "10:00:00" });
    const second = await seedMatch({ kickoffDate: "2026-03-20", kickoffTime: "20:00:00" });
    const third = await seedMatch({ kickoffDate: "2026-03-21", kickoffTime: "10:00:00" });

    const result = await getOwnClubMatches({ ...listParams, sort: "desc" });

    expect(result.items.map((m) => m.id)).toEqual([third, second, first]);
  });

  it("pages with limit/offset while reporting the unpaged total", async () => {
    const ids: number[] = [];
    for (let i = 1; i <= 5; i++) {
      ids.push(await seedMatch({ kickoffDate: `2026-03-0${i}` }));
    }

    const page1 = await getOwnClubMatches({ limit: 2, offset: 0 });
    expect(page1.items.map((m) => m.id)).toEqual([ids[0], ids[1]]);
    expect(page1).toMatchObject({ total: 5, limit: 2, offset: 0, hasMore: true });

    const page3 = await getOwnClubMatches({ limit: 2, offset: 4 });
    expect(page3.items.map((m) => m.id)).toEqual([ids[4]]);
    expect(page3).toMatchObject({ total: 5, hasMore: false });
  });

  it("counts only the filtered rows, not the whole table", async () => {
    const a = await seedLeague("Liga A");
    for (let i = 0; i < 3; i++) await seedMatch({ leagueId: a });
    for (let i = 0; i < 4; i++) await seedMatch({ leagueId: null });

    const result = await getOwnClubMatches({ limit: 1, offset: 0, leagueId: a });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(3);
  });
});

describe("getOwnClubMatches — row decoration", () => {
  beforeEach(seedTeams);

  it("attaches each match's own overrides and booking, not another match's", async () => {
    const venueId = await seedVenue("Sporthalle Nord");
    const withExtras = await seedMatch({ venueId, kickoffDate: "2026-03-20" });
    const plain = await seedMatch({ kickoffDate: "2026-03-21" });

    await ctx.db.insert(matchOverrides).values([
      { matchId: withExtras, fieldName: "kickoffDate", reason: "Weather", changedBy: "admin" },
      { matchId: withExtras, fieldName: "homeScore", reason: "Correction", changedBy: "scorer" },
    ]);
    const [booking] = await ctx.db
      .insert(venueBookings)
      .values({
        venueId,
        date: "2026-03-20",
        calculatedStartTime: "18:00:00",
        calculatedEndTime: "21:00:00",
        status: "confirmed",
        needsReconfirmation: true,
      })
      .returning({ id: venueBookings.id });
    await ctx.db
      .insert(venueBookingMatches)
      .values({ venueBookingId: booking!.id, matchId: withExtras });

    const items = (await getOwnClubMatches(listParams)).items;
    const decorated = items.find((m) => m.id === withExtras)!;
    const bare = items.find((m) => m.id === plain)!;

    expect(decorated.overriddenFields.sort()).toEqual(["homeScore", "kickoffDate"]);
    expect(decorated.booking).toEqual({
      id: booking!.id,
      status: "confirmed",
      needsReconfirmation: true,
    });
    expect(decorated.venueName).toBe("Sporthalle Nord");
    expect(bare.overriddenFields).toEqual([]);
    expect(bare.booking).toBeNull();
  });

  it("reports hasLocalChanges from currentLocalVersion", async () => {
    const dirty = await seedMatch({ currentLocalVersion: 3, kickoffDate: "2026-03-20" });
    const clean = await seedMatch({ currentLocalVersion: 0, kickoffDate: "2026-03-21" });

    const byId = new Map(
      (await getOwnClubMatches(listParams)).items.map((m) => [m.id, m.hasLocalChanges]),
    );

    expect(byId.get(dirty)).toBe(true);
    expect(byId.get(clean)).toBe(false);
  });
});

describe("row mappers", () => {
  beforeEach(seedTeams);

  it("rowToListItem maps a real joined row", async () => {
    const leagueId = await seedLeague("Bezirksliga");
    const venueId = await seedVenue("Sporthalle Nord");
    // customName/badgeColor come from the season entry, not the (stale)
    // teams-row columns seeded by seedTeams() — OWN_A's teams row has
    // badgeColor "#FF0000" with no customName; the entry below carries
    // different values that must win.
    const [ownATeam] = await ctx.db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.apiTeamPermanentId, OWN_A));
    await ctx.db.insert(teamEntries).values({
      teamId: ownATeam!.id,
      seasonId: activeSeasonId,
      customName: "Dragons Herren I",
      badgeColor: "#00FF00",
    });
    const matchId = await seedMatch({
      leagueId,
      venueId,
      homeScore: 78,
      guestScore: 65,
      currentLocalVersion: 2,
    });

    const result = rowToListItem(await firstRow(matchId), ["kickoffDate"]);

    expect(result).toMatchObject({
      id: matchId,
      matchDay: 1,
      kickoffDate: "2026-03-20",
      kickoffTime: "19:30:00",
      homeTeamApiId: OWN_A,
      homeTeamName: "Dragons I",
      homeTeamNameShort: "DRG1",
      homeTeamCustomName: "Dragons Herren I",
      homeClubId: 500,
      guestTeamApiId: FOREIGN_X,
      guestTeamName: "Tigers",
      guestClubId: 600,
      homeIsOwnClub: true,
      guestIsOwnClub: false,
      homeBadgeColor: "#00FF00",
      // FOREIGN_X is not own-club — it never gets a team_entries row, so its
      // teams-row badgeColor ("#0000FF") is no longer read at all.
      guestBadgeColor: null,
      homeScore: 78,
      guestScore: 65,
      leagueId,
      leagueName: "Bezirksliga",
      venueId,
      venueName: "Sporthalle Nord",
      venueStreet: "Hauptstr. 1",
      venuePostalCode: "12345",
      venueCity: "Musterstadt",
      hasLocalChanges: true,
      overriddenFields: ["kickoffDate"],
      booking: null,
    });
  });

  it("rowToListItem defaults a null isOwnClub to false", async () => {
    await ctx.db.update(teams).set({ isOwnClub: null }).where(eq(teams.apiTeamPermanentId, OWN_A));
    await ctx.db
      .update(teams)
      .set({ isOwnClub: null })
      .where(eq(teams.apiTeamPermanentId, FOREIGN_X));
    const matchId = await seedMatch({ home: OWN_A, guest: FOREIGN_X });

    const result = rowToListItem(await firstRow(matchId), []);

    expect(result.homeIsOwnClub).toBe(false);
    expect(result.guestIsOwnClub).toBe(false);
  });

  it("rowToDetail adds the detail fields and ISO timestamps", async () => {
    const matchId = await seedMatch({ internalNotes: "Some internal note" });
    const overrides = [
      {
        fieldName: "kickoffDate",
        reason: "Weather",
        changedBy: "admin",
        createdAt: "2026-03-18T12:00:00.000Z",
      },
    ];

    const result = rowToDetail(await firstRow(matchId), ["kickoffDate"], overrides);

    expect(result).toMatchObject({
      id: matchId,
      homeTeamName: "Dragons I",
      homeHalftimeScore: 40,
      guestHalftimeScore: 30,
      periodFormat: "quarters",
      homeQ1: 20,
      guestQ1: 15,
      homeQ5: null,
      homeOt1: null,
      internalNotes: "Some internal note",
      overrides,
    });
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("rowToPublicDetail carries no override metadata", async () => {
    const matchId = await seedMatch({ publicComment: "Halle B" });

    const result = rowToPublicDetail(await firstRow(matchId));

    expect(result.overriddenFields).toEqual([]);
    expect(result.publicComment).toBe("Halle B");
    expect(result).not.toHaveProperty("internalNotes");
    expect(result).not.toHaveProperty("overrides");
  });
});

describe("loadOverrides", () => {
  beforeEach(seedTeams);

  it("returns only the addressed match's overrides", async () => {
    const target = await seedMatch();
    const other = await seedMatch();
    await ctx.db.insert(matchOverrides).values([
      { matchId: target, fieldName: "kickoffDate", reason: "Weather", changedBy: "admin" },
      { matchId: other, fieldName: "homeScore", reason: "Correction", changedBy: "scorer" },
    ]);

    const result = await loadOverrides(target, getDb());

    expect(result.map((o) => o.fieldName)).toEqual(["kickoffDate"]);
  });
});

describe("loadRemoteSnapshot", () => {
  beforeEach(seedTeams);

  it("returns null when remoteVersion is 0 or negative", async () => {
    const matchId = await seedMatch();

    expect(await loadRemoteSnapshot(getDb(), matchId, 0)).toBeNull();
    expect(await loadRemoteSnapshot(getDb(), matchId, -1)).toBeNull();
  });

  it("returns the snapshot for the requested match AND version", async () => {
    const matchId = await seedMatch();
    const otherMatch = await seedMatch();
    await ctx.db.insert(matchRemoteVersions).values([
      {
        matchId,
        versionNumber: 1,
        snapshot: { kickoffTime: "18:00" } as never,
        dataHash: "h1",
      },
      {
        matchId,
        versionNumber: 3,
        snapshot: { kickoffDate: "2026-03-20", kickoffTime: "19:30" } as never,
        dataHash: "h3",
      },
      {
        matchId: otherMatch,
        versionNumber: 3,
        snapshot: { kickoffTime: "wrong-match" } as never,
        dataHash: "h4",
      },
    ]);

    expect(await loadRemoteSnapshot(getDb(), matchId, 3)).toEqual({
      kickoffDate: "2026-03-20",
      kickoffTime: "19:30",
    });
  });

  it("returns null when the requested version does not exist", async () => {
    const matchId = await seedMatch();
    await ctx.db.insert(matchRemoteVersions).values({
      matchId,
      versionNumber: 1,
      snapshot: { kickoffTime: "18:00" } as never,
      dataHash: "h1",
    });

    expect(await loadRemoteSnapshot(getDb(), matchId, 3)).toBeNull();
  });
});

describe("getMatchDetail", () => {
  beforeEach(seedTeams);

  it("returns the addressed match with its overrides, booking and slot array", async () => {
    const venueId = await seedVenue("Sporthalle Nord");
    const matchId = await seedMatch({ venueId });
    await seedMatch();
    await ctx.db
      .insert(matchOverrides)
      .values({ matchId, fieldName: "kickoffTime", reason: "Hall clash", changedBy: "admin" });
    const [booking] = await ctx.db
      .insert(venueBookings)
      .values({
        venueId,
        date: "2026-03-20",
        calculatedStartTime: "18:00:00",
        calculatedEndTime: "21:00:00",
        status: "pending",
      })
      .returning({ id: venueBookings.id });
    await ctx.db.insert(venueBookingMatches).values({ venueBookingId: booking!.id, matchId });

    const result = await getMatchDetail(matchId);

    expect(result!.match.id).toBe(matchId);
    expect(result!.match.overriddenFields).toEqual(["kickoffTime"]);
    expect(result!.match.overrides[0]).toMatchObject({
      fieldName: "kickoffTime",
      reason: "Hall clash",
      changedBy: "admin",
    });
    expect(result!.match.booking).toEqual({
      id: booking!.id,
      status: "pending",
      needsReconfirmation: false,
    });
    expect(result!.match.refereeSlots!.map((s) => s.slotNumber)).toEqual([1, 2, 3]);
    // The overridden field surfaces in the diff tail (computeDiffs runs for real).
    expect(result!.diffs).toEqual([
      {
        field: "kickoffTime",
        label: "Time",
        remoteValue: "19:30:00",
        localValue: "19:30:00",
        status: "synced",
      },
    ]);
  });

  it("emits no diffs for a match with no overrides", async () => {
    const matchId = await seedMatch();

    expect((await getMatchDetail(matchId))!.diffs).toEqual([]);
  });

  it("returns null for a match that does not exist", async () => {
    await seedMatch();

    expect(await getMatchDetail(999_999)).toBeNull();
  });
});

describe("getPublicMatchDetail", () => {
  beforeEach(seedTeams);

  it("returns the match when the own club is home", async () => {
    const matchId = await seedMatch({ home: OWN_A, guest: FOREIGN_X });

    expect((await getPublicMatchDetail(matchId))!.id).toBe(matchId);
  });

  it("returns the match when the own club is guest", async () => {
    const matchId = await seedMatch({ home: FOREIGN_X, guest: OWN_B });

    expect((await getPublicMatchDetail(matchId))!.id).toBe(matchId);
  });

  it("returns null for a match between two foreign clubs", async () => {
    const matchId = await seedMatch({ home: FOREIGN_X, guest: FOREIGN_Y });

    expect(await getPublicMatchDetail(matchId)).toBeNull();
  });

  it("returns null for a match that does not exist", async () => {
    expect(await getPublicMatchDetail(999_999)).toBeNull();
  });
});

describe("getMatchChangeHistory", () => {
  beforeEach(seedTeams);

  it("returns only the addressed match's changes, newest first", async () => {
    const matchId = await seedMatch();
    const otherMatch = await seedMatch();
    await ctx.db.insert(matchChanges).values([
      {
        matchId,
        track: "remote",
        versionNumber: 1,
        fieldName: "kickoffTime",
        oldValue: "18:00",
        newValue: "19:30",
        changedBy: "sync",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      {
        matchId,
        track: "local",
        versionNumber: 2,
        fieldName: "venueId",
        oldValue: null,
        newValue: "5",
        changedBy: "admin",
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
      },
      {
        matchId: otherMatch,
        track: "remote",
        versionNumber: 1,
        fieldName: "homeScore",
        oldValue: null,
        newValue: "78",
        changedBy: "sync",
        createdAt: new Date("2026-03-03T00:00:00.000Z"),
      },
    ]);

    const result = await getMatchChangeHistory(matchId, { limit: 10, offset: 0 });

    expect(result.total).toBe(2);
    expect(result.changes.map((c) => c.fieldName)).toEqual(["venueId", "kickoffTime"]);
    expect(result.changes[0]).toMatchObject({
      track: "local",
      versionNumber: 2,
      oldValue: null,
      newValue: "5",
      changedBy: "admin",
      createdAt: "2026-03-02T00:00:00.000Z",
    });
  });

  it("pages while reporting the unpaged total", async () => {
    const matchId = await seedMatch();
    for (let i = 1; i <= 5; i++) {
      await ctx.db.insert(matchChanges).values({
        matchId,
        track: "remote",
        versionNumber: i,
        fieldName: `field${i}`,
        oldValue: null,
        newValue: String(i),
        changedBy: "sync",
        createdAt: new Date(`2026-03-0${i}T00:00:00.000Z`),
      });
    }

    const page = await getMatchChangeHistory(matchId, { limit: 2, offset: 2 });

    expect(page.total).toBe(5);
    expect(page.changes.map((c) => c.fieldName)).toEqual(["field3", "field2"]);
  });

  it("returns an empty history for a match with no changes", async () => {
    const matchId = await seedMatch();

    expect(await getMatchChangeHistory(matchId, { limit: 10, offset: 0 })).toEqual({
      changes: [],
      total: 0,
    });
  });
});

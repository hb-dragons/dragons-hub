import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { SdkSpielplanMatch, SdkGetGameResponse } from "@dragons/sdk";
import type { LeagueFetchedData } from "./data-fetcher";

// Real Postgres (pglite) with real migrations, the real drizzle operators, the real
// `parseResult`, the real `EVENT_TYPES` and — crucially — the REAL `computeEntityHash`.
//
// The previous mocked-ORM version of this file stubbed `computeEntityHash` to the
// constant "match-hash" and hand-built a fake locked row per test, so the dataHash
// change-detection mechanism CLAUDE.md names as core was not exercised by any of its
// ~150 assertions: deleting the hash comparison, or hashing a different field set,
// left every test green. It also stubbed `eq`/`and`/`inArray` to identity functions,
// so `where(inArray(matches.apiMatchId, ...))` and `where(eq(matches.id, ...))` never
// ran against a query planner.
//
// Here each scenario is driven by running the real sync against a real database:
// sync once to create the row, then sync again with a changed SDK payload and assert
// on the persisted match / version / change / override rows.
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

const mockLogWarn = vi.fn();
vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: (...args: unknown[]) => mockLogWarn(...args),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// The outbox insert itself is covered by the event-publisher's own tests; here we
// only care that the sync publishes the right events with the transaction client.
const mockPublishDomainEvent = vi.fn();
vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: (...args: unknown[]) => mockPublishDomainEvent(...args),
}));

import { syncMatchesFromData, buildMatchEntityName } from "./matches.sync";
import { extractPeriodScores, extractOvertimeDeltas } from "./period-scores";
import { computeEntityHash } from "./hash";
import {
  matches,
  matchOverrides,
  matchRemoteVersions,
  matchChanges,
  leagues,
  teams,
  venues,
} from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

const LEAGUE_DB_ID = 10;
const API_MATCH_ID = 1000;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  dbHolder.ref = ctx.db;
  vi.clearAllMocks();
  mockPublishDomainEvent.mockResolvedValue(undefined);

  await ctx.db.insert(leagues).values({
    id: LEAGUE_DB_ID,
    apiLigaId: 1,
    ligaNr: 1,
    name: "Bezirksliga",
    seasonId: 2025,
    seasonName: "2025/26",
  });
  await ctx.db.insert(teams).values([
    { apiTeamPermanentId: 10, seasonTeamId: 100, teamCompetitionId: 1, name: "Home", clubId: 1 },
    { apiTeamPermanentId: 20, seasonTeamId: 200, teamCompetitionId: 2, name: "Guest", clubId: 2 },
  ]);
  await ctx.db.insert(venues).values([
    { id: 500, apiId: 50, name: "Hall 50" },
    { id: 600, apiId: 60, name: "Hall 60" },
  ]);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

function makeBasicMatch(overrides: Partial<SdkSpielplanMatch> = {}): SdkSpielplanMatch {
  return {
    ligaData: null,
    matchId: API_MATCH_ID,
    matchDay: 1,
    matchNo: 1,
    kickoffDate: "2025-01-15",
    kickoffTime: "18:00",
    homeTeam: {
      teamPermanentId: 10,
      seasonTeamId: 100,
      teamCompetitionId: 1,
      teamname: "Home",
      teamnameSmall: "H",
      clubId: 1,
      verzicht: false,
    },
    guestTeam: {
      teamPermanentId: 20,
      seasonTeamId: 200,
      teamCompetitionId: 2,
      teamname: "Guest",
      teamnameSmall: "G",
      clubId: 2,
      verzicht: false,
    },
    result: "80:70",
    ergebnisbestaetigt: true,
    statisticType: null,
    verzicht: false,
    abgesagt: false,
    matchResult: null,
    matchInfo: null,
    matchBoxscore: null,
    playByPlay: null,
    hasPlayByPlay: null,
    ...overrides,
  };
}

function makeGameDetails(
  overrides: Partial<SdkGetGameResponse["game1"]> = {},
  refereeOverrides: {
    sr1?: Partial<SdkGetGameResponse["sr1"]>;
    sr2?: Partial<SdkGetGameResponse["sr2"]>;
    sr3?: Partial<SdkGetGameResponse["sr3"]>;
  } = {},
): SdkGetGameResponse {
  return {
    game1: {
      spielplanId: 1,
      spielnr: 1,
      spieltag: 1,
      spieldatum: Date.now(),
      spielfeldId: 50,
      // Status/provenance fields the live API returns (SdkGameDetails).
      ergebnisbestaetigt: false,
      verzicht: false,
      abgesagt: false,
      ergebnisVon: "SR",
      dssUseraccountId: null,
      spielortGeandert: false,
      spielzeitGeandert: false,
      liga: null,
      spielleitungList: null,
      sr1Verein: null,
      sr2Verein: null,
      sr1VereinInformiert: null,
      sr2VereinInformiert: null,
      ats: null,
      heimEndstand: 80,
      gastEndstand: 70,
      heimHalbzeitstand: 40,
      gastHalbzeitstand: 35,
      heimV1stand: 20,
      gastV1stand: 18,
      heimV3stand: 60,
      gastV3stand: 55,
      heimV4stand: 80,
      gastV4stand: 70,
      heimOt1stand: -1,
      gastOt1stand: -1,
      heimOt2stand: -1,
      gastOt2stand: -1,
      spielfeld: null,
      heimMannschaftLiga: null as never,
      gastMannschaftLiga: null as never,
      ...overrides,
    },
    sr1: { spielleitung: null, lizenzNr: null, offenAngeboten: false, ...refereeOverrides.sr1 },
    sr2: { spielleitung: null, lizenzNr: null, offenAngeboten: false, ...refereeOverrides.sr2 },
    sr3: { spielleitung: null, lizenzNr: null, offenAngeboten: false, ...refereeOverrides.sr3 },
  };
}

function makeLeagueData(overrides: Partial<LeagueFetchedData> = {}): LeagueFetchedData {
  return {
    leagueApiId: 1,
    leagueDbId: LEAGUE_DB_ID,
    leagueName: "Bezirksliga",
    spielplan: [makeBasicMatch()],
    tabelle: [],
    gameDetails: new Map([[API_MATCH_ID, makeGameDetails()]]),
    ...overrides,
  };
}

/** venueIdLookup as the orchestrator builds it from the seeded venues. */
const VENUE_LOOKUP = new Map([
  [50, 500],
  [60, 600],
]);

async function matchRow(apiMatchId = API_MATCH_ID) {
  const [row] = await ctx.db.select().from(matches).where(eq(matches.apiMatchId, apiMatchId));
  if (!row) throw new Error(`match ${apiMatchId} not found`);
  return row;
}

async function matchRowOrNull(apiMatchId = API_MATCH_ID) {
  const [row] = await ctx.db.select().from(matches).where(eq(matches.apiMatchId, apiMatchId));
  return row ?? null;
}

async function versionRows() {
  return ctx.db.select().from(matchRemoteVersions).orderBy(matchRemoteVersions.versionNumber);
}

async function changeRows() {
  return ctx.db.select().from(matchChanges).orderBy(matchChanges.fieldName);
}

async function overrideRows() {
  return ctx.db.select().from(matchOverrides);
}

/** Create the match by running one real sync, then clear the recorded events. */
async function seedMatch(data: LeagueFetchedData = makeLeagueData()) {
  const result = await syncMatchesFromData([data], VENUE_LOOKUP, 1);
  if (result.created !== 1) {
    throw new Error(`seedMatch expected 1 created, got ${JSON.stringify(result)}`);
  }
  mockPublishDomainEvent.mockClear();
  return matchRow();
}

/** Add local overrides for the seeded match. */
async function addOverrides(matchId: number, ...fieldNames: string[]) {
  await ctx.db
    .insert(matchOverrides)
    .values(fieldNames.map((fieldName) => ({ matchId, fieldName })));
}

/** Force a hash mismatch without changing any snapshot field. */
async function corruptStoredHash(matchId: number) {
  await ctx.db
    .update(matches)
    .set({ remoteDataHash: "stale-hash" })
    .where(eq(matches.id, matchId));
}

/** Every event type published during the last sync, in order. */
function publishedEventTypes(): string[] {
  return mockPublishDomainEvent.mock.calls.map(
    (call: unknown[]) => (call[0] as Record<string, unknown>).type as string,
  );
}

/** Swap getDb() for a proxy that overrides one method and delegates the rest. */
function overrideDbMethod(name: string, impl: unknown) {
  const real = ctx.db as unknown as Record<string | symbol, unknown>;
  dbHolder.ref = new Proxy(
    {},
    { get: (_t, prop) => (prop === name ? impl : real[prop]) },
  );
}

describe("syncMatchesFromData — create path", () => {
  it("skips a league without leagueDbId", async () => {
    const result = await syncMatchesFromData(
      [makeLeagueData({ leagueDbId: null })],
      VENUE_LOOKUP,
      null,
    );

    expect(result.total).toBe(0);
    expect(result.errors[0]).toContain("No DB ID");
    expect(await matchRowOrNull()).toBeNull();
  });

  it("skips a match without matchId", async () => {
    const result = await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch({ matchId: 0 })] })],
      VENUE_LOOKUP,
      null,
    );

    expect(result.total).toBe(0);
    expect(result.errors[0]).toContain("without matchId");
  });

  it.each([
    ["home", { homeTeam: null }],
    ["guest", { guestTeam: null }],
  ])("skips a match without a %s team", async (_label, patch) => {
    const result = await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch(patch)] })],
      VENUE_LOOKUP,
      null,
    );

    expect(result.skipped).toBe(1);
    expect(await matchRowOrNull()).toBeNull();
  });

  it("persists a new match with delta (not cumulative) period scores", async () => {
    const result = await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, 1);

    expect(result.created).toBe(1);
    expect(result.total).toBe(1);

    const row = await matchRow();
    expect(row.periodFormat).toBe("quarters");
    expect(row.homeQ1).toBe(20);
    expect(row.guestQ1).toBe(18);
    expect(row.homeQ2).toBe(20); // halftime(40) - Q1(20)
    expect(row.homeQ3).toBe(20); // V3(60) - halftime(40)
    expect(row.homeQ4).toBe(20); // V4(80) - V3(60)
    expect(row.leagueId).toBe(LEAGUE_DB_ID);
    expect(row.homeTeamApiId).toBe(10);
    expect(row.guestTeamApiId).toBe(20);
    expect(row.currentRemoteVersion).toBe(1);
    expect(row.currentLocalVersion).toBe(0);
    expect(row.lastRemoteSync).not.toBeNull();
  });

  it("stores the hash of the documented snapshot field set, not of the whole row", async () => {
    await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, 1);

    const row = await matchRow();
    expect(row.remoteDataHash).toBe(
      computeEntityHash({
        matchNo: 1,
        matchDay: 1,
        kickoffDate: "2025-01-15",
        kickoffTime: "18:00",
        homeTeamApiId: 10,
        guestTeamApiId: 20,
        isConfirmed: true,
        isForfeited: false,
        isCancelled: false,
        homeScore: 80,
        guestScore: 70,
        homeHalftimeScore: 40,
        guestHalftimeScore: 35,
        periodFormat: "quarters",
        homeQ1: 20,
        guestQ1: 18,
        homeQ2: 20,
        guestQ2: 17,
        homeQ3: 20,
        guestQ3: 20,
        homeQ4: 20,
        guestQ4: 15,
        homeOt1: null,
        guestOt1: null,
        homeOt2: null,
        guestOt2: null,
        sr1Open: false,
        sr2Open: false,
        sr3Open: false,
      }),
    );
  });

  it("writes the initial remote version row with the same hash as the match", async () => {
    await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, 7);

    const row = await matchRow();
    const versions = await versionRows();
    expect(versions).toHaveLength(1);
    expect(versions[0]!.matchId).toBe(row.id);
    expect(versions[0]!.versionNumber).toBe(1);
    expect(versions[0]!.syncRunId).toBe(7);
    expect(versions[0]!.dataHash).toBe(row.remoteDataHash);
    expect(versions[0]!.snapshot).toMatchObject({ matchNo: 1, homeScore: 80, guestScore: 70 });
    expect(await changeRows()).toHaveLength(0);
  });

  it("publishes match.created with the transaction client (atomic with the insert)", async () => {
    await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, 1);

    const row = await matchRow();
    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "match.created",
        entityId: row.id,
        entityName: "#1 Home vs Guest (Bezirksliga)",
        deepLinkPath: `/admin/matches/${row.id}`,
        payload: expect.objectContaining({
          matchNo: 1,
          homeTeam: "Home",
          guestTeam: "Guest",
          leagueId: LEAGUE_DB_ID,
          teamIds: [10, 20],
        }),
      }),
      expect.objectContaining({ insert: expect.any(Function) }),
    );
  });

  it("resolves the internal venue id from the lookup", async () => {
    await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, null);

    expect((await matchRow()).venueId).toBe(500);
  });

  it("leaves venueId null when the venue is not in the lookup", async () => {
    await syncMatchesFromData([makeLeagueData()], new Map(), null);

    expect((await matchRow()).venueId).toBeNull();
  });

  it("records a per-match failure when the write is rejected by the database", async () => {
    // venueIdLookup points at a venue id that does not exist → FK violation.
    const result = await syncMatchesFromData(
      [makeLeagueData()],
      new Map([[50, 9_999]]),
      null,
    );

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Failed to sync match 1000");
    expect(await matchRowOrNull()).toBeNull();
  });

  it("handles a non-Error per-match exception", async () => {
    overrideDbMethod("transaction", () => {
      throw "string error";
    });

    const result = await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, null);

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("creates a match without game details", async () => {
    const result = await syncMatchesFromData(
      [makeLeagueData({ gameDetails: new Map() })],
      VENUE_LOOKUP,
      null,
    );

    expect(result.created).toBe(1);
    const row = await matchRow();
    expect(row.venueId).toBeNull();
    expect(row.homeHalftimeScore).toBeNull();
    expect(row.periodFormat).toBeNull();
  });

  it("falls back to the parsed result string when there are no game details", async () => {
    await syncMatchesFromData(
      [
        makeLeagueData({
          spielplan: [makeBasicMatch({ result: "63:61" })],
          gameDetails: new Map(),
        }),
      ],
      VENUE_LOOKUP,
      null,
    );

    const row = await matchRow();
    expect(row.homeScore).toBe(63);
    expect(row.guestScore).toBe(61);
  });

  it("keeps a forfeit result of \"0:20\" as 0, not NULL", async () => {
    // `parseResult` used `parseInt(...) || null`, so the 0 of a forfeit became
    // null and the match persisted as {home: null, guest: 20}.
    await syncMatchesFromData(
      [
        makeLeagueData({
          spielplan: [makeBasicMatch({ result: "0:20", verzicht: true })],
          gameDetails: new Map(),
        }),
      ],
      VENUE_LOOKUP,
      null,
    );

    const row = await matchRow();
    expect(row.homeScore).toBe(0);
    expect(row.guestScore).toBe(20);
  });

  it("stores negative SDK scores as NULL", async () => {
    await syncMatchesFromData(
      [
        makeLeagueData({
          spielplan: [makeBasicMatch({ result: null })],
          gameDetails: new Map([
            [
              API_MATCH_ID,
              makeGameDetails({
                heimEndstand: -1,
                gastEndstand: -1,
                heimHalbzeitstand: -1,
                gastHalbzeitstand: -1,
              }),
            ],
          ]),
        }),
      ],
      VENUE_LOOKUP,
      null,
    );

    const row = await matchRow();
    expect(row.homeScore).toBeNull();
    expect(row.guestScore).toBeNull();
    expect(row.homeHalftimeScore).toBeNull();
    expect(row.guestHalftimeScore).toBeNull();
  });

  it("stores overtime scores as deltas from the previous period", async () => {
    const result = await syncMatchesFromData(
      [
        makeLeagueData({
          gameDetails: new Map([
            [
              API_MATCH_ID,
              makeGameDetails({
                heimV4stand: 80,
                gastV4stand: 70,
                heimOt1stand: 90,
                gastOt1stand: 78,
                heimOt2stand: 100,
                gastOt2stand: 85,
              }),
            ],
          ]),
        }),
      ],
      VENUE_LOOKUP,
      null,
    );

    expect(result.created).toBe(1);
    const row = await matchRow();
    expect(row.homeOt1).toBe(10); // 90 - 80
    expect(row.guestOt1).toBe(8); // 78 - 70
    expect(row.homeOt2).toBe(10); // 100 - 90
    expect(row.guestOt2).toBe(7); // 85 - 78
  });

  it("derives Q4 from the endstand when V4stand is -1 and no overtime was played", async () => {
    await syncMatchesFromData(
      [
        makeLeagueData({
          gameDetails: new Map([
            [
              API_MATCH_ID,
              makeGameDetails({
                heimEndstand: 60,
                gastEndstand: 80,
                heimHalbzeitstand: 36,
                gastHalbzeitstand: 35,
                heimV1stand: 13,
                gastV1stand: 17,
                heimV3stand: 50,
                gastV3stand: 61,
                heimV4stand: -1,
                gastV4stand: -1,
              }),
            ],
          ]),
        }),
      ],
      VENUE_LOOKUP,
      null,
    );

    const row = await matchRow();
    expect(row.periodFormat).toBe("quarters");
    expect(row.homeQ1).toBe(13);
    expect(row.guestQ1).toBe(17);
    expect(row.homeQ2).toBe(23); // halftime(36) - Q1(13)
    expect(row.guestQ2).toBe(18);
    expect(row.homeQ3).toBe(14); // V3(50) - halftime(36)
    expect(row.guestQ3).toBe(26);
    expect(row.homeQ4).toBe(10); // endstand(60) - V3(50)
    expect(row.guestQ4).toBe(19);
  });

  it("does not derive Q4 from the endstand when overtime was played", async () => {
    await syncMatchesFromData(
      [
        makeLeagueData({
          gameDetails: new Map([
            [
              API_MATCH_ID,
              makeGameDetails({
                heimEndstand: 90,
                gastEndstand: 85,
                heimHalbzeitstand: 40,
                gastHalbzeitstand: 38,
                heimV1stand: 20,
                gastV1stand: 18,
                heimV3stand: 60,
                gastV3stand: 58,
                heimV4stand: -1,
                gastV4stand: -1,
                heimOt1stand: 10,
                gastOt1stand: 5,
              }),
            ],
          ]),
        }),
      ],
      VENUE_LOOKUP,
      null,
    );

    const row = await matchRow();
    expect(row.homeQ4).toBeNull();
    expect(row.guestQ4).toBeNull();
    // Regulation end is unknown, so the OT delta cannot be computed either.
    expect(row.homeOt1).toBeNull();
  });

  it("stores the sr*Open flags from offenAngeboten", async () => {
    await syncMatchesFromData(
      [
        makeLeagueData({
          gameDetails: new Map([
            [
              API_MATCH_ID,
              makeGameDetails({}, { sr1: { offenAngeboten: true }, sr3: { offenAngeboten: true } }),
            ],
          ]),
        }),
      ],
      VENUE_LOOKUP,
      null,
    );

    const row = await matchRow();
    expect(row.sr1Open).toBe(true);
    expect(row.sr2Open).toBe(false);
    expect(row.sr3Open).toBe(true);
  });

  it("defaults the sr*Open flags to false when there are no game details", async () => {
    await syncMatchesFromData(
      [makeLeagueData({ gameDetails: new Map() })],
      VENUE_LOOKUP,
      null,
    );

    const row = await matchRow();
    expect(row.sr1Open).toBe(false);
    expect(row.sr2Open).toBe(false);
    expect(row.sr3Open).toBe(false);
  });

  it("uses 0 as the matchDay fallback when the SDK sends a falsy value", async () => {
    await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch({ matchDay: null as unknown as number })] })],
      VENUE_LOOKUP,
      null,
    );

    expect((await matchRow()).matchDay).toBe(0);
  });

  it("counts the match as created but writes no version row when the insert returns nothing", async () => {
    // Defensive `if (newMatch)` branch: a real INSERT ... RETURNING always yields a
    // row, so this one path can only be reached with a stubbed transaction.
    overrideDbMethod("transaction", async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ insert: () => ({ values: () => ({ returning: async () => [] }) }) }),
    );

    const result = await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, 1);

    expect(result.created).toBe(1);
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("includes durationMs", async () => {
    const result = await syncMatchesFromData([], VENUE_LOOKUP, null);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("syncMatchesFromData — hash-based skip", () => {
  it("skips an unchanged match on re-sync without touching the row", async () => {
    const created = await seedMatch();

    const result = await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, 2);

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    const row = await matchRow();
    expect(row.updatedAt.getTime()).toBe(created.updatedAt.getTime());
    expect(row.currentRemoteVersion).toBe(1);
    expect(await versionRows()).toHaveLength(1);
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("does not skip when a hashed field changed, even by one point", async () => {
    await seedMatch();

    const result = await syncMatchesFromData(
      [
        makeLeagueData({
          spielplan: [makeBasicMatch({ result: "81:70" })],
          gameDetails: new Map([[API_MATCH_ID, makeGameDetails({ heimEndstand: 81 })]]),
        }),
      ],
      VENUE_LOOKUP,
      2,
    );

    expect(result.updated).toBe(1);
    expect((await matchRow()).homeScore).toBe(81);
  });

  it("takes the transaction path but persists nothing when the hash is stale and no field changed", async () => {
    const created = await seedMatch();
    await corruptStoredHash(created.id);

    const result = await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, 2);

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    const row = await matchRow();
    // Hash is repaired, but no new version and no audit rows (issue #49).
    expect(row.remoteDataHash).toBe(created.remoteDataHash);
    expect(row.currentRemoteVersion).toBe(1);
    expect(await versionRows()).toHaveLength(1);
    expect(await changeRows()).toHaveLength(0);
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("treats '18:00' and the stored '18:00:00' as the same kickoff time", async () => {
    const created = await seedMatch();
    await corruptStoredHash(created.id);
    expect(created.kickoffTime).toBe("18:00:00");

    const result = await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch({ kickoffTime: "18:00" })] })],
      VENUE_LOOKUP,
      2,
    );

    expect(result.skipped).toBe(1);
    expect(await changeRows()).toHaveLength(0);
    expect((await matchRow()).currentRemoteVersion).toBe(1);
  });
});

describe("syncMatchesFromData — update path", () => {
  it("persists the change, bumps the version and writes one audit row per changed field", async () => {
    const created = await seedMatch();

    const result = await syncMatchesFromData(
      [
        makeLeagueData({
          spielplan: [makeBasicMatch({ result: "90:85", ergebnisbestaetigt: false })],
          gameDetails: new Map([
            [API_MATCH_ID, makeGameDetails({ heimEndstand: 90, gastEndstand: 85, heimV4stand: 90, gastV4stand: 85 })],
          ]),
        }),
      ],
      VENUE_LOOKUP,
      2,
    );

    expect(result.updated).toBe(1);

    const row = await matchRow();
    expect(row.id).toBe(created.id);
    expect(row.homeScore).toBe(90);
    expect(row.guestScore).toBe(85);
    expect(row.isConfirmed).toBe(false);
    expect(row.currentRemoteVersion).toBe(2);
    expect(row.remoteDataHash).not.toBe(created.remoteDataHash);

    const versions = await versionRows();
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2]);
    expect(versions[1]!.syncRunId).toBe(2);
    expect(versions[1]!.dataHash).toBe(row.remoteDataHash);

    const changes = await changeRows();
    expect(changes.map((c) => c.fieldName).sort()).toEqual([
      "guestQ4",
      "guestScore",
      "homeQ4",
      "homeScore",
      "isConfirmed",
    ]);
    expect(changes.every((c) => c.track === "remote" && c.versionNumber === 2)).toBe(true);
    const homeScoreChange = changes.find((c) => c.fieldName === "homeScore")!;
    expect(homeScoreChange.oldValue).toBe("80");
    expect(homeScoreChange.newValue).toBe("90");
  });

  it("records a venueId change as its own audit row", async () => {
    await seedMatch();

    const result = await syncMatchesFromData(
      [
        makeLeagueData({
          // venueApiId is not part of the hash, so a hashed field has to move as
          // well for the update path to run at all — see the "venue-only" test below.
          spielplan: [makeBasicMatch({ matchNo: 42 })],
          gameDetails: new Map([[API_MATCH_ID, makeGameDetails({ spielfeldId: 60 })]]),
        }),
      ],
      VENUE_LOOKUP,
      2,
    );

    expect(result.updated).toBe(1);
    expect((await matchRow()).venueId).toBe(600);
    const venueChange = (await changeRows()).find((c) => c.fieldName === "venueId");
    expect(venueChange).toMatchObject({ oldValue: "500", newValue: "600" });
  });

  it("skips a venue-only change, because venueApiId is outside the hashed field set", async () => {
    const created = await seedMatch();

    const result = await syncMatchesFromData(
      [
        makeLeagueData({
          gameDetails: new Map([[API_MATCH_ID, makeGameDetails({ spielfeldId: 60 })]]),
        }),
      ],
      VENUE_LOOKUP,
      2,
    );

    // Documents current behaviour: `snapshotToHashData` omits venueApiId, so the
    // O(1) hash skip fires before the venue diff is ever computed and the moved
    // venue is not persisted until some hashed field also changes.
    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect((await matchRow()).venueId).toBe(created.venueId);
  });

  it("clears venueId when details are present but carry no venue", async () => {
    await seedMatch();

    await syncMatchesFromData(
      [
        makeLeagueData({
          spielplan: [makeBasicMatch({ matchNo: 42 })],
          gameDetails: new Map([[API_MATCH_ID, makeGameDetails({ spielfeldId: 0 })]]),
        }),
      ],
      VENUE_LOOKUP,
      2,
    );

    expect((await matchRow()).venueId).toBeNull();
  });

  it("keeps the stored venue and detail fields when the detail fetch produced nothing", async () => {
    const created = await seedMatch();
    // A real basic-data change so the update path runs at all.
    const result = await syncMatchesFromData(
      [
        makeLeagueData({
          spielplan: [makeBasicMatch({ abgesagt: true })],
          gameDetails: new Map(),
        }),
      ],
      VENUE_LOOKUP,
      2,
    );

    expect(result.updated).toBe(1);
    const row = await matchRow();
    expect(row.isCancelled).toBe(true);
    expect(row.venueId).toBe(created.venueId);
    expect(row.homeHalftimeScore).toBe(40);
    expect(row.guestHalftimeScore).toBe(35);
    expect(row.periodFormat).toBe("quarters");
    expect(row.homeQ1).toBe(20);
    expect((await changeRows()).map((c) => c.fieldName)).toEqual(["isCancelled"]);
  });

  it("does not write the match when the row vanishes before the lock is taken", async () => {
    const created = await seedMatch();
    // Delete the row inside the transaction, before the FOR UPDATE select runs.
    const real = ctx.db;
    overrideDbMethod("transaction", (cb: (tx: unknown) => Promise<unknown>) =>
      real.transaction(async (tx) => {
        await tx.delete(matches).where(eq(matches.id, created.id));
        return cb(tx);
      }),
    );

    const result = await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch({ abgesagt: true })] })],
      VENUE_LOOKUP,
      2,
    );

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(await matchRowOrNull()).toBeNull();
  });
});

describe("syncMatchesFromData — local overrides", () => {
  it("leaves an overridden field untouched while updating the rest", async () => {
    const created = await seedMatch();
    await addOverrides(created.id, "kickoffDate");
    await ctx.db
      .update(matches)
      .set({ kickoffDate: "2025-02-01" })
      .where(eq(matches.id, created.id));

    await syncMatchesFromData(
      [
        makeLeagueData({
          spielplan: [makeBasicMatch({ matchNo: 42, kickoffDate: "2025-01-15" })],
        }),
      ],
      VENUE_LOOKUP,
      2,
    );

    const row = await matchRow();
    expect(row.kickoffDate).toBe("2025-02-01"); // local value survives
    expect(row.matchNo).toBe(42); // everything else still syncs
    expect((await changeRows()).map((c) => c.fieldName)).not.toContain("kickoffDate");
  });

  it("auto-releases the override once remote catches up with the local value", async () => {
    const created = await seedMatch();
    await addOverrides(created.id, "kickoffDate");
    expect(await overrideRows()).toHaveLength(1);

    await syncMatchesFromData(
      [
        makeLeagueData({
          // Remote now agrees with what is stored, plus an unrelated change so the
          // update path actually runs.
          spielplan: [makeBasicMatch({ matchNo: 42, kickoffDate: "2025-01-15" })],
        }),
      ],
      VENUE_LOOKUP,
      2,
    );

    expect(await overrideRows()).toHaveLength(0);
    expect(publishedEventTypes()).not.toContain("override.conflict");
  });

  it("publishes override.conflict (and keeps the override) when remote diverges", async () => {
    const created = await seedMatch();
    await addOverrides(created.id, "kickoffDate");
    await ctx.db
      .update(matches)
      .set({ kickoffDate: "2025-02-01" })
      .where(eq(matches.id, created.id));

    await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch({ kickoffDate: "2025-03-09" })] })],
      VENUE_LOOKUP,
      2,
    );

    expect(await overrideRows()).toHaveLength(1);
    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "override.conflict",
        entityId: created.id,
        payload: expect.objectContaining({
          fieldName: "kickoffDate",
          localValue: "2025-02-01",
          newRemoteValue: "2025-03-09",
        }),
      }),
      expect.anything(),
    );
  });

  it("survives a failure to emit the override.conflict event", async () => {
    const created = await seedMatch();
    await addOverrides(created.id, "kickoffDate");
    await ctx.db
      .update(matches)
      .set({ kickoffDate: "2025-02-01" })
      .where(eq(matches.id, created.id));
    mockPublishDomainEvent.mockRejectedValue(new Error("outbox down"));

    const result = await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch({ kickoffDate: "2025-03-09" })] })],
      VENUE_LOOKUP,
      2,
    );

    expect(result.failed).toBe(0);
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: "kickoffDate" }),
      "Failed to emit override.conflict event",
    );
  });

  it("does not preserve an overridden detail field when details are unavailable", async () => {
    const created = await seedMatch();
    await addOverrides(created.id, "homeHalftimeScore", "homeQ1", "periodFormat");
    await ctx.db
      .update(matches)
      .set({ homeHalftimeScore: 45, homeQ1: 25 })
      .where(eq(matches.id, created.id));

    await syncMatchesFromData(
      [
        makeLeagueData({
          spielplan: [makeBasicMatch({ abgesagt: true })],
          gameDetails: new Map(),
        }),
      ],
      VENUE_LOOKUP,
      2,
    );

    const row = await matchRow();
    // Overridden: locally-set values kept as-is.
    expect(row.homeHalftimeScore).toBe(45);
    expect(row.homeQ1).toBe(25);
    // Not overridden: preserved from the stored row rather than regressed to null.
    expect(row.guestHalftimeScore).toBe(35);
    expect(row.guestQ1).toBe(18);
  });
});

describe("syncMatchesFromData — sync logger", () => {
  it("logs the created action with the built entity name", async () => {
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, null, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "created",
        entityType: "match",
        entityId: "1000",
        entityName: "#1 Home vs Guest (Bezirksliga)",
      }),
    );
  });

  it("logs the skipped action when a team is missing", async () => {
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch({ homeTeam: null })] })],
      VENUE_LOOKUP,
      null,
      mockLogger as never,
    );

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "skipped",
        entityName: "#1 (Bezirksliga)",
        message: "Missing home or guest team",
      }),
    );
  });

  it("logs the skipped action on a hash match", async () => {
    await seedMatch();
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, null, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "skipped", message: "No changes detected" }),
    );
  });

  it("logs the updated action when effective changes exist", async () => {
    await seedMatch();
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch({ matchNo: 42 })] })],
      VENUE_LOOKUP,
      2,
      mockLogger as never,
    );

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "updated",
        entityName: "#42 Home vs Guest (Bezirksliga)",
      }),
    );
  });

  it("logs the skipped action when the hash moved but nothing effectively changed", async () => {
    const created = await seedMatch();
    await corruptStoredHash(created.id);
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, 2, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "skipped",
        message: "Hash updated, no effective data changes",
      }),
    );
  });

  it("logs the failed action when the write is rejected", async () => {
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData(
      [makeLeagueData()],
      new Map([[50, 9_999]]),
      null,
      mockLogger as never,
    );

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "failed",
        entityName: "#1 Home vs Guest (Bezirksliga)",
      }),
    );
  });
});

describe("classifyMatchChanges via syncMatchesFromData", () => {
  it.each([
    ["match.schedule.changed", { kickoffDate: "2025-02-20" }],
    ["match.schedule.changed", { kickoffTime: "20:00" }],
    ["match.cancelled", { abgesagt: true }],
    ["match.forfeited", { verzicht: true }],
  ])("emits %s", async (expected, patch) => {
    await seedMatch();

    await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch(patch)] })],
      VENUE_LOOKUP,
      2,
    );

    expect(publishedEventTypes()).toContain(expected);
  });

  it("emits match.result_entered when the score goes from null to a value", async () => {
    await seedMatch(
      makeLeagueData({
        spielplan: [makeBasicMatch({ result: null })],
        gameDetails: new Map([
          [API_MATCH_ID, makeGameDetails({ heimEndstand: -1, gastEndstand: -1 })],
        ]),
      }),
    );

    await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, 2);

    expect(publishedEventTypes()).toContain("match.result_entered");
    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "match.result_entered",
        payload: expect.objectContaining({ homeScore: 80, guestScore: 70 }),
      }),
      expect.anything(),
    );
  });

  it("emits match.result_changed with old and new scores", async () => {
    await seedMatch();

    await syncMatchesFromData(
      [
        makeLeagueData({
          spielplan: [makeBasicMatch({ result: "90:85" })],
          gameDetails: new Map([
            [API_MATCH_ID, makeGameDetails({ heimEndstand: 90, gastEndstand: 85 })],
          ]),
        }),
      ],
      VENUE_LOOKUP,
      2,
    );

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "match.result_changed",
        payload: expect.objectContaining({
          oldHomeScore: 80,
          oldGuestScore: 70,
          newHomeScore: 90,
          newGuestScore: 85,
        }),
      }),
      expect.anything(),
    );
  });

  it("emits match.venue.changed with the old and new internal venue ids", async () => {
    await seedMatch();

    await syncMatchesFromData(
      [
        makeLeagueData({
          spielplan: [makeBasicMatch({ matchNo: 42 })],
          gameDetails: new Map([[API_MATCH_ID, makeGameDetails({ spielfeldId: 60 })]]),
        }),
      ],
      VENUE_LOOKUP,
      2,
    );

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "match.venue.changed",
        payload: expect.objectContaining({ oldVenueId: 500, newVenueId: 600 }),
      }),
      expect.anything(),
    );
  });

  it("does not emit a score event when cancellation is the only change", async () => {
    await seedMatch();

    await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch({ abgesagt: true })] })],
      VENUE_LOOKUP,
      2,
    );

    const types = publishedEventTypes();
    expect(types).not.toContain("match.result_entered");
    expect(types).not.toContain("match.result_changed");
  });

  it("emits multiple events when schedule and result change together", async () => {
    await seedMatch(
      makeLeagueData({
        spielplan: [makeBasicMatch({ result: null })],
        gameDetails: new Map([
          [API_MATCH_ID, makeGameDetails({ heimEndstand: -1, gastEndstand: -1 })],
        ]),
      }),
    );

    await syncMatchesFromData(
      [
        makeLeagueData({
          spielplan: [makeBasicMatch({ kickoffDate: "2025-03-01", result: "90:85" })],
          gameDetails: new Map([
            [API_MATCH_ID, makeGameDetails({ heimEndstand: 90, gastEndstand: 85 })],
          ]),
        }),
      ],
      VENUE_LOOKUP,
      2,
    );

    const types = publishedEventTypes();
    expect(types).toContain("match.schedule.changed");
    expect(types).toContain("match.result_entered");
  });

  it("publishes match.* events with the transaction client (atomic with the row write)", async () => {
    await seedMatch();

    await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch({ kickoffDate: "2025-02-20" })] })],
      VENUE_LOOKUP,
      2,
    );

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "match.schedule.changed" }),
      expect.objectContaining({ insert: expect.any(Function), update: expect.any(Function) }),
    );
  });

  it("still persists the match when publishing a match event fails", async () => {
    await seedMatch();
    mockPublishDomainEvent.mockRejectedValue(new Error("outbox down"));

    const result = await syncMatchesFromData(
      [makeLeagueData({ spielplan: [makeBasicMatch({ kickoffDate: "2025-02-20" })] })],
      VENUE_LOOKUP,
      2,
    );

    expect(result.updated).toBe(1);
    expect((await matchRow()).kickoffDate).toBe("2025-02-20");
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "match.schedule.changed" }),
      "Failed to emit match event",
    );
  });

  it("still creates the match when publishing match.created fails", async () => {
    mockPublishDomainEvent.mockRejectedValue(new Error("outbox down"));

    const result = await syncMatchesFromData([makeLeagueData()], VENUE_LOOKUP, 1);

    expect(result.created).toBe(1);
    expect(await matchRowOrNull()).not.toBeNull();
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Failed to emit match.created event",
    );
  });
});

describe("extractPeriodScores", () => {
  it("returns null scores for undefined game", () => {
    const scores = extractPeriodScores(undefined);
    expect(scores.periodFormat).toBeNull();
    expect(scores.homeQ1).toBeNull();
  });

  it("returns null periodFormat when all quarter values are invalid", () => {
    const game = makeGameDetails({
      heimV1stand: -1,
      gastV1stand: -1,
      heimHalbzeitstand: -1,
      gastHalbzeitstand: -1,
      heimV3stand: -1,
      gastV3stand: -1,
      heimV4stand: -1,
      gastV4stand: -1,
      heimEndstand: -1,
      gastEndstand: -1,
      heimOt1stand: -1,
      gastOt1stand: -1,
    }).game1;

    const scores = extractPeriodScores(game);
    expect(scores.periodFormat).toBeNull();
    expect(scores.homeQ1).toBeNull();
    expect(scores.guestQ4).toBeNull();
  });

  it("extracts standard quarter deltas", () => {
    const game = makeGameDetails({
      heimV1stand: 20,
      gastV1stand: 18,
      heimHalbzeitstand: 40,
      gastHalbzeitstand: 35,
      heimV3stand: 60,
      gastV3stand: 55,
      heimV4stand: 80,
      gastV4stand: 70,
    }).game1;

    const scores = extractPeriodScores(game);

    expect(scores.periodFormat).toBe("quarters");
    expect(scores.homeQ1).toBe(20);
    expect(scores.homeQ2).toBe(20); // 40 - 20
    expect(scores.homeQ3).toBe(20); // 60 - 40
    expect(scores.homeQ4).toBe(20); // 80 - 60
  });

  it("does not detect achtel when V4stand equals Endstand", () => {
    const game = makeGameDetails({
      heimV1stand: 20,
      gastV1stand: 18,
      heimHalbzeitstand: 40,
      gastHalbzeitstand: 35,
      heimV3stand: 60,
      gastV3stand: 55,
      heimV4stand: 80,
      gastV4stand: 70,
      heimEndstand: 80,
      gastEndstand: 70,
    }).game1;

    const scores = extractPeriodScores(game);
    expect(scores.periodFormat).toBe("quarters");
  });

  it("returns null period scores when V5-V8 are present (achtel game)", () => {
    const game = makeGameDetails({
      heimV1stand: 10,
      gastV1stand: 8,
      heimV2stand: 20,
      gastV2stand: 18,
      heimV3stand: 30,
      gastV3stand: 28,
      heimV4stand: 40,
      gastV4stand: 38,
      heimV5stand: 50,
      gastV5stand: 48,
      heimV6stand: 60,
      gastV6stand: 58,
      heimV7stand: 70,
      gastV7stand: 68,
      heimV8stand: 80,
      gastV8stand: 78,
    }).game1;

    const scores = extractPeriodScores(game);
    expect(scores.periodFormat).toBeNull();
    expect(scores.homeQ1).toBeNull();
    expect(scores.guestQ1).toBeNull();
    expect(scores.homeQ4).toBeNull();
    expect(scores.guestQ4).toBeNull();
  });

  it("treats V4 != Endstand as quarters when overtime is present", () => {
    const game = makeGameDetails({
      heimV1stand: 20,
      gastV1stand: 18,
      heimHalbzeitstand: 40,
      gastHalbzeitstand: 35,
      heimV3stand: 60,
      gastV3stand: 55,
      heimV4stand: 80,
      gastV4stand: 80,
      heimEndstand: 90,
      gastEndstand: 85,
      heimOt1stand: 90,
      gastOt1stand: 85,
    }).game1;

    const scores = extractPeriodScores(game);
    expect(scores.periodFormat).toBe("quarters");
    expect(scores.homeQ1).toBe(20);
    expect(scores.homeQ4).toBe(20); // 80 - 60
    expect(scores.guestQ4).toBe(25); // 80 - 55
  });
});

describe("buildMatchEntityName", () => {
  it("includes match number and full team names", () => {
    const match = makeBasicMatch({ matchNo: 42 });
    expect(buildMatchEntityName(match)).toBe("#42 Home vs Guest");
  });

  it("includes league name from parameter", () => {
    const match = makeBasicMatch({ matchNo: 7 });
    expect(buildMatchEntityName(match, "Bezirksliga")).toBe("#7 Home vs Guest (Bezirksliga)");
  });

  it("falls back to ligaData when league name parameter is null", () => {
    const match = makeBasicMatch({
      matchNo: 7,
      ligaData: {
        seasonId: 1, seasonName: "2024/25", actualMatchDay: null,
        ligaId: 100, liganame: "Kreisliga", liganr: 1,
        skName: "", skNameSmall: "", skEbeneId: 1, skEbeneName: "",
        akName: "", geschlechtId: 1, geschlecht: "", verbandId: 1, verbandName: "",
        bezirknr: null, bezirkName: null, kreisnr: null, kreisname: null,
        statisticType: null, vorabliga: false, tableExists: false, crossTableExists: false,
      },
    });
    expect(buildMatchEntityName(match, null)).toBe("#7 Home vs Guest (Kreisliga)");
  });

  it("omits teams when both are null", () => {
    const match = makeBasicMatch({ matchNo: 3, homeTeam: null, guestTeam: null });
    expect(buildMatchEntityName(match)).toBe("#3");
  });

  it("omits teams when one is null", () => {
    const match = makeBasicMatch({ matchNo: 3, homeTeam: null });
    expect(buildMatchEntityName(match)).toBe("#3");
  });
});

describe("extractOvertimeDeltas", () => {
  it("returns null deltas for undefined game", () => {
    const periodScores = extractPeriodScores(undefined);
    const deltas = extractOvertimeDeltas(undefined, periodScores);
    expect(deltas.homeOt1).toBeNull();
    expect(deltas.guestOt1).toBeNull();
  });

  it("computes OT deltas from regulation end", () => {
    const game = makeGameDetails({
      heimV4stand: 80,
      gastV4stand: 70,
      heimOt1stand: 90,
      gastOt1stand: 78,
      heimOt2stand: -1,
      gastOt2stand: -1,
    }).game1;

    const periodScores = extractPeriodScores(game);
    const deltas = extractOvertimeDeltas(game, periodScores);

    // OT1 delta = 90 - 80 = 10
    expect(deltas.homeOt1).toBe(10);
    expect(deltas.guestOt1).toBe(8);
    expect(deltas.homeOt2).toBeNull();
  });

  it("returns null when no overtime", () => {
    const game = makeGameDetails().game1;

    const periodScores = extractPeriodScores(game);
    const deltas = extractOvertimeDeltas(game, periodScores);

    expect(deltas.homeOt1).toBeNull();
    expect(deltas.guestOt1).toBeNull();
  });

  it("returns null OT when period scores are null (achtel game skipped)", () => {
    const game = makeGameDetails({
      heimV5stand: 50,
      gastV5stand: 48,
      heimOt1stand: 90,
      gastOt1stand: 86,
    }).game1;

    const periodScores = extractPeriodScores(game);
    expect(periodScores.periodFormat).toBeNull();

    const deltas = extractOvertimeDeltas(game, periodScores);
    expect(deltas.homeOt1).toBeNull();
    expect(deltas.guestOt1).toBeNull();
  });
});

describe("extractPeriodScores - V2stand fallback", () => {
  it("uses V2stand instead of halftime when V2stand is available", () => {
    const game = makeGameDetails({
      heimV1stand: 15,
      gastV1stand: 12,
      heimV2stand: 30,
      gastV2stand: 25,
      heimHalbzeitstand: 30,
      gastHalbzeitstand: 25,
      heimV3stand: 50,
      gastV3stand: 40,
      heimV4stand: 70,
      gastV4stand: 55,
    }).game1;

    const scores = extractPeriodScores(game);

    expect(scores.periodFormat).toBe("quarters");
    expect(scores.homeQ1).toBe(15);
    expect(scores.guestQ1).toBe(12);
    // Q2 uses V2stand (30) - V1stand (15) = 15
    expect(scores.homeQ2).toBe(15);
    expect(scores.guestQ2).toBe(13);
  });

  it("prefers V2stand over halftime when both differ", () => {
    // If V2stand is present it takes priority over Halbzeitstand
    const game = makeGameDetails({
      heimV1stand: 10,
      gastV1stand: 8,
      heimV2stand: 22,
      gastV2stand: 20,
      heimHalbzeitstand: 25, // different from V2stand
      gastHalbzeitstand: 22,
      heimV3stand: 40,
      gastV3stand: 35,
      heimV4stand: 60,
      gastV4stand: 50,
    }).game1;

    const scores = extractPeriodScores(game);

    // Q2 = V2stand(22) - V1stand(10) = 12 (not 25 - 10 = 15)
    expect(scores.homeQ2).toBe(12);
    // Q3 = V3stand(40) - V2stand(22) = 18 (not 40 - 25 = 15)
    expect(scores.homeQ3).toBe(18);
  });
});


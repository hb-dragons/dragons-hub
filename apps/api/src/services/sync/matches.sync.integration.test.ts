import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { SdkSpielplanMatch, SdkGetGameResponse } from "@dragons/sdk";
import type { LeagueFetchedData } from "./data-fetcher";

// Real Postgres (pglite) with the real hash + the real change classifier, so the
// detail-fetch availability flip exercises the actual transaction/version logic.
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

vi.mock("../../config/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

// Events are out of scope for these tests — keep them a no-op so we focus on the
// version/audit/hash behaviour and avoid coupling to the outbox.
vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: vi.fn().mockResolvedValue(undefined),
}));

import { syncMatchesFromData } from "./matches.sync";
import { matches, matchRemoteVersions, matchChanges } from "@dragons/db/schema";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

let ctx: TestDbContext;

const LEAGUE_ID = 10;
const API_MATCH_ID = 1000;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  await ctx.client.query(
    `INSERT INTO leagues (id, api_liga_id, liga_nr, name, season_id, season_name)
     VALUES ($1, 1, 1, 'Bezirksliga', 1, '2024/25')`,
    [LEAGUE_ID],
  );
  await ctx.client.query(
    `INSERT INTO teams (api_team_permanent_id, season_team_id, team_competition_id, name, club_id)
     VALUES (10, 100, 1, 'Home', 1), (20, 200, 2, 'Guest', 2)`,
  );
});

afterAll(async () => {
  await closeTestDb(ctx);
});

function basicMatch(overrides: Partial<SdkSpielplanMatch> = {}): SdkSpielplanMatch {
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

function gameDetails(
  overrides: Partial<SdkGetGameResponse["game1"]> = {},
  sr: { sr1?: boolean; sr2?: boolean; sr3?: boolean } = {},
): SdkGetGameResponse {
  return {
    game1: {
      spielplanId: 1,
      spielnr: 1,
      spieltag: 1,
      spieldatum: 0,
      spielfeldId: 50,
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
    sr1: { spielleitung: null, lizenzNr: null, offenAngeboten: sr.sr1 ?? false },
    sr2: { spielleitung: null, lizenzNr: null, offenAngeboten: sr.sr2 ?? false },
    sr3: { spielleitung: null, lizenzNr: null, offenAngeboten: sr.sr3 ?? false },
  };
}

function leagueData(opts: {
  details?: SdkGetGameResponse | null;
  match?: SdkSpielplanMatch;
}): LeagueFetchedData {
  const match = opts.match ?? basicMatch();
  const gameDetailsMap =
    opts.details === null
      ? new Map<number, SdkGetGameResponse>()
      : new Map([[match.matchId!, opts.details ?? gameDetails()]]);
  return {
    leagueApiId: 1,
    leagueDbId: LEAGUE_ID,
    leagueName: "Bezirksliga",
    spielplan: [match],
    tabelle: [],
    gameDetails: gameDetailsMap,
  };
}

async function matchRow() {
  const [row] = await ctx.db.select().from(matches).where(eq(matches.apiMatchId, API_MATCH_ID));
  if (!row) throw new Error("match row not found");
  return row;
}

async function versions() {
  return ctx.db.select().from(matchRemoteVersions);
}

async function changeRows() {
  return ctx.db.select().from(matchChanges);
}

describe("syncMatchesFromData — detail-fetch availability flip (issue #49)", () => {
  it("does not churn version history or write bogus audit rows when details become unavailable", async () => {
    // First sync: details present → match created at remote version 1.
    await syncMatchesFromData([leagueData({ details: gameDetails() })], new Map(), 1);

    const afterCreate = await matchRow();
    expect(afterCreate.currentRemoteVersion).toBe(1);
    expect(afterCreate.homeHalftimeScore).toBe(40);
    expect(afterCreate.homeQ1).toBe(20);
    expect((await versions()).length).toBe(1);

    // Second sync: detail fetch failed (no game details), basic data unchanged.
    await syncMatchesFromData([leagueData({ details: null })], new Map(), 2);

    const afterDrop = await matchRow();
    // No new remote version, no audit rows, detail fields preserved, hash stable.
    expect((await versions()).length).toBe(1);
    expect((await changeRows()).length).toBe(0);
    expect(afterDrop.currentRemoteVersion).toBe(1);
    expect(afterDrop.homeHalftimeScore).toBe(40);
    expect(afterDrop.homeQ1).toBe(20);
    expect(afterDrop.remoteDataHash).toBe(afterCreate.remoteDataHash);
  });

  it("records only the real change (not detail->null) when details drop alongside a basic-field change", async () => {
    await syncMatchesFromData([leagueData({ details: gameDetails() })], new Map(), 1);
    expect((await versions()).length).toBe(1);

    // Details gone AND a genuine basic-field change in the same sync (match cancelled).
    await syncMatchesFromData(
      [leagueData({ details: null, match: basicMatch({ abgesagt: true }) })],
      new Map(),
      2,
    );

    const row = await matchRow();
    expect(row.isCancelled).toBe(true); // real change persisted
    expect(row.homeHalftimeScore).toBe(40); // detail field preserved, not regressed to null
    expect(row.currentRemoteVersion).toBe(2); // bumped exactly once
    expect((await versions()).length).toBe(2); // one new remote version

    const changes = await changeRows();
    expect(changes.map((c) => c.fieldName).sort()).toEqual(["isCancelled"]);
    expect(changes.every((c) => c.versionNumber === 2)).toBe(true);
  });

  it("preserves referee open-slot flags when details become unavailable (no churn, no regression)", async () => {
    // First sync: details present with an open referee slot → sr1Open persisted true.
    await syncMatchesFromData(
      [leagueData({ details: gameDetails({}, { sr1: true }) })],
      new Map(),
      1,
    );

    const afterCreate = await matchRow();
    expect(afterCreate.sr1Open).toBe(true);
    expect((await versions()).length).toBe(1);

    // Detail fetch fails → sr flags would default to false; must be preserved instead.
    await syncMatchesFromData([leagueData({ details: null })], new Map(), 2);

    const afterDrop = await matchRow();
    expect(afterDrop.sr1Open).toBe(true); // not regressed to false
    expect((await versions()).length).toBe(1); // no version churn
    expect((await changeRows()).length).toBe(0); // no bogus audit row
    expect(afterDrop.currentRemoteVersion).toBe(1);
    expect(afterDrop.remoteDataHash).toBe(afterCreate.remoteDataHash);
  });

  it("keeps the remote version stable across a details drop and recovery", async () => {
    await syncMatchesFromData([leagueData({ details: gameDetails() })], new Map(), 1); // v1
    await syncMatchesFromData([leagueData({ details: null })], new Map(), 2); // dropped → skip
    await syncMatchesFromData([leagueData({ details: gameDetails() })], new Map(), 3); // recovered → skip

    expect((await versions()).length).toBe(1);
    expect((await matchRow()).currentRemoteVersion).toBe(1);
    expect((await changeRows()).length).toBe(0);
  });
});

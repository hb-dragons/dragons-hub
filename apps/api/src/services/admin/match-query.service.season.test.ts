import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---

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

import { getOwnClubMatches } from "./match-query.service";
import { invalidateActiveSeasonCache } from "./season.service";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

// --- PGlite setup ---

let ctx: TestDbContext;
let activeSeasonId: number;
let upcomingSeasonId: number;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  invalidateActiveSeasonCache();

  const activeResult = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ('2025/26', 'active') RETURNING id`,
  );
  activeSeasonId = activeResult.rows[0]!.id;

  const upcomingResult = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ('2026/27', 'upcoming') RETURNING id`,
  );
  upcomingSeasonId = upcomingResult.rows[0]!.id;

  _teamApiIdCounter = 1000;
  _matchApiIdCounter = 90000;
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

async function insertLeague(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_liga_id: 1,
    liga_nr: 4102,
    name: "Kreisliga A",
    season_id: 1,
    season_name: "2025/26",
    season_ref_id: activeSeasonId,
    is_tracked: true,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await ctx.client.query<{ id: number }>(
    `INSERT INTO leagues (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return result.rows[0]!.id;
}

let _teamApiIdCounter = 1000;

async function insertTeam(overrides: Record<string, unknown> = {}) {
  _teamApiIdCounter++;
  const defaults = {
    api_team_permanent_id: _teamApiIdCounter,
    season_team_id: _teamApiIdCounter,
    team_competition_id: _teamApiIdCounter,
    name: `Team ${_teamApiIdCounter}`,
    club_id: 100,
    is_own_club: false,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await ctx.client.query<{ id: number }>(
    `INSERT INTO teams (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return { id: result.rows[0]!.id, apiTeamPermanentId: _teamApiIdCounter };
}

let _matchApiIdCounter = 90000;

async function insertMatch(
  leagueId: number,
  homeTeamApiId: number,
  guestTeamApiId: number,
  overrides: Record<string, unknown> = {},
) {
  _matchApiIdCounter++;
  const defaults = {
    api_match_id: _matchApiIdCounter,
    match_no: _matchApiIdCounter,
    match_day: 1,
    league_id: leagueId,
    home_team_api_id: homeTeamApiId,
    guest_team_api_id: guestTeamApiId,
    kickoff_date: "2026-05-01",
    kickoff_time: "18:00",
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await ctx.client.query<{ id: number }>(
    `INSERT INTO matches (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return result.rows[0]!.id;
}

// --- Tests ---

describe("getOwnClubMatches — seasonId filter", () => {
  it("filters own-club matches to the given season", async () => {
    // Own-club team plays in both seasons
    const ownTeam = await insertTeam({ is_own_club: true });
    const opponent1 = await insertTeam();
    const opponent2 = await insertTeam();

    const activeLeagueId = await insertLeague({
      api_liga_id: 10,
      liga_nr: 4102,
      season_ref_id: activeSeasonId,
      name: "Active Liga",
    });
    const upcomingLeagueId = await insertLeague({
      api_liga_id: 20,
      liga_nr: 4103,
      name: "Upcoming Liga",
      season_ref_id: upcomingSeasonId,
    });

    await insertMatch(activeLeagueId, ownTeam.apiTeamPermanentId, opponent1.apiTeamPermanentId);
    await insertMatch(upcomingLeagueId, ownTeam.apiTeamPermanentId, opponent2.apiTeamPermanentId);

    const result = await getOwnClubMatches({ limit: 50, offset: 0, seasonId: activeSeasonId });

    expect(result.items.length).toBe(1);
    expect(result.items[0]!.leagueId).toBe(activeLeagueId);
  });

  it("returns no matches when seasonId matches no league", async () => {
    const ownTeam = await insertTeam({ is_own_club: true });
    const opponent = await insertTeam();

    const activeLeagueId = await insertLeague({
      api_liga_id: 10,
      liga_nr: 4102,
      season_ref_id: activeSeasonId,
    });
    await insertMatch(activeLeagueId, ownTeam.apiTeamPermanentId, opponent.apiTeamPermanentId);

    const result = await getOwnClubMatches({ limit: 50, offset: 0, seasonId: -1 });

    expect(result.items.length).toBe(0);
    expect(result.total).toBe(0);
  });

  it("returns all own-club matches when seasonId is not provided", async () => {
    const ownTeam = await insertTeam({ is_own_club: true });
    const opponent1 = await insertTeam();
    const opponent2 = await insertTeam();

    const activeLeagueId = await insertLeague({
      api_liga_id: 10,
      liga_nr: 4102,
      season_ref_id: activeSeasonId,
    });
    const upcomingLeagueId = await insertLeague({
      api_liga_id: 20,
      liga_nr: 4103,
      name: "Upcoming Liga",
      season_ref_id: upcomingSeasonId,
    });

    await insertMatch(activeLeagueId, ownTeam.apiTeamPermanentId, opponent1.apiTeamPermanentId);
    await insertMatch(upcomingLeagueId, ownTeam.apiTeamPermanentId, opponent2.apiTeamPermanentId);

    const result = await getOwnClubMatches({ limit: 50, offset: 0 });

    expect(result.items.length).toBe(2);
  });
});

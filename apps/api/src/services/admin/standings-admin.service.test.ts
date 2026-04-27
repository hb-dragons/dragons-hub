import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

// --- Imports (after mocks) ---

import { getStandings } from "./standings-admin.service";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

// --- PGlite setup ---

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
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
    is_tracked: true,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await ctx.client.query(
    `INSERT INTO leagues (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertTeam(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_team_permanent_id: 1000,
    season_team_id: 1,
    team_competition_id: 1,
    name: "Dragons Herren 1",
    club_id: 100,
    is_own_club: false,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await ctx.client.query(
    `INSERT INTO teams (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertStanding(leagueId: number, teamApiId: number, overrides: Record<string, unknown> = {}) {
  const defaults = {
    league_id: leagueId,
    team_api_id: teamApiId,
    position: 1,
    played: 10,
    won: 8,
    lost: 2,
    points_for: 800,
    points_against: 700,
    points_diff: 100,
    league_points: 16,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  await ctx.client.query(
    `INSERT INTO standings (${cols.join(", ")}) VALUES (${placeholders})`,
    vals,
  );
}

// --- Tests ---

describe("getStandings", () => {
  it("returns empty array when no standings exist", async () => {
    const result = await getStandings();
    expect(result).toEqual([]);
  });

  it("returns standings grouped by league", async () => {
    const leagueId = await insertLeague();
    await insertTeam({ api_team_permanent_id: 1000, name: "Team A" });
    await insertTeam({ api_team_permanent_id: 2000, name: "Team B", season_team_id: 2, team_competition_id: 2 });
    await insertStanding(leagueId, 1000, { position: 1 });
    await insertStanding(leagueId, 2000, { position: 2 });

    const result = await getStandings();

    expect(result).toHaveLength(1);
    expect(result[0]!.leagueName).toBe("Kreisliga A");
    expect(result[0]!.standings).toHaveLength(2);
    expect(result[0]!.standings[0]!.position).toBe(1);
    expect(result[0]!.standings[1]!.position).toBe(2);
  });

  it("only returns tracked leagues", async () => {
    const trackedId = await insertLeague({ api_liga_id: 1, name: "Tracked League", is_tracked: true });
    await insertLeague({ api_liga_id: 2, liga_nr: 4103, name: "Untracked League", is_tracked: false });
    await insertTeam({ api_team_permanent_id: 1000, name: "Team A" });
    await insertStanding(trackedId, 1000);

    const result = await getStandings();

    expect(result).toHaveLength(1);
    expect(result[0]!.leagueName).toBe("Tracked League");
  });

  it("includes isOwnClub flag from teams", async () => {
    const leagueId = await insertLeague();
    await insertTeam({ api_team_permanent_id: 1000, name: "Dragons", is_own_club: true });
    await insertTeam({ api_team_permanent_id: 2000, name: "Opponents", is_own_club: false, season_team_id: 2, team_competition_id: 2 });
    await insertStanding(leagueId, 1000, { position: 1 });
    await insertStanding(leagueId, 2000, { position: 2 });

    const result = await getStandings();

    expect(result[0]!.standings[0]!.isOwnClub).toBe(true);
    expect(result[0]!.standings[1]!.isOwnClub).toBe(false);
  });

  it("orders standings by position within each league", async () => {
    const leagueId = await insertLeague();
    await insertTeam({ api_team_permanent_id: 1000, name: "Team C" });
    await insertTeam({ api_team_permanent_id: 2000, name: "Team A", season_team_id: 2, team_competition_id: 2 });
    await insertTeam({ api_team_permanent_id: 3000, name: "Team B", season_team_id: 3, team_competition_id: 3 });
    await insertStanding(leagueId, 1000, { position: 3 });
    await insertStanding(leagueId, 2000, { position: 1 });
    await insertStanding(leagueId, 3000, { position: 2 });

    const result = await getStandings();

    expect(result[0]!.standings.map((s) => s.position)).toEqual([1, 2, 3]);
  });

  it("includes all stats fields", async () => {
    const leagueId = await insertLeague();
    await insertTeam({ api_team_permanent_id: 1000, name: "Team A" });
    await insertStanding(leagueId, 1000, {
      position: 1,
      played: 10,
      won: 8,
      lost: 2,
      points_for: 800,
      points_against: 700,
      points_diff: 100,
      league_points: 16,
    });

    const result = await getStandings();
    const standing = result[0]!.standings[0]!;

    expect(standing).toMatchObject({
      position: 1,
      played: 10,
      won: 8,
      lost: 2,
      pointsFor: 800,
      pointsAgainst: 700,
      pointsDiff: 100,
      leaguePoints: 16,
    });
  });

  it("includes season name in league data", async () => {
    const leagueId = await insertLeague({ season_name: "2025/26" });
    await insertTeam({ api_team_permanent_id: 1000, name: "Team A" });
    await insertStanding(leagueId, 1000);

    const result = await getStandings();

    expect(result[0]!.seasonName).toBe("2025/26");
  });

  it("groups multiple leagues separately", async () => {
    const league1 = await insertLeague({ api_liga_id: 1, name: "Liga A" });
    const league2 = await insertLeague({ api_liga_id: 2, liga_nr: 4103, name: "Liga B" });
    await insertTeam({ api_team_permanent_id: 1000, name: "Team 1" });
    await insertTeam({ api_team_permanent_id: 2000, name: "Team 2", season_team_id: 2, team_competition_id: 2 });
    await insertStanding(league1, 1000, { position: 1 });
    await insertStanding(league2, 2000, { position: 1 });

    const result = await getStandings();

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.leagueName).sort()).toEqual(["Liga A", "Liga B"]);
  });

  it("orders leagues by own-club team displayOrder", async () => {
    const ligaA = await insertLeague({ api_liga_id: 1, name: "Liga A" });
    const ligaB = await insertLeague({ api_liga_id: 2, liga_nr: 4103, name: "Liga B" });
    const ligaC = await insertLeague({ api_liga_id: 3, liga_nr: 4104, name: "Liga C" });

    // Liga A has own team with displayOrder=2
    await insertTeam({ api_team_permanent_id: 1000, name: "Own A", is_own_club: true, display_order: 2 });
    // Liga B has own team with displayOrder=0
    await insertTeam({ api_team_permanent_id: 2000, name: "Own B", is_own_club: true, display_order: 0, season_team_id: 2, team_competition_id: 2 });
    // Liga C has own team with displayOrder=1
    await insertTeam({ api_team_permanent_id: 3000, name: "Own C", is_own_club: true, display_order: 1, season_team_id: 3, team_competition_id: 3 });

    await insertStanding(ligaA, 1000, { position: 1 });
    await insertStanding(ligaB, 2000, { position: 1 });
    await insertStanding(ligaC, 3000, { position: 1 });

    const result = await getStandings();

    expect(result.map((r) => r.leagueName)).toEqual(["Liga B", "Liga C", "Liga A"]);
  });

  it("places leagues without an own-club team after own-club leagues", async () => {
    const ownLiga = await insertLeague({ api_liga_id: 1, name: "Own Liga" });
    const fooLiga = await insertLeague({ api_liga_id: 2, liga_nr: 4103, name: "Foo Liga" });
    const barLiga = await insertLeague({ api_liga_id: 3, liga_nr: 4104, name: "Bar Liga" });

    await insertTeam({ api_team_permanent_id: 1000, name: "Own Team", is_own_club: true, display_order: 5 });
    await insertTeam({ api_team_permanent_id: 2000, name: "Foreign 1", is_own_club: false, season_team_id: 2, team_competition_id: 2 });
    await insertTeam({ api_team_permanent_id: 3000, name: "Foreign 2", is_own_club: false, season_team_id: 3, team_competition_id: 3 });

    await insertStanding(ownLiga, 1000, { position: 1 });
    await insertStanding(fooLiga, 2000, { position: 1 });
    await insertStanding(barLiga, 3000, { position: 1 });

    const result = await getStandings();

    // Own-club league first, foreign leagues alphabetical after
    expect(result.map((r) => r.leagueName)).toEqual(["Own Liga", "Bar Liga", "Foo Liga"]);
  });
});

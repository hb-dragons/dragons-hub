import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

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

// --- PGlite setup ---

const CREATE_TABLES = `
  CREATE TABLE leagues (
    id SERIAL PRIMARY KEY,
    api_liga_id INTEGER NOT NULL UNIQUE,
    liga_nr INTEGER NOT NULL,
    name VARCHAR(150) NOT NULL,
    season_id INTEGER NOT NULL,
    season_name VARCHAR(100) NOT NULL,
    sk_name VARCHAR(100),
    ak_name VARCHAR(100),
    geschlecht VARCHAR(20),
    verband_id INTEGER,
    verband_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_tracked BOOLEAN DEFAULT TRUE,
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    discovered_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    api_team_permanent_id INTEGER NOT NULL UNIQUE,
    season_team_id INTEGER NOT NULL,
    team_competition_id INTEGER NOT NULL,
    name VARCHAR(150) NOT NULL,
    name_short VARCHAR(100),
    custom_name VARCHAR(50),
    club_id INTEGER NOT NULL,
    is_own_club BOOLEAN DEFAULT FALSE,
    verzicht BOOLEAN DEFAULT FALSE,
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE standings (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id),
    team_api_id INTEGER NOT NULL REFERENCES teams(api_team_permanent_id),
    position INTEGER NOT NULL,
    played INTEGER NOT NULL DEFAULT 0,
    won INTEGER NOT NULL DEFAULT 0,
    lost INTEGER NOT NULL DEFAULT 0,
    points_for INTEGER NOT NULL DEFAULT 0,
    points_against INTEGER NOT NULL DEFAULT 0,
    points_diff INTEGER NOT NULL DEFAULT 0,
    league_points INTEGER NOT NULL DEFAULT 0,
    data_hash VARCHAR(64),
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (league_id, team_api_id)
  );
`;

let client: PGlite;

beforeAll(async () => {
  const pglite = await import("@electric-sql/pglite");
  const drizzlePglite = await import("drizzle-orm/pglite");

  client = new pglite.PGlite();
  dbHolder.ref = drizzlePglite.drizzle(client);

  await client.exec(CREATE_TABLES);
});

beforeEach(async () => {
  await client.exec("DELETE FROM standings");
  await client.exec("DELETE FROM teams");
  await client.exec("DELETE FROM leagues");
  await client.exec("ALTER SEQUENCE standings_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE teams_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE leagues_id_seq RESTART WITH 1");
  vi.clearAllMocks();
});

afterAll(async () => {
  await client.close();
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
  const result = await client.query(
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
  const result = await client.query(
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
  await client.query(
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
});

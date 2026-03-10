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

import { getOwnClubTeams, updateTeam } from "./team-admin.service";

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
    estimated_game_duration INTEGER,
    badge_color VARCHAR(20),
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
    UNIQUE(league_id, team_api_id)
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
  await client.exec("ALTER SEQUENCE teams_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE leagues_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE standings_id_seq RESTART WITH 1");
  vi.clearAllMocks();
});

afterAll(async () => {
  await client.close();
});

// --- Helpers ---

async function insertLeague(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_liga_id: 100,
    liga_nr: 1,
    name: "Test League",
    season_id: 2025,
    season_name: "2024/2025",
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
    name: "Test Team",
    club_id: 1,
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

async function insertStanding(leagueId: number, teamApiId: number) {
  await client.query(
    "INSERT INTO standings (league_id, team_api_id, position) VALUES ($1, $2, $3)",
    [leagueId, teamApiId, 1],
  );
}

// --- Tests ---

describe("getOwnClubTeams", () => {
  it("returns empty array when no own club teams", async () => {
    await insertTeam({ name: "Other Team" });

    const result = await getOwnClubTeams();

    expect(result).toEqual([]);
  });

  it("returns only own club teams", async () => {
    await insertTeam({ api_team_permanent_id: 1000, name: "Dragons Herren 1", club_id: 4121, is_own_club: true });
    await insertTeam({ api_team_permanent_id: 2000, name: "Opponents", club_id: 9999 });

    const result = await getOwnClubTeams();

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Dragons Herren 1");
    expect(result[0]!.customName).toBeNull();
    expect(result[0]!.leagueName).toBeNull();
  });

  it("includes customName when set", async () => {
    await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      custom_name: "Herren 1",
      is_own_club: true,
    });

    const result = await getOwnClubTeams();

    expect(result[0]!.customName).toBe("Herren 1");
  });

  it("includes nameShort when set", async () => {
    await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      name_short: "Dragons H1",
      is_own_club: true,
    });

    const result = await getOwnClubTeams();

    expect(result[0]!.nameShort).toBe("Dragons H1");
  });

  it("returns null nameShort when not set", async () => {
    await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });

    const result = await getOwnClubTeams();

    expect(result[0]!.nameShort).toBeNull();
  });

  it("includes league name from standings", async () => {
    const leagueId = await insertLeague({ name: "Kreisliga A" });
    await insertTeam({ api_team_permanent_id: 1000, name: "Dragons Herren 1", is_own_club: true });
    await insertStanding(leagueId, 1000);

    const result = await getOwnClubTeams();

    expect(result[0]!.leagueName).toBe("Kreisliga A");
  });

  it("returns null leagueName when team has no standings", async () => {
    await insertTeam({ api_team_permanent_id: 1000, name: "Dragons Herren 1", is_own_club: true });

    const result = await getOwnClubTeams();

    expect(result[0]!.leagueName).toBeNull();
  });

  it("orders teams by name", async () => {
    await insertTeam({ api_team_permanent_id: 1001, name: "Dragons U18", is_own_club: true });
    await insertTeam({ api_team_permanent_id: 1002, name: "Dragons Herren 1", is_own_club: true });
    await insertTeam({ api_team_permanent_id: 1003, name: "Dragons Herren 2", is_own_club: true });

    const result = await getOwnClubTeams();

    expect(result.map((t) => t.name)).toEqual([
      "Dragons Herren 1",
      "Dragons Herren 2",
      "Dragons U18",
    ]);
  });

  it("returns all expected fields including estimatedGameDuration", async () => {
    await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      custom_name: "H1",
      is_own_club: true,
    });

    const result = await getOwnClubTeams();

    expect(Object.keys(result[0]!).sort()).toEqual([
      "badgeColor", "customName", "estimatedGameDuration", "id", "leagueName", "name", "nameShort",
    ]);
  });

  it("includes estimatedGameDuration when set", async () => {
    await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      estimated_game_duration: 120,
      is_own_club: true,
    });

    const result = await getOwnClubTeams();

    expect(result[0]!.estimatedGameDuration).toBe(120);
  });

  it("returns null estimatedGameDuration when not set", async () => {
    await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });

    const result = await getOwnClubTeams();

    expect(result[0]!.estimatedGameDuration).toBeNull();
  });

  it("does not duplicate teams with multiple standings entries", async () => {
    const league1 = await insertLeague({ api_liga_id: 100, name: "League A" });
    const league2 = await insertLeague({ api_liga_id: 200, name: "League B" });
    await insertTeam({ api_team_permanent_id: 1000, name: "Dragons Herren 1", is_own_club: true });
    await insertStanding(league1, 1000);
    await insertStanding(league2, 1000);

    const result = await getOwnClubTeams();

    expect(result).toHaveLength(1);
  });
});

describe("updateTeam", () => {
  it("updates custom name for own club team", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });

    const result = await updateTeam(id, { customName: "Herren 1" });

    expect(result).not.toBeNull();
    expect(result!.customName).toBe("Herren 1");
    expect(result!.name).toBe("Dragons Herren 1");
  });

  it("clears custom name with null", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      custom_name: "Herren 1",
      is_own_club: true,
    });

    const result = await updateTeam(id, { customName: null });

    expect(result!.customName).toBeNull();
  });

  it("updates estimatedGameDuration", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });

    const result = await updateTeam(id, { estimatedGameDuration: 120 });

    expect(result).not.toBeNull();
    expect(result!.estimatedGameDuration).toBe(120);
  });

  it("clears estimatedGameDuration with null", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      estimated_game_duration: 120,
      is_own_club: true,
    });

    const result = await updateTeam(id, { estimatedGameDuration: null });

    expect(result!.estimatedGameDuration).toBeNull();
  });

  it("updates both fields at once", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });

    const result = await updateTeam(id, { customName: "H1", estimatedGameDuration: 90 });

    expect(result).not.toBeNull();
    expect(result!.customName).toBe("H1");
    expect(result!.estimatedGameDuration).toBe(90);
  });

  it("returns null for non-existent team", async () => {
    const result = await updateTeam(999, { customName: "Test" });

    expect(result).toBeNull();
  });

  it("returns null for non-own-club team", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Other Team",
      is_own_club: false,
    });

    const result = await updateTeam(id, { customName: "Test" });

    expect(result).toBeNull();
  });

  it("includes league name in response", async () => {
    const leagueId = await insertLeague({ name: "Kreisliga A" });
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });
    await insertStanding(leagueId, 1000);

    const result = await updateTeam(id, { customName: "Herren 1" });

    expect(result!.leagueName).toBe("Kreisliga A");
  });

  it("returns null leagueName when team has no standings", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });

    const result = await updateTeam(id, { customName: "Herren 1" });

    expect(result!.leagueName).toBeNull();
  });

  it("updates updatedAt timestamp", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });

    const before = await client.query("SELECT updated_at FROM teams WHERE id = $1", [id]);
    const beforeTime = (before.rows[0] as { updated_at: Date }).updated_at;

    await updateTeam(id, { customName: "Herren 1" });

    const after = await client.query("SELECT updated_at FROM teams WHERE id = $1", [id]);
    const afterTime = (after.rows[0] as { updated_at: Date }).updated_at;

    expect(new Date(afterTime as unknown as string).getTime()).toBeGreaterThanOrEqual(
      new Date(beforeTime as unknown as string).getTime(),
    );
  });
});

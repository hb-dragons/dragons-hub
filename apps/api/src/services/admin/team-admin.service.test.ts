import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () => (new Proxy(
    {},
    {
      get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  )),
}));

// --- Imports (after mocks) ---

import { getOwnClubTeams, updateTeamEntry, reorderTeamEntries } from "./team-admin.service";
import { TeamReorderError, TeamLeagueMismatchError } from "./team-admin.errors";
import { invalidateActiveSeasonCache } from "./season.service";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

// --- PGlite setup ---

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  // getActiveSeasonId() caches for 60s; each test starts with a clean DB, so
  // the cache must be cleared too or it can serve a season from a prior test.
  invalidateActiveSeasonCache();
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

/** Task 1's helpers (team-entries.migration.test.ts) — season/league/team fixtures. */
async function seedSeason(name: string, status: string): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ($1, $2) RETURNING id`, [name, status]);
  return r.rows[0]!.id;
}

async function seedLeague(apiLigaId: number, name: string, seasonId: number, vorabliga = false): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, vorabliga, is_tracked)
     VALUES ($1, $1, $2, 2026, 's', $3, $4, true) RETURNING id`,
    [apiLigaId, name, seasonId, vorabliga]);
  return r.rows[0]!.id;
}

async function seedTeam(permanentId: number, name: string, own = true, extras = ""): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO teams (api_team_permanent_id, season_team_id, team_competition_id, name, club_id, is_own_club${extras ? ", " + extras.split("=")[0] : ""})
     VALUES ($1, 1, 1, $2, 100, $3${extras ? ", " + extras.split("=")[1] : ""}) RETURNING id`,
    [permanentId, name, own]);
  return r.rows[0]!.id;
}

/** Inserts a team_entries row; team_id/season_id are required, everything else defaults. */
async function insertEntry(
  teamId: number,
  seasonId: number,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const data = { team_id: teamId, season_id: seasonId, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await ctx.client.query<{ id: number }>(
    `INSERT INTO team_entries (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return result.rows[0]!.id;
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
  const result = await ctx.client.query(
    `INSERT INTO teams (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

// --- Tests ---

describe("getOwnClubTeams", () => {
  let active: number;

  beforeEach(async () => {
    active = await seedSeason("2025/26", "active");
  });

  it("returns empty array when no own club teams", async () => {
    await insertTeam({ name: "Other Team" });

    const result = await getOwnClubTeams();

    expect(result).toEqual([]);
  });

  it("returns only own club teams", async () => {
    const ownId = await insertTeam({ api_team_permanent_id: 1000, name: "Dragons Herren 1", club_id: 4121, is_own_club: true });
    await insertTeam({ api_team_permanent_id: 2000, name: "Opponents", club_id: 9999 });
    await insertEntry(ownId, active);

    const result = await getOwnClubTeams();

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Dragons Herren 1");
    expect(result[0]!.customName).toBeNull();
    expect(result[0]!.leagueName).toBeNull();
  });

  it("includes customName when set", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });
    await insertEntry(id, active, { custom_name: "Herren 1" });

    const result = await getOwnClubTeams();

    expect(result[0]!.customName).toBe("Herren 1");
  });

  it("includes nameShort when set", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      name_short: "Dragons H1",
      is_own_club: true,
    });
    await insertEntry(id, active);

    const result = await getOwnClubTeams();

    expect(result[0]!.nameShort).toBe("Dragons H1");
  });

  it("returns null nameShort when not set", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });
    await insertEntry(id, active);

    const result = await getOwnClubTeams();

    expect(result[0]!.nameShort).toBeNull();
  });

  it("includes league name from the entry's connected league", async () => {
    const leagueId = await seedLeague(500, "Kreisliga A", active);
    const id = await insertTeam({ api_team_permanent_id: 1000, name: "Dragons Herren 1", is_own_club: true });
    await insertEntry(id, active, { league_id: leagueId });

    const result = await getOwnClubTeams();

    expect(result[0]!.leagueName).toBe("Kreisliga A");
  });

  it("returns null leagueName when the entry has no connected league", async () => {
    const id = await insertTeam({ api_team_permanent_id: 1000, name: "Dragons Herren 1", is_own_club: true });
    await insertEntry(id, active);

    const result = await getOwnClubTeams();

    expect(result[0]!.leagueName).toBeNull();
    expect(result[0]!.leagueTracked).toBe(true);
  });

  it("orders teams by name", async () => {
    const a = await insertTeam({ api_team_permanent_id: 1001, name: "Dragons U18", is_own_club: true });
    const b = await insertTeam({ api_team_permanent_id: 1002, name: "Dragons Herren 1", is_own_club: true });
    const c = await insertTeam({ api_team_permanent_id: 1003, name: "Dragons Herren 2", is_own_club: true });
    await insertEntry(a, active);
    await insertEntry(b, active);
    await insertEntry(c, active);

    const result = await getOwnClubTeams();

    expect(result.map((t) => t.name)).toEqual([
      "Dragons Herren 1",
      "Dragons Herren 2",
      "Dragons U18",
    ]);
  });

  it("returns all expected fields", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });
    await insertEntry(id, active, { custom_name: "H1" });

    const result = await getOwnClubTeams();

    expect(Object.keys(result[0]!).sort()).toEqual([
      "badgeColor", "customName", "displayOrder", "estimatedGameDuration", "id",
      "leagueId", "leagueName", "leagueTracked", "linkSource", "name", "nameShort", "teamId",
    ]);
  });

  it("includes estimatedGameDuration when set", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });
    await insertEntry(id, active, { estimated_game_duration: 120 });

    const result = await getOwnClubTeams();

    expect(result[0]!.estimatedGameDuration).toBe(120);
  });

  it("returns null estimatedGameDuration when not set", async () => {
    const id = await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons Herren 1",
      is_own_club: true,
    });
    await insertEntry(id, active);

    const result = await getOwnClubTeams();

    expect(result[0]!.estimatedGameDuration).toBeNull();
  });
});

describe("getOwnClubTeams (entry-based)", () => {
  it("lists the requested season's entries with league name and tracked flag", async () => {
    const active = await seedSeason("2026/27", "active");   // reuse/create helpers as in Task 1's test
    const league = await seedLeague(10, "U16 Bezirksliga", active);
    const untracked = await seedLeague(11, "U16 Vorab", active, true);
    await ctx.client.query(`UPDATE leagues SET is_tracked = false WHERE id = $1`, [untracked]);
    const squadA = await seedTeam(1000, "Dragons U16");
    const squadB = await seedTeam(2000, "Dragons U12");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, link_source, custom_name, display_order)
       VALUES ($1, $2, $3, 'seeded', 'U16', 1), ($4, $2, $5, 'manual', NULL, 0)`,
      [squadA, active, league, squadB, untracked]);

    const rows = await getOwnClubTeams(active);

    expect(rows.map((r) => ({ name: r.name, leagueName: r.leagueName, leagueTracked: r.leagueTracked, linkSource: r.linkSource }))).toEqual([
      { name: "Dragons U12", leagueName: "U16 Vorab", leagueTracked: false, linkSource: "manual" },
      { name: "Dragons U16", leagueName: "U16 Bezirksliga", leagueTracked: true, linkSource: "seeded" },
    ]);
  });

  it("defaults to the active season and returns [] when none is active", async () => {
    expect(await getOwnClubTeams()).toEqual([]);
  });

  it("regression #original-bug: cross-season standings cannot leak — an archived U14 league never shows on the active season's entry", async () => {
    const archived = await seedSeason("2025/26", "archived");
    const active = await seedSeason("2026/27", "active");
    const u14 = await seedLeague(20, "U14 Kreisliga", archived);
    const u16 = await seedLeague(21, "U16 Bezirksliga", active);
    const squad = await seedTeam(3000, "Dragons U16");
    // Standings history in BOTH leagues (the original bug's trigger)…
    await ctx.client.query(`INSERT INTO standings (league_id, team_api_id, position) VALUES ($1, 3000, 1), ($2, 3000, 1)`, [u14, u16]);
    // …but the entry pins the league.
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id) VALUES ($1, $2, $3)`, [squad, active, u16]);

    const rows = await getOwnClubTeams(active);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.leagueName).toBe("U16 Bezirksliga");
  });
});

describe("updateTeamEntry", () => {
  it("sets the league link manually and reports the season's league name", async () => {
    const season = await seedSeason("2026/27", "active");
    const league = await seedLeague(40, "U10 Kreisliga", season);
    const squad = await seedTeam(5000, "Dragons U10");
    const entry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id) VALUES ($1, $2) RETURNING id`, [squad, season]);

    const updated = await updateTeamEntry(entry.rows[0]!.id, { leagueId: league });

    expect(updated?.leagueName).toBe("U10 Kreisliga");
    expect(updated?.linkSource).toBe("manual");
  });

  it("clears the link with leagueId null", async () => {
    const season = await seedSeason("2026/27", "active");
    const league = await seedLeague(41, "U10", season);
    const squad = await seedTeam(5001, "Dragons U10");
    const entry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id, league_id) VALUES ($1, $2, $3) RETURNING id`,
      [squad, season, league]);

    const updated = await updateTeamEntry(entry.rows[0]!.id, { leagueId: null });
    expect(updated?.leagueId).toBeNull();
    expect(updated?.leagueName).toBeNull();
  });

  it("rejects a league from another season", async () => {
    const season = await seedSeason("2026/27", "active");
    const other = await seedSeason("2025/26", "archived");
    const foreign = await seedLeague(42, "Old U10", other);
    const squad = await seedTeam(5002, "Dragons U10");
    const entry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id) VALUES ($1, $2) RETURNING id`, [squad, season]);

    await expect(updateTeamEntry(entry.rows[0]!.id, { leagueId: foreign }))
      .rejects.toThrow(TeamLeagueMismatchError);
  });

  it("returns null for a non-existent entry", async () => {
    const result = await updateTeamEntry(999999, { customName: "Test" });
    expect(result).toBeNull();
  });

  it("returns null for an entry whose squad is not own-club", async () => {
    const season = await seedSeason("2026/27", "active");
    const squad = await seedTeam(5003, "Other Team", false);
    const entry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id) VALUES ($1, $2) RETURNING id`, [squad, season]);

    const result = await updateTeamEntry(entry.rows[0]!.id, { customName: "Test" });
    expect(result).toBeNull();
  });

  it("updates customName, estimatedGameDuration and badgeColor", async () => {
    const season = await seedSeason("2026/27", "active");
    const squad = await seedTeam(5004, "Dragons U10");
    const entry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id) VALUES ($1, $2) RETURNING id`, [squad, season]);

    const updated = await updateTeamEntry(entry.rows[0]!.id, {
      customName: "U10",
      estimatedGameDuration: 90,
      badgeColor: "red",
    });

    expect(updated?.customName).toBe("U10");
    expect(updated?.estimatedGameDuration).toBe(90);
    expect(updated?.badgeColor).toBe("red");
  });
});

describe("reorderTeamEntries", () => {
  it("reorders exactly the season's entries", async () => {
    const season = await seedSeason("2026/27", "active");
    const a = await seedTeam(5100, "A");
    const b = await seedTeam(5101, "B");
    const rows = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id, display_order)
       VALUES ($1, $3, 0), ($2, $3, 1) RETURNING id`, [a, b, season]);
    const [ea, eb] = rows.rows.map((r) => r.id);

    const result = await reorderTeamEntries([eb!, ea!], season);
    expect(result.map((r) => r.id)).toEqual([eb, ea]);
  });

  it("rejects a set that does not exactly match the season's entries", async () => {
    const season = await seedSeason("2026/27", "active");
    const a = await seedTeam(5102, "A");
    const rows = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id) VALUES ($1, $2) RETURNING id`, [a, season]);
    await expect(reorderTeamEntries([rows.rows[0]!.id, 99999], season))
      .rejects.toThrow(TeamReorderError);
  });

  it("rejects duplicate entryIds", async () => {
    const season = await seedSeason("2026/27", "active");
    const a = await seedTeam(5103, "A");
    const rows = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id) VALUES ($1, $2) RETURNING id`, [a, season]);
    const entryId = rows.rows[0]!.id;

    await expect(reorderTeamEntries([entryId, entryId], season)).rejects.toThrow(
      expect.objectContaining({ code: "DUPLICATE_TEAM_ID" }),
    );
  });

  it("defaults to the active season when seasonId is omitted", async () => {
    const active = await seedSeason("2026/27", "active");
    const a = await seedTeam(5104, "A");
    const rows = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id) VALUES ($1, $2) RETURNING id`, [a, active]);

    const result = await reorderTeamEntries([rows.rows[0]!.id]);
    expect(result.map((r) => r.id)).toEqual([rows.rows[0]!.id]);
  });
});

describe("getOwnClubTeams ordering", () => {
  let active: number;

  beforeEach(async () => {
    active = await seedSeason("2025/26", "active");
  });

  it("returns teams sorted by displayOrder then name", async () => {
    const a = await insertTeam({ api_team_permanent_id: 1, name: "Charlie", is_own_club: true });
    const b = await insertTeam({ api_team_permanent_id: 2, name: "Alpha", is_own_club: true });
    const c = await insertTeam({ api_team_permanent_id: 3, name: "Bravo", is_own_club: true });
    await insertEntry(a, active, { display_order: 2 });
    await insertEntry(b, active, { display_order: 0 });
    await insertEntry(c, active, { display_order: 1 });

    const result = await getOwnClubTeams();

    expect(result.map((t) => t.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("uses name as tiebreaker when displayOrder is equal", async () => {
    const a = await insertTeam({ api_team_permanent_id: 1, name: "Bravo", is_own_club: true });
    const b = await insertTeam({ api_team_permanent_id: 2, name: "Alpha", is_own_club: true });
    await insertEntry(a, active, { display_order: 0 });
    await insertEntry(b, active, { display_order: 0 });

    const result = await getOwnClubTeams();

    expect(result.map((t) => t.name)).toEqual(["Alpha", "Bravo"]);
  });
});

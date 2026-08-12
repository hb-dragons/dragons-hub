import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () => new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));
vi.mock("./league-roster", () => ({ fetchLeagueRoster: vi.fn() }));

import { fetchLeagueRoster } from "./league-roster";
import { seedSeasonTeamEntries } from "./team-entry-seeding.service";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await closeTestDb(ctx); });
beforeEach(async () => { await resetTestDb(ctx); vi.clearAllMocks(); });

const ref = (teamPermanentId: number, teamname: string, clubId: number) => ({
  teamPermanentId, teamname, teamnameSmall: teamname, seasonTeamId: 7,
  teamCompetitionId: 8, clubId, verzicht: false,
});

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

async function seedTeam(permanentId: number, name: string, own = true): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO teams (api_team_permanent_id, season_team_id, team_competition_id, name, club_id, is_own_club)
     VALUES ($1, 1, 1, $2, 100, $3) RETURNING id`,
    [permanentId, name, own]);
  return r.rows[0]!.id;
}

async function seedClubConfig(clubId: number) {
  await ctx.client.query(
    `INSERT INTO app_settings (key, value) VALUES ('club_id', $1)`, [String(clubId)]);
}

describe("seedSeasonTeamEntries", () => {
  it("creates squad rows and entries for own-club teams found in the roster, defaulting display_order to MAX+1", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const league = await seedLeague(30, "U10 Kreisliga", season);
    // A pre-existing entry in this season with no relation to the new squad,
    // so the MAX(display_order)+1 fallback is exercised against a real value
    // rather than defaulting from an empty table (which would trivially pass
    // even with broken arithmetic).
    const otherSquad = await seedTeam(8999, "Dragons U8");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, display_order) VALUES ($1, $2, $3, 2)`,
      [otherSquad, season, league]);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9000, "Dragons U10", 100), ref(9001, "Rivals", 200)]);

    const result = await seedSeasonTeamEntries(season, [30]);

    expect(result).toEqual({ entriesSeeded: 1, rosterFailures: [] });
    const entries = await ctx.client.query<{ league_id: number; link_source: string; display_order: number }>(
      `SELECT te.league_id, te.link_source, te.display_order FROM team_entries te
       JOIN teams t ON t.id = te.team_id WHERE t.api_team_permanent_id = 9000`);
    expect(entries.rows).toEqual([{ league_id: league, link_source: "seeded", display_order: 3 }]);
    // The brand-new squad row exists and is own-club:
    const squad = await ctx.client.query<{ is_own_club: boolean }>(
      `SELECT is_own_club FROM teams WHERE api_team_permanent_id = 9000`);
    expect(squad.rows[0]!.is_own_club).toBe(true);
  });

  it("carries forward color/duration/order from the squad's latest previous entry, not the name", async () => {
    await seedClubConfig(100);
    const old = await seedSeason("2025/26", "active");
    const next = await seedSeason("2026/27", "upcoming");
    const oldLeague = await seedLeague(31, "U14", old);
    const newLeague = await seedLeague(32, "U16", next);
    const squad = await seedTeam(9100, "Dragons U16");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, custom_name, badge_color, estimated_game_duration, display_order)
       VALUES ($1, $2, $3, 'U14', 'red', 80, 4)`, [squad, old, oldLeague]);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9100, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(next, [32]);

    const entry = await ctx.client.query<{ custom_name: string | null; badge_color: string | null; estimated_game_duration: number | null; display_order: number; league_id: number }>(
      `SELECT custom_name, badge_color, estimated_game_duration, display_order, league_id
       FROM team_entries WHERE team_id = $1 AND season_id = $2`, [squad, next]);
    expect(entry.rows[0]).toEqual({
      custom_name: null, badge_color: "red", estimated_game_duration: 80, display_order: 4, league_id: newLeague,
    });
  });

  it("does not clobber an existing entry's fields, only refreshes the seeded link", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const a = await seedLeague(33, "U16 Vorab", season, true);
    const b = await seedLeague(34, "U16 Bezirksliga", season);
    const squad = await seedTeam(9200, "Dragons U16");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, custom_name, link_source)
       VALUES ($1, $2, $3, 'Sechzehn', 'seeded')`, [squad, season, a]);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9200, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(season, [34]);

    const entry = await ctx.client.query<{ league_id: number; custom_name: string }>(
      `SELECT league_id, custom_name FROM team_entries WHERE team_id = $1 AND season_id = $2`, [squad, season]);
    expect(entry.rows[0]).toEqual({ league_id: b, custom_name: "Sechzehn" });
  });

  it("reports roster failures per league and keeps going", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    await seedLeague(35, "U12 A", season);
    const okLeague = await seedLeague(36, "U12 B", season);
    vi.mocked(fetchLeagueRoster)
      .mockRejectedValueOnce(new Error("federation down"))
      .mockResolvedValueOnce([ref(9300, "Dragons U12", 100)]);

    const result = await seedSeasonTeamEntries(season, [35, 36]);

    expect(result.rosterFailures).toEqual([35]);
    expect(result.entriesSeeded).toBe(1);
    const entries = await ctx.client.query(`SELECT id FROM team_entries WHERE league_id = $1`, [okLeague]);
    expect(entries.rows).toHaveLength(1);
  });

  it("reports entriesSeeded: 0 and leaves the row untouched when re-seeding an already-correct entry", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const league = await seedLeague(37, "U18", season);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9400, "Dragons U18", 100)]);

    const first = await seedSeasonTeamEntries(season, [37]);
    expect(first.entriesSeeded).toBe(1);
    const before = await ctx.client.query<{ id: number; updated_at: string }>(
      `SELECT te.id, te.updated_at FROM team_entries te
       JOIN teams t ON t.id = te.team_id WHERE t.api_team_permanent_id = 9400`);
    expect(before.rows).toHaveLength(1);

    const second = await seedSeasonTeamEntries(season, [37]);
    expect(second).toEqual({ entriesSeeded: 0, rosterFailures: [] });

    const after = await ctx.client.query<{ id: number; updated_at: string; league_id: number }>(
      `SELECT te.id, te.updated_at, te.league_id FROM team_entries te
       JOIN teams t ON t.id = te.team_id WHERE t.api_team_permanent_id = 9400`);
    // Same row, same league, no re-touch — the "unchanged" branch never
    // reaches the UPDATE, so updatedAt does not move.
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]!.id).toBe(before.rows[0]!.id);
    expect(after.rows[0]!.league_id).toBe(league);
    expect(after.rows[0]!.updated_at).toEqual(before.rows[0]!.updated_at);
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

const DRIZZLE_DIR = path.resolve(import.meta.dirname, "../../../../../packages/db/drizzle");

// The migration also has two `UPDATE "team_entries" ... FROM "teams"` statements
// that copy custom_name/badge_color/estimated_game_duration/display_order onto
// the active/upcoming season's entries. Those columns were dropped from `teams`
// by migration 0048 (see teams.ts), so replaying that SQL against the current
// (post-0048) schema fails with "column does not exist" — do not widen the
// filter below to include them again. The migration itself is unaffected: it
// ran in order (0047 before 0048) against the columns while they still
// existed, so production data is correct; only this test's standalone SQL
// replay is constrained to the parts that remain legal to re-run.
function backfillInsertStatements(): string[] {
  const file = readdirSync(DRIZZLE_DIR).find((f) => {
    if (!f.endsWith(".sql")) return false;
    const sql = readFileSync(path.join(DRIZZLE_DIR, f), "utf8");
    return sql.includes('INSERT INTO "team_entries"');
  });
  if (!file) throw new Error("team_entries backfill migration not found");
  // .includes(), not .startsWith(): the first INSERT shares its
  // statement-breakpoint chunk with the explanatory comment block above it
  // (see the migration file), so a prefix check would silently drop it. Same
  // reasoning as the .includes()-based matching in
  // season.service.migration.test.ts.
  return readFileSync(path.join(DRIZZLE_DIR, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.includes('INSERT INTO "team_entries"'));
}

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); });
afterAll(async () => { await closeTestDb(ctx); });
beforeEach(async () => { await resetTestDb(ctx); });

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

describe("team_entries backfill", () => {
  it("creates one entry per own-club squad per season from standings, preferring committed leagues", async () => {
    const archived = await seedSeason("2025/26", "archived");
    const active = await seedSeason("2026/27", "active");
    const u14old = await seedLeague(1, "U14 Kreisliga", archived);
    const u16vorab = await seedLeague(2, "U16 Vorab", active, true);
    const u16real = await seedLeague(3, "U16 Bezirksliga", active, false);
    const squad = await seedTeam(1000, "Dragons U16");
    for (const leagueId of [u14old, u16vorab, u16real]) {
      await ctx.client.query(
        `INSERT INTO standings (league_id, team_api_id, position) VALUES ($1, 1000, 1)`, [leagueId]);
    }

    for (const sql of backfillInsertStatements()) await ctx.client.exec(sql);

    const rows = await ctx.client.query<{ season_id: number; league_id: number }>(
      `SELECT season_id, league_id FROM team_entries WHERE team_id = $1 ORDER BY season_id`, [squad]);
    expect(rows.rows).toEqual([
      { season_id: archived, league_id: u14old },
      { season_id: active, league_id: u16real }, // committed beats vorabliga
    ]);
  });

  it("falls back to match participation when the league table is empty", async () => {
    const active = await seedSeason("2026/27", "active");
    const upcoming = await seedSeason("2027/28", "upcoming");
    const u10 = await seedLeague(4, "U10 Kreisliga", upcoming);
    const squadId = await seedTeam(2000, "Dragons U10");
    await seedTeam(3000, "Opponent U10", false); // matches.guest_team_api_id FKs to teams.api_team_permanent_id
    // No standings row — only a fixture names the squad.
    await ctx.client.query(
      `INSERT INTO matches (api_match_id, league_id, home_team_api_id, guest_team_api_id, match_no, match_day, kickoff_date, kickoff_time)
       VALUES (9, $1, 2000, 3000, 1, 1, '2027-09-01', '10:00')`, [u10]);
    // An active-season entry for the same squad, via standings in an active league.
    const activeLeague = await seedLeague(5, "U10 Mini", active);
    await ctx.client.query(
      `INSERT INTO standings (league_id, team_api_id, position) VALUES ($1, 2000, 1)`, [activeLeague]);

    for (const sql of backfillInsertStatements()) await ctx.client.exec(sql);

    const rows = await ctx.client.query<{ season_id: number; league_id: number }>(
      `SELECT season_id, league_id FROM team_entries WHERE team_id = $1 ORDER BY season_id`, [squadId]);
    expect(rows.rows).toEqual([
      { season_id: active, league_id: activeLeague }, // via standings
      { season_id: upcoming, league_id: u10 }, // via match participation fallback
    ]);
  });

  it("falls back to a NULL-league entry for an own-club squad with no standings and no matches", async () => {
    const active = await seedSeason("2026/27", "active");
    await seedSeason("2025/26", "archived");
    // A brand-new squad: no standings row, no fixture, in any league.
    await seedTeam(5000, "Dragons U8");

    for (const sql of backfillInsertStatements()) await ctx.client.exec(sql);

    const rows = await ctx.client.query<{ season_id: number; league_id: number | null }>(
      `SELECT season_id, league_id FROM team_entries te
       JOIN teams t ON t.id = te.team_id WHERE t.api_team_permanent_id = 5000`);
    // Only the active season gets a fallback entry (archived is excluded by
    // the fallback's status filter, and there is no upcoming season here).
    expect(rows.rows).toEqual([{ season_id: active, league_id: null }]);
  });

  it("creates no entries for non-own-club teams", async () => {
    const active = await seedSeason("2026/27", "active");
    const league = await seedLeague(6, "U12", active);
    await seedTeam(4000, "Rival U12", false);
    await ctx.client.query(
      `INSERT INTO standings (league_id, team_api_id, position) VALUES ($1, 4000, 1)`, [league]);

    for (const sql of backfillInsertStatements()) await ctx.client.exec(sql);

    const rows = await ctx.client.query(`SELECT id FROM team_entries`);
    expect(rows.rows).toHaveLength(0);
  });
});

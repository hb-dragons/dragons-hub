// apps/api/src/services/admin/season-isolation.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, resetTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () => new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));

import { getStandings } from "./standings-admin.service";
import { activateSeason, invalidateActiveSeasonCache } from "./season.service";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await ctx.client.close(); });
beforeEach(async () => { await resetTestDb(ctx); invalidateActiveSeasonCache(); vi.clearAllMocks(); });

describe("season isolation: public standings follow the active season across activation", () => {
  it("switches visible standings when the active season changes", async () => {
    // --- Seed active season 2025/26 ---
    const activeResult = await ctx.client.query<{ id: number }>(
      `INSERT INTO seasons (name, status) VALUES ('2025/26', 'active') RETURNING id`,
    );
    const activeSeasonId = activeResult.rows[0]!.id;

    // Seed upcoming season 2026/27 (one-active partial-unique index means only one active at a time)
    const upcomingResult = await ctx.client.query<{ id: number }>(
      `INSERT INTO seasons (name, status) VALUES ('2026/27', 'upcoming') RETURNING id`,
    );
    const upcomingSeasonId = upcomingResult.rows[0]!.id;

    // League A belongs to active 2025/26
    const leagueAResult = await ctx.client.query<{ id: number }>(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked)
       VALUES (1, 4100, 'Liga A', 2025, '2025/26', $1, true) RETURNING id`,
      [activeSeasonId],
    );
    const leagueAId = leagueAResult.rows[0]!.id;

    // League B belongs to upcoming 2026/27
    const leagueBResult = await ctx.client.query<{ id: number }>(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked)
       VALUES (2, 4101, 'Liga B', 2026, '2026/27', $1, true) RETURNING id`,
      [upcomingSeasonId],
    );
    const leagueBId = leagueBResult.rows[0]!.id;

    // Teams
    await ctx.client.query(
      `INSERT INTO teams (api_team_permanent_id, season_team_id, team_competition_id, name, club_id, is_own_club)
       VALUES (1000, 1, 1, 'Team A', 100, false)`,
    );
    await ctx.client.query(
      `INSERT INTO teams (api_team_permanent_id, season_team_id, team_competition_id, name, club_id, is_own_club)
       VALUES (2000, 2, 2, 'Team B', 200, false)`,
    );

    // Standing in Liga A (active season)
    await ctx.client.query(
      `INSERT INTO standings (league_id, team_api_id, position, played, won, lost,
         points_for, points_against, points_diff, league_points)
       VALUES ($1, 1000, 1, 10, 8, 2, 800, 700, 100, 16)`,
      [leagueAId],
    );

    // Standing in Liga B (upcoming season)
    await ctx.client.query(
      `INSERT INTO standings (league_id, team_api_id, position, played, won, lost,
         points_for, points_against, points_diff, league_points)
       VALUES ($1, 2000, 1, 5, 3, 2, 500, 400, 100, 6)`,
      [leagueBId],
    );

    // --- Assert: only Liga A's standing is visible (active season) ---
    const before = await getStandings();
    expect(before).toHaveLength(1);
    expect(before[0]!.leagueName).toBe("Liga A");

    // --- Activate the upcoming season (archives 2025/26, activates 2026/27) ---
    await activateSeason(upcomingSeasonId);
    invalidateActiveSeasonCache();

    // --- Assert: only Liga B's standing is visible (new active season) ---
    const after = await getStandings();
    expect(after).toHaveLength(1);
    expect(after[0]!.leagueName).toBe("Liga B");
  });
});

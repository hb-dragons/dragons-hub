// apps/api/src/services/admin/season.service.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, resetTestDb, type TestDbContext } from "../../test/setup-test-db";
import { seedActiveSeason } from "../../test/seed-season";

const { dbHolder, getSpielplan } = vi.hoisted(() => ({
  dbHolder: { ref: null as unknown },
  getSpielplan: vi.fn(),
}));
vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));
vi.mock("../sync/sdk-client", () => ({
  sdkClient: { getSpielplan },
}));

import {
  createSeason, listSeasons, getActiveSeason, getActiveSeasonId,
  invalidateActiveSeasonCache, activateSeason, archiveSeason, getSeasonSummary,
} from "./season.service";
import { leagues, teams, matches } from "@dragons/db/schema";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await ctx.client.close(); });
beforeEach(async () => { await resetTestDb(ctx); invalidateActiveSeasonCache(); vi.clearAllMocks(); });

describe("season.service", () => {
  it("creates an upcoming season", async () => {
    const s = await createSeason({ name: "2026/27", sdkSeasonId: 2026 });
    expect(s.status).toBe("upcoming");
    expect(s.name).toBe("2026/27");
    expect(s.sdkSeasonId).toBe(2026);
  });

  it("getActiveSeason returns the active row, null when none", async () => {
    expect(await getActiveSeason()).toBeNull();
    await ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2025/26','active')`);
    invalidateActiveSeasonCache();
    expect((await getActiveSeason())?.name).toBe("2025/26");
  });

  it("activateSeason archives the current active and activates the target", async () => {
    await ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2025/26','active')`);
    const next = await createSeason({ name: "2026/27" });
    const activated = await activateSeason(next.id);
    expect(activated.status).toBe("active");
    const rows = await ctx.client.query<{ name: string; status: string }>(
      `SELECT name, status FROM seasons ORDER BY name`,
    );
    expect(rows.rows).toEqual([
      { name: "2025/26", status: "archived" },
      { name: "2026/27", status: "active" },
    ]);
  });

  it("listSeasons includes league counts", async () => {
    const a = await ctx.client.query<{ id: number }>(
      `INSERT INTO seasons (name, status) VALUES ('2025/26','active') RETURNING id`,
    );
    const sid = a.rows[0]!.id;
    // legacy season_id (SDK int) = 2025; new FK season_ref_id = the seasons.id
    await ctx.client.query(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id)
       VALUES (1, 10, 'L1', 2025, '2025/26', $1)`,
      [sid],
    );
    const list = await listSeasons();
    expect(list.find((s) => s.id === sid)?.leagueCount).toBe(1);
  });

  it("getActiveSeasonId caches and invalidates", async () => {
    await ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2025/26','active')`);
    invalidateActiveSeasonCache();
    const first = await getActiveSeasonId();
    expect(first).not.toBeNull();
    await ctx.client.query(`UPDATE seasons SET status='archived'`);
    expect(await getActiveSeasonId()).toBe(first); // cached
    invalidateActiveSeasonCache();
    expect(await getActiveSeasonId()).toBeNull(); // fresh read
  });

  it("archiveSeason sets a season to archived", async () => {
    const r = await ctx.client.query<{ id: number }>(
      `INSERT INTO seasons (name, status) VALUES ('2026/27','upcoming') RETURNING id`,
    );
    const archived = await archiveSeason(r.rows[0]!.id);
    expect(archived.status).toBe("archived");
  });
});

describe("getSeasonSummary", () => {
  it("counts the season's leagues and games, and its unassigned fixture slots", async () => {
    const seasonId = await seedActiveSeason(ctx);
    const [league] = await ctx.db
      .insert(leagues)
      .values({
        apiLigaId: 501,
        ligaNr: 1,
        name: "Oberliga",
        seasonId: 0,
        seasonName: "",
        seasonRefId: seasonId,
        isTracked: true,
      })
      .returning({ id: leagues.id });

    await ctx.db.insert(teams).values([
      { apiTeamPermanentId: 11, seasonTeamId: 1, teamCompetitionId: 1, name: "A", clubId: 1 },
      { apiTeamPermanentId: 22, seasonTeamId: 2, teamCompetitionId: 2, name: "B", clubId: 2 },
    ]);
    await ctx.db.insert(matches).values({
      apiMatchId: 9001,
      matchNo: 1,
      matchDay: 1,
      leagueId: league!.id,
      homeTeamApiId: 11,
      guestTeamApiId: 22,
      kickoffDate: "2026-09-01",
      kickoffTime: "18:00:00",
    });

    // Two slots unassigned: one guest, one home.
    getSpielplan.mockResolvedValue([
      { matchId: 9001, homeTeam: { teamPermanentId: 11 }, guestTeam: { teamPermanentId: 22 } },
      { matchId: 9002, homeTeam: { teamPermanentId: 11 }, guestTeam: { teamPermanentId: 0 } },
      { matchId: 9003, homeTeam: { teamPermanentId: 0 }, guestTeam: { teamPermanentId: 22 } },
    ]);

    const summary = await getSeasonSummary(seasonId);

    expect(summary).toEqual({ leagueCount: 1, gameCount: 1, placeholderSlots: 2 });
  });

  it("ignores leagues the season does not track", async () => {
    const seasonId = await seedActiveSeason(ctx);
    await ctx.db.insert(leagues).values({
      apiLigaId: 502,
      ligaNr: 2,
      name: "Untracked",
      seasonId: 0,
      seasonName: "",
      seasonRefId: seasonId,
      isTracked: false,
    });
    getSpielplan.mockResolvedValue([
      { matchId: 1, homeTeam: { teamPermanentId: 0 }, guestTeam: { teamPermanentId: 0 } },
    ]);

    const summary = await getSeasonSummary(seasonId);

    // The league still counts toward leagueCount; only the placeholder scan is
    // tracked-only, so an untracked league contributes no slots.
    expect(summary.placeholderSlots).toBe(0);
    expect(getSpielplan).not.toHaveBeenCalled();
  });

  it("reports placeholderSlots as null when the federation cannot be read", async () => {
    const seasonId = await seedActiveSeason(ctx);
    await ctx.db.insert(leagues).values({
      apiLigaId: 503,
      ligaNr: 3,
      name: "Oberliga",
      seasonId: 0,
      seasonName: "",
      seasonRefId: seasonId,
      isTracked: true,
    });
    getSpielplan.mockRejectedValue(new Error("federation down"));

    const summary = await getSeasonSummary(seasonId);

    expect(summary.placeholderSlots).toBeNull();
    // The database-backed counts survive a federation outage.
    expect(summary.leagueCount).toBe(1);
    expect(summary.gameCount).toBe(0);
  });

  it("counts zero for a season with no leagues", async () => {
    const seasonId = await seedActiveSeason(ctx);

    const summary = await getSeasonSummary(seasonId);

    expect(summary).toEqual({ leagueCount: 0, gameCount: 0, placeholderSlots: 0 });
  });
});

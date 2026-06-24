// apps/api/src/services/admin/season.service.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, resetTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));

import {
  createSeason, listSeasons, getActiveSeason, getActiveSeasonId,
  invalidateActiveSeasonCache, activateSeason, archiveSeason,
} from "./season.service";

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
});

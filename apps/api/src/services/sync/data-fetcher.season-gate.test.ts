import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, resetTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () => new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));
// Stop the real SDK from being hit — we only care which leagues are selected.
vi.mock("./sdk-client", () => ({
  sdkClient: {
    ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
    getSpielplan: vi.fn().mockResolvedValue([]),
    getTabelle: vi.fn().mockResolvedValue([]),
    getGameDetailsBatch: vi.fn().mockResolvedValue(new Map()),
  },
}));

import { fetchAllSyncData } from "./data-fetcher";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await ctx.client.close(); });
beforeEach(async () => { await resetTestDb(ctx); vi.clearAllMocks(); });

async function seasonWithLeague(status: string, apiLigaId: number) {
  const s = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ($1,$2) RETURNING id`, [`S${apiLigaId}`, status],
  );
  await ctx.client.query(
    `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked)
     VALUES ($1, $1, 'L', 2025, 'x', $2, true)`, [apiLigaId, s.rows[0]!.id],
  );
}

describe("fetchAllSyncData season gate", () => {
  it("fetches active + upcoming leagues, skips archived", async () => {
    await seasonWithLeague("active", 100);
    await seasonWithLeague("upcoming", 200);
    await seasonWithLeague("archived", 300);
    const data = await fetchAllSyncData();
    const fetched = data.leagueData.map((l) => l.leagueApiId).sort();
    expect(fetched).toEqual([100, 200]);
  });
});

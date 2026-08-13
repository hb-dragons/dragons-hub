import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mocks (hoisted before imports) ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

// --- Imports (after mocks) ---

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { listPublicTeams } from "./team-list.service";

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

/** Task 1's helpers (team-entries.migration.test.ts) — season/team fixtures. */
async function seedSeason(name: string, status: string): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ($1, $2) RETURNING id`, [name, status]);
  return r.rows[0]!.id;
}

async function seedTeam(permanentId: number, name: string, own = true): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO teams (api_team_permanent_id, season_team_id, team_competition_id, name, club_id, is_own_club)
     VALUES ($1, $1, $1, $2, 100, $3) RETURNING id`,
    [permanentId, name, own]);
  return r.rows[0]!.id;
}

describe("listPublicTeams", () => {
  it("lists own-club teams from the active season's entries with entry-owned fields", async () => {
    const active = await seedSeason("2026/27", "active");
    const squadWith = await seedTeam(7000, "Dragons U16"); // has an entry
    await seedTeam(7001, "Dragons Retired"); // own club, no entry this season
    const rival = await seedTeam(7002, "Rivals", false); // never entries
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, custom_name, badge_color, display_order)
       VALUES ($1, $2, 'U16', 'red', 2)`, [squadWith, active]);

    const rows = await listPublicTeams();

    const ownRows = rows.filter((r) => r.isOwnClub);
    expect(ownRows.map((r) => r.name)).toEqual(["Dragons U16"]); // no-entry squad is not fielded
    expect(ownRows[0]).toMatchObject({ id: squadWith, customName: "U16", badgeColor: "red", displayOrder: 2 });
    const rivalRow = rows.find((r) => r.id === rival); // non-own teams unaffected
    expect(rivalRow).toMatchObject({
      customName: null,
      badgeColor: null,
      estimatedGameDuration: null,
      displayOrder: 0,
    });
  });

  it("orders own-club teams first (by entry displayOrder, then name), then non-own teams by name", async () => {
    const active = await seedSeason("2026/27", "active");
    await seedTeam(1, "Zeta", false);
    const alpha = await seedTeam(2, "Alpha");
    const beta = await seedTeam(3, "Beta");
    // Shares displayOrder with Beta, differing only in name — without this,
    // displayOrder alone already produces the expected array below and the
    // asc(teams.name) tiebreaker is never exercised.
    const aaron = await seedTeam(4, "Aaron");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, display_order) VALUES ($1, $2, $3)`,
      [alpha, active, 2],
    );
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, display_order) VALUES ($1, $2, $3)`,
      [beta, active, 1],
    );
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, display_order) VALUES ($1, $2, $3)`,
      [aaron, active, 1],
    );

    const result = await listPublicTeams();

    expect(result.map((t) => t.name)).toEqual(["Aaron", "Beta", "Alpha", "Zeta"]);
  });

  it("returns an empty array when no teams exist", async () => {
    expect(await listPublicTeams()).toEqual([]);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, type TestDbContext } from "../../test/setup-test-db";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); });
afterAll(async () => { await ctx.client.close(); });

describe("seasons migration", () => {
  it("creates the seasons table with the expected columns", async () => {
    const cols = await ctx.client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'seasons'`,
    );
    const names = cols.rows.map((r) => r.column_name).sort();
    expect(names).toEqual(
      ["created_at", "end_date", "id", "name", "sdk_season_id", "start_date", "status", "updated_at"].sort(),
    );
  });

  it("adds season_ref_id and vorabliga to leagues", async () => {
    const cols = await ctx.client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'leagues' AND column_name IN ('season_ref_id','vorabliga')`,
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual(["season_ref_id", "vorabliga"]);
  });

  it("allows only one active season", async () => {
    await ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2025/26', 'active')`);
    await expect(
      ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2026/27', 'active')`),
    ).rejects.toThrow();
    // upcoming + archived are unconstrained
    await ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2026/27', 'upcoming')`);
    await ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2024/25', 'archived')`);
    const count = await ctx.client.query<{ n: number }>(`SELECT count(*)::int AS n FROM seasons`);
    expect(count.rows[0]!.n).toBe(3);
  });
});

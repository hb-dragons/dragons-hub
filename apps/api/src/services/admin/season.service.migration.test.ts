import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setupTestDb, type TestDbContext } from "../../test/setup-test-db";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); });
afterAll(async () => { await ctx.client.close(); });

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../../../../packages/db/drizzle/0046_busy_hammerhead.sql",
);

/**
 * The backfill statements from the shipped migration, verbatim.
 *
 * Read out of the .sql file rather than restated here: a copy would drift, and
 * the point of these tests is that the SQL we actually ship survives the data
 * shapes below. The statements are everything between adding the temporary
 * grouping column and dropping it, plus the drop itself.
 */
async function backfillStatements(): Promise<string[]> {
  const sql = await readFile(MIGRATION, "utf-8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  const start = statements.findIndex((s) => s.includes('ADD COLUMN "season_group_key"'));
  const end = statements.findIndex((s) => s.includes('DROP COLUMN "season_group_key"'));
  expect(start, "backfill start statement not found in the migration").toBeGreaterThanOrEqual(0);
  expect(end, "backfill end statement not found in the migration").toBeGreaterThan(start);
  return statements.slice(start, end + 1);
}

/**
 * Rebuild the pre-migration world in a scratch schema — `leagues` as it looked
 * before (no season_ref_id) plus an empty `seasons` — and run the real backfill
 * over it. Running it against the live `public` tables is not possible: the
 * migration has already been applied there, so `season_ref_id` is NOT NULL and
 * no legacy row can be inserted to back-fill in the first place.
 */
async function runBackfill(legacy: { seasonName: string; seasonId: number }[]) {
  await ctx.client.exec(`
    DROP SCHEMA IF EXISTS backfill_test CASCADE;
    CREATE SCHEMA backfill_test;
    CREATE TABLE backfill_test.leagues (
      id serial PRIMARY KEY,
      season_id integer NOT NULL,
      season_name varchar(100) NOT NULL,
      season_ref_id integer
    );
    CREATE TABLE backfill_test.seasons (
      id serial PRIMARY KEY,
      name varchar(100) NOT NULL,
      sdk_season_id integer,
      status varchar(20) NOT NULL
    );
  `);
  for (const l of legacy) {
    await ctx.client.query(
      `INSERT INTO backfill_test.leagues (season_id, season_name) VALUES ($1, $2)`,
      [l.seasonId, l.seasonName],
    );
  }

  await ctx.client.exec("SET search_path TO backfill_test;");
  try {
    for (const statement of await backfillStatements()) {
      await ctx.client.exec(statement);
    }
    // The constraint the migration adds right after the backfill. If the
    // backfill produced two active seasons, this is where it would have aborted.
    await ctx.client.exec(`
      CREATE UNIQUE INDEX seasons_one_active_uniq ON seasons (status) WHERE status = 'active';
      ALTER TABLE leagues ALTER COLUMN season_ref_id SET NOT NULL;
    `);
  } finally {
    await ctx.client.exec("SET search_path TO public;");
  }

  const seasons = await ctx.client.query<{ name: string; sdk_season_id: number; status: string }>(
    `SELECT name, sdk_season_id, status FROM backfill_test.seasons ORDER BY name`,
  );
  const leagues = await ctx.client.query<{ season_name: string; name: string }>(
    `SELECT l.season_name, s.name FROM backfill_test.leagues l
     JOIN backfill_test.seasons s ON s.id = l.season_ref_id ORDER BY l.id`,
  );
  return { seasons: seasons.rows, leagues: leagues.rows };
}

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

  it("leaves no temporary grouping column behind", async () => {
    const cols = await ctx.client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'leagues' AND column_name = 'season_group_key'`,
    );
    expect(cols.rows).toEqual([]);
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

describe("seasons migration backfill", () => {
  it("puts one season per season_name and makes the newest active", async () => {
    const { seasons, leagues } = await runBackfill([
      { seasonName: "2024/25", seasonId: 2024 },
      { seasonName: "2024/25", seasonId: 2024 },
      { seasonName: "2025/26", seasonId: 2025 },
    ]);

    expect(seasons).toEqual([
      { name: "2024/25", sdk_season_id: 2024, status: "archived" },
      { name: "2025/26", sdk_season_id: 2025, status: "active" },
    ]);
    expect(leagues.map((l) => [l.season_name, l.name])).toEqual([
      ["2024/25", "2024/25"],
      ["2024/25", "2024/25"],
      ["2025/26", "2025/26"],
    ]);
  });

  it("activates exactly one season when two name groups tie on season_id", async () => {
    // The federation reuses one season_id across differently-named competitions.
    // Marking every group holding the max active produced two active rows and
    // the partial unique index aborted the migration.
    const { seasons } = await runBackfill([
      { seasonName: "2025/26 Herren", seasonId: 2025 },
      { seasonName: "2025/26 Damen", seasonId: 2025 },
    ]);

    expect(seasons.filter((s) => s.status === "active")).toHaveLength(1);
    expect(seasons).toHaveLength(2);
  });

  it("labels a blank season_name from its legacy season id rather than failing", async () => {
    // seasons.name is NOT NULL, so an empty season_name cannot simply be copied.
    const { seasons, leagues } = await runBackfill([
      { seasonName: "", seasonId: 2025 },
      { seasonName: "   ", seasonId: 2025 },
    ]);

    expect(seasons).toEqual([{ name: "Season 2025", sdk_season_id: 2025, status: "active" }]);
    expect(leagues).toHaveLength(2);
  });

  it("assigns every league a season, so the NOT NULL that follows holds", async () => {
    const { leagues } = await runBackfill([
      { seasonName: "2025/26", seasonId: 2025 },
      { seasonName: "", seasonId: 2024 },
      { seasonName: "2023/24", seasonId: 2023 },
    ]);

    expect(leagues).toHaveLength(3);
  });

  it("is a no-op on an empty leagues table", async () => {
    const { seasons, leagues } = await runBackfill([]);

    expect(seasons).toEqual([]);
    expect(leagues).toEqual([]);
  });
});

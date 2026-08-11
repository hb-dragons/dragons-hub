import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { readdir } from "node:fs/promises";
import * as path from "node:path";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "./setup-test-db";
import { seedActiveSeason } from "./seed-season";
import { leagues, venueBookings, venues } from "@dragons/db/schema";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

describe("setupTestDb", () => {
  it("creates all expected tables", async () => {
    const result = await ctx.client.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tableNames = result.rows.map((r) => r.table_name);

    expect(tableNames).toContain("leagues");
    expect(tableNames).toContain("teams");
    expect(tableNames).toContain("matches");
    expect(tableNames).toContain("venues");
    expect(tableNames).toContain("referees");
    expect(tableNames).toContain("domain_events");
    expect(tableNames).toContain("boards");
  });

  it("records every migration file as applied", async () => {
    const migrationsFolder = path.resolve(
      import.meta.dirname,
      "../../../../packages/db/drizzle",
    );
    const files = (await readdir(migrationsFolder)).filter((f) =>
      f.endsWith(".sql"),
    );

    const applied = await ctx.client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
    );

    expect(applied.rows[0]!.n).toBe(files.length);
  });

  it("supports Drizzle ORM insert and select", async () => {
    const seasonRefId = await seedActiveSeason(ctx);
    const [league] = await ctx.db
      .insert(leagues)
      .values({
        apiLigaId: 58001,
        ligaNr: 4102,
        name: "Regionalliga West",
        seasonId: 100,
        seasonName: "2025/26",
        seasonRefId,
      })
      .returning();

    expect(league!.id).toBe(1);
    expect(league!.name).toBe("Regionalliga West");
  });

  // Boots a *second* PGlite instance, which is the whole point — the
  // independence property is what is under test, so this cannot be made to
  // share `ctx`. That boot is CPU-heavy, and under v8 coverage instrumentation
  // plus a loaded box it blew through vitest's 5s default (issue #139).
  //
  // Measured on a 24-core machine, this test against increasing contention:
  // idle 421ms, 32 spinners 2.1s, 96 spinners 3.8s, 256 spinners 8.7s (fails).
  // Nothing about the assertion is slow and the boot cost is bounded, so the
  // fixture-heavy cases get an explicit timeout rather than the global default
  // being raised — that default is what catches genuinely hung tests.
  it("hands out independent databases", async () => {
    const other = await setupTestDb();
    try {
      await other.db.insert(venues).values({ apiId: 1, name: "Other hall" });

      await resetTestDb(ctx);

      expect(await other.db.select().from(venues)).toHaveLength(1);
    } finally {
      await closeTestDb(other);
    }
  }, 30_000);
});

describe("resetTestDb", () => {
  beforeEach(async () => {
    await resetTestDb(ctx);
  });

  it("truncates all data", async () => {
    const seasonRefId = await seedActiveSeason(ctx);
    await ctx.db.insert(leagues).values({
      apiLigaId: 99999,
      ligaNr: 1,
      name: "Test",
      seasonId: 1,
      seasonName: "Test",
      seasonRefId,
    });

    await resetTestDb(ctx);

    const result = await ctx.db.select().from(leagues);
    expect(result).toEqual([]);
  });

  // The other second-instance case; same reasoning and same measurements as
  // "hands out independent databases" above (issue #139). A fresh database is
  // required because the migration-seeded rows only exist before the first
  // reset, so `ctx` cannot stand in for it.
  it("clears migration-seeded tables the first time it runs", async () => {
    const fresh = await setupTestDb();
    try {
      const before = await fresh.client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM sync_schedule`,
      );
      expect(before.rows[0]!.n).toBeGreaterThan(0);

      await resetTestDb(fresh);

      const after = await fresh.client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM sync_schedule`,
      );
      expect(after.rows[0]!.n).toBe(0);
    } finally {
      await closeTestDb(fresh);
    }
  }, 30_000);

  it("clears rows regardless of foreign-key ordering", async () => {
    const [venue] = await ctx.db
      .insert(venues)
      .values({ apiId: 7, name: "Sporthalle" })
      .returning();
    await ctx.db.insert(venueBookings).values({
      venueId: venue!.id,
      date: "2026-01-01",
      calculatedStartTime: "18:00:00",
      calculatedEndTime: "20:00:00",
    });

    await resetTestDb(ctx);

    expect(await ctx.db.select().from(venueBookings)).toEqual([]);
    expect(await ctx.db.select().from(venues)).toEqual([]);
  });

  it("leaves foreign-key enforcement on afterwards", async () => {
    const role = await ctx.client.query<{ session_replication_role: string }>(
      `SHOW session_replication_role`,
    );
    expect(role.rows[0]!.session_replication_role).toBe("origin");

    await expect(
      ctx.db.insert(venueBookings).values({
        venueId: 12345,
        date: "2026-01-01",
        calculatedStartTime: "18:00:00",
        calculatedEndTime: "20:00:00",
      }),
    ).rejects.toThrow();
  });

  it("resets sequences to 1", async () => {
    const seasonRefId = await seedActiveSeason(ctx);
    const [first] = await ctx.db
      .insert(leagues)
      .values({
        apiLigaId: 1,
        ligaNr: 1,
        name: "First",
        seasonId: 1,
        seasonName: "Test",
        seasonRefId,
      })
      .returning();

    expect(first!.id).toBe(1);
  });

  it("resets a sequence advanced by a rolled-back insert", async () => {
    const rolledBackSeason = await seedActiveSeason(ctx);
    await ctx.client.exec(`
      BEGIN;
      INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id)
      VALUES (42, 42, 'Rolled back', 1, 'Test', ${rolledBackSeason});
      ROLLBACK;
    `);
    expect(await ctx.db.select().from(leagues)).toEqual([]);

    await resetTestDb(ctx);

    // The reset took the season with it, so this needs its own.
    const seasonRefId = await seedActiveSeason(ctx);
    const [row] = await ctx.db
      .insert(leagues)
      .values({
        apiLigaId: 43,
        ligaNr: 43,
        name: "After",
        seasonId: 1,
        seasonName: "Test",
        seasonRefId,
      })
      .returning();
    expect(row!.id).toBe(1);
  });

  it("is a no-op on an already clean database", async () => {
    await expect(resetTestDb(ctx)).resolves.toBeUndefined();

    expect(await ctx.db.select().from(leagues)).toEqual([]);
  });
});

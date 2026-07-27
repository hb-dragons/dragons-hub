import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { readdir } from "node:fs/promises";
import * as path from "node:path";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "./setup-test-db";
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
    const [league] = await ctx.db
      .insert(leagues)
      .values({
        apiLigaId: 58001,
        ligaNr: 4102,
        name: "Regionalliga West",
        seasonId: 100,
        seasonName: "2025/26",
      })
      .returning();

    expect(league!.id).toBe(1);
    expect(league!.name).toBe("Regionalliga West");
  });

  it("hands out independent databases", async () => {
    const other = await setupTestDb();
    try {
      await other.db.insert(venues).values({ apiId: 1, name: "Other hall" });

      await resetTestDb(ctx);

      expect(await other.db.select().from(venues)).toHaveLength(1);
    } finally {
      await closeTestDb(other);
    }
  });
});

describe("resetTestDb", () => {
  beforeEach(async () => {
    await resetTestDb(ctx);
  });

  it("truncates all data", async () => {
    await ctx.db.insert(leagues).values({
      apiLigaId: 99999,
      ligaNr: 1,
      name: "Test",
      seasonId: 1,
      seasonName: "Test",
    });

    await resetTestDb(ctx);

    const result = await ctx.db.select().from(leagues);
    expect(result).toEqual([]);
  });

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
  });

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
    const [first] = await ctx.db
      .insert(leagues)
      .values({
        apiLigaId: 1,
        ligaNr: 1,
        name: "First",
        seasonId: 1,
        seasonName: "Test",
      })
      .returning();

    expect(first!.id).toBe(1);
  });

  it("resets a sequence advanced by a rolled-back insert", async () => {
    await ctx.client.exec(`
      BEGIN;
      INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name)
      VALUES (42, 42, 'Rolled back', 1, 'Test');
      ROLLBACK;
    `);
    expect(await ctx.db.select().from(leagues)).toEqual([]);

    await resetTestDb(ctx);

    const [row] = await ctx.db
      .insert(leagues)
      .values({
        apiLigaId: 43,
        ligaNr: 43,
        name: "After",
        seasonId: 1,
        seasonName: "Test",
      })
      .returning();
    expect(row!.id).toBe(1);
  });

  it("is a no-op on an already clean database", async () => {
    await expect(resetTestDb(ctx)).resolves.toBeUndefined();

    expect(await ctx.db.select().from(leagues)).toEqual([]);
  });
});

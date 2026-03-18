import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "./setup-test-db";
import { leagues } from "@dragons/db/schema";

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

    expect(league.id).toBe(1);
    expect(league.name).toBe("Regionalliga West");
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

    expect(first.id).toBe(1);
  });
});

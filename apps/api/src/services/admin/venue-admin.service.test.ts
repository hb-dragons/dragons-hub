import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

// --- Imports (after mocks) ---

import { searchVenues, getVenues } from "./venue-admin.service";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

// --- PGlite setup ---

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

// --- Helpers ---

async function insertVenue(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_id: 1,
    name: "Sporthalle Mitte",
    city: "Berlin",
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await ctx.client.query(
    `INSERT INTO venues (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

// --- Tests ---

describe("searchVenues", () => {
  it("returns empty array when no venues match", async () => {
    await insertVenue({ name: "Sporthalle Mitte" });

    const result = await searchVenues("xyz");

    expect(result).toEqual([]);
  });

  it("finds venues by partial name match", async () => {
    await insertVenue({ api_id: 1, name: "Sporthalle Mitte", street: "Hauptstr. 1", city: "Berlin" });
    await insertVenue({ api_id: 2, name: "Turnhalle Nord", city: "Hamburg" });

    const result = await searchVenues("Sport");

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Sporthalle Mitte");
    expect(result[0]!.street).toBe("Hauptstr. 1");
    expect(result[0]!.city).toBe("Berlin");
  });

  it("is case-insensitive", async () => {
    await insertVenue({ api_id: 1, name: "Sporthalle Mitte" });

    const result = await searchVenues("sporthalle");

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Sporthalle Mitte");
  });

  it("returns id, name, street, city fields", async () => {
    await insertVenue({ api_id: 1, name: "Sporthalle Mitte", street: "Hauptstr. 1", city: "Berlin" });

    const result = await searchVenues("Sport");

    expect(Object.keys(result[0]!).sort()).toEqual(["city", "id", "name", "street"]);
  });

  it("returns null city and street when venue has neither", async () => {
    await insertVenue({ api_id: 1, name: "Sporthalle Mitte", city: null });

    const result = await searchVenues("Sport");

    expect(result[0]!.city).toBeNull();
    expect(result[0]!.street).toBeNull();
  });

  it("respects limit parameter", async () => {
    await insertVenue({ api_id: 1, name: "Sporthalle A", city: "Berlin" });
    await insertVenue({ api_id: 2, name: "Sporthalle B", city: "Hamburg" });
    await insertVenue({ api_id: 3, name: "Sporthalle C", city: "Munich" });

    const result = await searchVenues("Sporthalle", 2);

    expect(result).toHaveLength(2);
  });

  it("uses default limit of 10", async () => {
    for (let i = 1; i <= 12; i++) {
      await insertVenue({ api_id: i, name: `Halle ${i}` });
    }

    const result = await searchVenues("Halle");

    expect(result).toHaveLength(10);
  });

  it("matches anywhere in the name", async () => {
    await insertVenue({ api_id: 1, name: "Große Sporthalle" });

    const result = await searchVenues("Sporthalle");

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Große Sporthalle");
  });
});

describe("getVenues", () => {
  it("returns empty array when no venues exist", async () => {
    const result = await getVenues();
    expect(result).toEqual([]);
  });

  it("returns all venues ordered by name", async () => {
    await insertVenue({ api_id: 1, name: "Zeppelin Halle", city: "Munich" });
    await insertVenue({ api_id: 2, name: "Arena Berlin", city: "Berlin" });

    const result = await getVenues();

    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("Arena Berlin");
    expect(result[1]!.name).toBe("Zeppelin Halle");
  });

  it("includes all address fields", async () => {
    await insertVenue({
      api_id: 1,
      name: "Sporthalle",
      street: "Hauptstr. 1",
      postal_code: "53604",
      city: "Bad Honnef",
      latitude: 50.6451234,
      longitude: 7.2276543,
    });

    const result = await getVenues();

    expect(result[0]).toMatchObject({
      name: "Sporthalle",
      street: "Hauptstr. 1",
      postalCode: "53604",
      city: "Bad Honnef",
    });
    expect(result[0]!.latitude).not.toBeNull();
    expect(result[0]!.longitude).not.toBeNull();
  });

  it("returns null for missing optional fields", async () => {
    await insertVenue({ api_id: 1, name: "Halle", city: null });

    const result = await getVenues();

    expect(result[0]!.street).toBeNull();
    expect(result[0]!.postalCode).toBeNull();
    expect(result[0]!.city).toBeNull();
    expect(result[0]!.latitude).toBeNull();
    expect(result[0]!.longitude).toBeNull();
  });

  it("includes apiId field", async () => {
    await insertVenue({ api_id: 42, name: "Test Halle" });

    const result = await getVenues();

    expect(result[0]!.apiId).toBe(42);
  });
});

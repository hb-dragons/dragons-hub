import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

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

import { searchVenues } from "./venue-admin.service";

// --- PGlite setup ---

const CREATE_TABLES = `
  CREATE TABLE venues (
    id SERIAL PRIMARY KEY,
    api_id INTEGER NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    street VARCHAR(200),
    postal_code VARCHAR(10),
    city VARCHAR(100),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

let client: PGlite;

beforeAll(async () => {
  const pglite = await import("@electric-sql/pglite");
  const drizzlePglite = await import("drizzle-orm/pglite");

  client = new pglite.PGlite();
  dbHolder.ref = drizzlePglite.drizzle(client);

  await client.exec(CREATE_TABLES);
});

beforeEach(async () => {
  await client.exec("DELETE FROM venues");
  await client.exec("ALTER SEQUENCE venues_id_seq RESTART WITH 1");
  vi.clearAllMocks();
});

afterAll(async () => {
  await client.close();
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
  const result = await client.query(
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

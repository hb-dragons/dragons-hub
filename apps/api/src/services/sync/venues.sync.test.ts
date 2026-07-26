import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import type { SdkSpielfeld } from "@dragons/sdk";

// Real Postgres (pglite) with the real migrations, the real `sql` template and the
// real `computeEntityHash`. The previous mocked-ORM version of this file stubbed
// `sql` to an identity function and `computeEntityHash` to a constant, so the
// `setWhere: excluded.data_hash != venues.data_hash` guard — the whole point of the
// upsert — was never executed. Inverting `!=` to `=` left all 14 tests green.
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

import { syncVenuesFromData, buildVenueIdLookup } from "./venues.sync";
import { computeEntityHash } from "./hash";
import { venues } from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  dbHolder.ref = ctx.db;
  vi.clearAllMocks();
  // Only Date is faked: pglite's WASM I/O needs real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2025-06-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

function makeVenue(overrides: Partial<SdkSpielfeld> = {}): SdkSpielfeld {
  return {
    id: 1,
    bezeichnung: "Sports Hall",
    strasse: "Main St 1",
    plz: "12345",
    ort: "Berlin",
    kurzname: "SH",
    score: 0,
    ...overrides,
  };
}

async function venueRows() {
  return ctx.db.select().from(venues).orderBy(venues.apiId);
}

async function venueRow(apiId: number) {
  const [row] = await ctx.db.select().from(venues).where(eq(venues.apiId, apiId));
  if (!row) throw new Error(`venue ${apiId} not found`);
  return row;
}

/** Point getDb() at a db whose insert/select rejects, to drive the catch branch. */
async function withFailingDb<T>(reason: unknown, fn: () => Promise<T>): Promise<T> {
  const failing = {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: () => Promise.reject(reason),
        }),
      }),
    }),
  };
  dbHolder.ref = failing;
  try {
    return await fn();
  } finally {
    dbHolder.ref = ctx.db;
  }
}

describe("syncVenuesFromData", () => {
  it("returns early for empty map without touching the database", async () => {
    const result = await syncVenuesFromData(new Map());

    expect(result.total).toBe(0);
    expect(await venueRows()).toEqual([]);
  });

  it("creates new venues with the mapped columns persisted", async () => {
    const result = await syncVenuesFromData(new Map([[1, makeVenue()]]));

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.total).toBe(1);

    const row = await venueRow(1);
    expect(row.name).toBe("Sports Hall");
    expect(row.street).toBe("Main St 1");
    expect(row.postalCode).toBe("12345");
    expect(row.city).toBe("Berlin");
    expect(row.dataHash).toBe(
      computeEntityHash({
        id: 1,
        bezeichnung: "Sports Hall",
        strasse: "Main St 1",
        plz: "12345",
        ort: "Berlin",
      }),
    );
  });

  it("skips an unchanged venue on re-sync (dataHash change detection)", async () => {
    const first = await syncVenuesFromData(new Map([[1, makeVenue()]]));
    expect(first.created).toBe(1);
    const afterCreate = await venueRow(1);

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    const second = await syncVenuesFromData(new Map([[1, makeVenue()]]));

    expect(second.skipped).toBe(1);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);

    // The upsert must not have fired: updatedAt is untouched.
    const afterResync = await venueRow(1);
    expect(afterResync.updatedAt.getTime()).toBe(afterCreate.updatedAt.getTime());
    expect(afterResync.dataHash).toBe(afterCreate.dataHash);
  });

  it("updates a venue whose hashed fields changed", async () => {
    await syncVenuesFromData(new Map([[1, makeVenue()]]));
    const afterCreate = await venueRow(1);

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    const result = await syncVenuesFromData(
      new Map([[1, makeVenue({ bezeichnung: "New Hall", ort: "Hamburg" })]]),
    );

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);

    const row = await venueRow(1);
    expect(row.name).toBe("New Hall");
    expect(row.city).toBe("Hamburg");
    expect(row.dataHash).not.toBe(afterCreate.dataHash);
    expect(row.updatedAt.getTime()).toBeGreaterThan(afterCreate.updatedAt.getTime());
    expect(row.createdAt.getTime()).toBe(afterCreate.createdAt.getTime());
  });

  it("ignores changes to fields outside the hashed subset", async () => {
    await syncVenuesFromData(new Map([[1, makeVenue()]]));
    const afterCreate = await venueRow(1);

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    // kurzname/score are not part of venueHashData, so nothing should move.
    const result = await syncVenuesFromData(
      new Map([[1, makeVenue({ kurzname: "XX", score: 99 })]]),
    );

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect((await venueRow(1)).updatedAt.getTime()).toBe(afterCreate.updatedAt.getTime());
  });

  it("counts created and skipped separately in a mixed batch", async () => {
    await syncVenuesFromData(new Map([[1, makeVenue()]]));

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    const result = await syncVenuesFromData(
      new Map([
        [1, makeVenue()],
        [2, makeVenue({ id: 2, bezeichnung: "Second Hall" })],
      ]),
    );

    expect(result.total).toBe(2);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
    expect((await venueRows()).map((v) => v.name)).toEqual(["Sports Hall", "Second Hall"]);
  });

  it("handles batch error and leaves the table untouched", async () => {
    const result = await withFailingDb(new Error("DB error"), () =>
      syncVenuesFromData(new Map([[1, makeVenue()]])),
    );

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Batch venue sync failed");
    expect(result.errors[0]).toContain("DB error");
    expect(await venueRows()).toEqual([]);
  });

  it("handles non-Error exception", async () => {
    const result = await withFailingDb("string", () =>
      syncVenuesFromData(new Map([[1, makeVenue()]])),
    );

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("persists a default name when bezeichnung is empty", async () => {
    await syncVenuesFromData(new Map([[99, makeVenue({ id: 99, bezeichnung: "" })]]));

    expect((await venueRow(99)).name).toBe("Venue 99");
  });

  it("persists a trimmed bezeichnung", async () => {
    await syncVenuesFromData(new Map([[1, makeVenue({ bezeichnung: "  Hall  " })]]));

    expect((await venueRow(1)).name).toBe("Hall");
  });

  it("logs the 'skipped' action when all entries are skipped", async () => {
    await syncVenuesFromData(new Map([[1, makeVenue()]]));
    const mockLogger = { log: vi.fn() };

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    await syncVenuesFromData(new Map([[1, makeVenue()]]), mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "venue",
        action: "skipped",
        metadata: { created: 0, updated: 0, skipped: 1 },
      }),
    );
  });

  it("logs the 'updated' action when changes exist", async () => {
    const mockLogger = { log: vi.fn() };

    await syncVenuesFromData(new Map([[1, makeVenue()]]), mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "venue",
        action: "updated",
        metadata: { created: 1, updated: 0, skipped: 0 },
      }),
    );
  });

  it("logs failure to the sync logger", async () => {
    const mockLogger = { log: vi.fn() };

    await withFailingDb(new Error("fail"), () =>
      syncVenuesFromData(new Map([[1, makeVenue()]]), mockLogger as never),
    );

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "venue", action: "failed" }),
    );
  });

  it("includes durationMs", async () => {
    const result = await syncVenuesFromData(new Map());

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("stores NULL for blank optional venue fields", async () => {
    await syncVenuesFromData(
      new Map([[1, makeVenue({ strasse: "", plz: "", ort: "" })]]),
    );

    const row = await venueRow(1);
    expect(row.street).toBeNull();
    expect(row.postalCode).toBeNull();
    expect(row.city).toBeNull();
  });
});

describe("buildVenueIdLookup", () => {
  it("returns a map from apiId to the generated row id", async () => {
    await syncVenuesFromData(
      new Map([
        [10, makeVenue({ id: 10 })],
        [20, makeVenue({ id: 20, bezeichnung: "Other" })],
      ]),
    );
    const rows = await venueRows();

    const lookup = await buildVenueIdLookup();

    expect(lookup.size).toBe(2);
    expect(lookup.get(10)).toBe(rows.find((r) => r.apiId === 10)!.id);
    expect(lookup.get(20)).toBe(rows.find((r) => r.apiId === 20)!.id);
  });

  it("returns an empty map when there are no venues", async () => {
    expect((await buildVenueIdLookup()).size).toBe(0);
  });
});

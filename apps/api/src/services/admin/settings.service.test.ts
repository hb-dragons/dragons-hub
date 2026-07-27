import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked. The previous
// version of this file stubbed `eq` with an identity function and handed back
// canned rows, so `where(eq(appSettings.key, key))` could have looked up any
// column, or a hardcoded key, and every test still passed. Everything below
// runs against a real (in-process PGlite) Postgres with the real migrations.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

// --- Imports (after mocks) ---

import {
  getSetting,
  upsertSetting,
  getClubConfig,
  setClubConfig,
  getBookingSettings,
  setBookingSettings,
} from "./settings.service";
import { appSettings } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { traceQueries, type QueryTrace } from "../../test/trace-queries";

let ctx: TestDbContext;
let trace: QueryTrace;

beforeAll(async () => {
  ctx = await setupTestDb();
  trace = traceQueries(ctx.db as object);
  dbHolder.ref = trace.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  trace.reset();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function readRaw(key: string): Promise<string | undefined> {
  const [row] = await ctx.db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key));
  return row?.value;
}

describe("getSetting", () => {
  it("returns the value stored under exactly that key", async () => {
    await ctx.db.insert(appSettings).values([
      { key: "club_id", value: "4121" },
      { key: "club_name", value: "Dragons" },
    ]);

    expect(await getSetting("club_id")).toBe("4121");
    expect(await getSetting("club_name")).toBe("Dragons");
  });

  it("does not match a row whose *value* happens to equal the key", async () => {
    // Guards against the predicate matching on the wrong column.
    await ctx.db.insert(appSettings).values({ key: "unrelated", value: "club_id" });

    expect(await getSetting("club_id")).toBeNull();
  });

  it("returns null when the key does not exist", async () => {
    await ctx.db.insert(appSettings).values({ key: "club_id", value: "4121" });

    expect(await getSetting("nonexistent")).toBeNull();
  });
});

describe("upsertSetting", () => {
  it("inserts a new row", async () => {
    await upsertSetting("club_id", "4121");

    expect(await readRaw("club_id")).toBe("4121");
  });

  it("updates in place on conflict rather than inserting a duplicate", async () => {
    await upsertSetting("club_id", "4121");
    await upsertSetting("club_id", "9999");

    const rows = await ctx.db.select().from(appSettings);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe("9999");
  });

  it("leaves other keys untouched", async () => {
    await upsertSetting("club_id", "4121");
    await upsertSetting("club_name", "Dragons");
    await upsertSetting("club_id", "1");

    expect(await readRaw("club_name")).toBe("Dragons");
  });

  it("advances updatedAt on the conflicting update", async () => {
    await upsertSetting("club_id", "4121");
    const [before] = await ctx.db.select().from(appSettings);
    await new Promise((r) => setTimeout(r, 5));
    await upsertSetting("club_id", "4122");
    const [after] = await ctx.db.select().from(appSettings);

    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
  });
});

describe("getClubConfig", () => {
  it("returns the club config when both settings exist", async () => {
    await setClubConfig(4121, "Dragons");

    expect(await getClubConfig()).toEqual({ clubId: 4121, clubName: "Dragons" });
  });

  it("returns null when club_id is not set", async () => {
    await upsertSetting("club_name", "Dragons");

    expect(await getClubConfig()).toBeNull();
  });

  it("returns an empty club name when only club_id is set", async () => {
    await upsertSetting("club_id", "4121");

    expect(await getClubConfig()).toEqual({ clubId: 4121, clubName: "" });
  });

  it("reads both keys in a single query", async () => {
    await setClubConfig(4121, "Dragons");
    trace.reset();

    await getClubConfig();

    expect(trace.startCount()).toBe(1);
  });
});

describe("setClubConfig", () => {
  it("writes club_id and club_name under their own keys", async () => {
    await setClubConfig(4121, "Dragons");

    expect(await readRaw("club_id")).toBe("4121");
    expect(await readRaw("club_name")).toBe("Dragons");
  });

  it("overwrites a previous club config", async () => {
    await setClubConfig(4121, "Dragons");
    await setClubConfig(999, "Tigers");

    expect(await getClubConfig()).toEqual({ clubId: 999, clubName: "Tigers" });
    expect(await ctx.db.select().from(appSettings)).toHaveLength(2);
  });
});

describe("getBookingSettings", () => {
  it("returns the stored settings when all four exist", async () => {
    await setBookingSettings({
      bufferBefore: 45,
      bufferAfter: 30,
      gameDuration: 120,
      dueDaysBefore: 14,
    });

    expect(await getBookingSettings()).toEqual({
      bufferBefore: 45,
      bufferAfter: 30,
      gameDuration: 120,
      dueDaysBefore: 14,
    });
  });

  it("returns the defaults when nothing is stored", async () => {
    expect(await getBookingSettings()).toEqual({
      bufferBefore: 60,
      bufferAfter: 60,
      gameDuration: 90,
      dueDaysBefore: 7,
    });
  });

  it("mixes stored values with defaults per key", async () => {
    await upsertSetting("venue_booking_buffer_before", "45");
    await upsertSetting("venue_booking_game_duration", "120");

    expect(await getBookingSettings()).toEqual({
      bufferBefore: 45,
      bufferAfter: 60,
      gameDuration: 120,
      dueDaysBefore: 7,
    });
  });

  it("keeps a stored zero rather than treating it as unset", async () => {
    await upsertSetting("venue_booking_buffer_before", "0");

    expect((await getBookingSettings()).bufferBefore).toBe(0);
  });

  it("falls back to the default when a stored value is not a number", async () => {
    await upsertSetting("venue_booking_buffer_after", "not-a-number");

    expect((await getBookingSettings()).bufferAfter).toBe(60);
  });

  it("reads all four keys in a single query", async () => {
    await setBookingSettings({
      bufferBefore: 45,
      bufferAfter: 30,
      gameDuration: 120,
      dueDaysBefore: 14,
    });
    trace.reset();

    await getBookingSettings();

    expect(trace.startCount()).toBe(1);
  });
});

describe("setBookingSettings", () => {
  it("writes each value under its own distinct key", async () => {
    await setBookingSettings({
      bufferBefore: 45,
      bufferAfter: 30,
      gameDuration: 120,
      dueDaysBefore: 14,
    });

    expect(await readRaw("venue_booking_buffer_before")).toBe("45");
    expect(await readRaw("venue_booking_buffer_after")).toBe("30");
    expect(await readRaw("venue_booking_game_duration")).toBe("120");
    expect(await readRaw("venue_booking_due_days_before")).toBe("14");
    expect(await ctx.db.select().from(appSettings)).toHaveLength(4);
  });
});

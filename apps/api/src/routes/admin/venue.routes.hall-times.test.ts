import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../../types";
import type { HallTimeImportPreview, HallTimeImportResult, HallTimeRow } from "@dragons/shared";

// --- Mocks (hoisted before imports) ---
//
// The database is real (in-process PGlite): the import is a diff against
// stored rows plus a transaction, and mocking either would assert nothing.
// Only better-auth is mocked so the permission gate runs for real.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  userHasPermission: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../config/auth", () => ({
  auth: {
    api: {
      userHasPermission: mocks.userHasPermission,
      getSession: mocks.getSession,
    },
  },
}));

// --- Subject (imported after mocks) ---

import { venueRoutes } from "./venue.routes";
import { errorHandler } from "../../middleware/error";
import { domainEvents, venueBookings, venueHallTimes, venues } from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

const app = new Hono<AppEnv>();
app.use("/*", async (c, next) => {
  c.set("user", { id: "user-1" } as AppEnv["Variables"]["user"]);
  await next();
});
app.onError(errorHandler);
app.route("/", venueRoutes);

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mocks.userHasPermission.mockResolvedValue({ success: true });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Seed helpers ---

async function seedVenue(name = "Gymnasium Goetheschule"): Promise<number> {
  const [row] = await ctx.db
    .insert(venues)
    .values({ apiId: 4711 + Math.floor(Math.random() * 100000), name })
    .returning({ id: venues.id });
  return row!.id;
}

async function seedBooking(
  venueId: number,
  date: string,
  window: { start: string; end: string; overrideStart?: string; overrideEnd?: string },
): Promise<number> {
  const [row] = await ctx.db
    .insert(venueBookings)
    .values({
      venueId,
      date,
      calculatedStartTime: window.start,
      calculatedEndTime: window.end,
      overrideStartTime: window.overrideStart ?? null,
      overrideEndTime: window.overrideEnd ?? null,
    })
    .returning({ id: venueBookings.id });
  return row!.id;
}

const open = (date: string, startTime: string, endTime: string) => ({
  date,
  kind: "open" as const,
  startTime,
  endTime,
  note: null,
});
/** PUT body: the day is in the path, so no `date` key. */
const manual = (startTime: string, endTime: string) => ({
  kind: "open" as const,
  startTime,
  endTime,
  note: null,
});
const closed = (date: string, note: string) => ({
  date,
  kind: "closed" as const,
  startTime: null,
  endTime: null,
  note,
});

function put(venueId: number, date: string, body: unknown) {
  return app.request(`/venues/${venueId}/hall-times/${date}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function hallTimeEvents() {
  return ctx.db
    .select({ entityId: domainEvents.entityId, payload: domainEvents.payload })
    .from(domainEvents)
    .where(eq(domainEvents.type, "booking.hall_time.missing"));
}

// --- Tests ---

describe("PUT + GET + DELETE /venues/:id/hall-times", () => {
  it("upserts one day and lists it back inside the range", async () => {
    const venueId = await seedVenue();

    const created = await put(venueId, "2026-09-19", {
      kind: "open",
      startTime: "10:00",
      endTime: "22:00",
      note: null,
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      venueId,
      date: "2026-09-19",
      kind: "open",
      startTime: "10:00",
      endTime: "22:00",
      source: "manual",
    });

    const replaced = await put(venueId, "2026-09-19", {
      kind: "closed",
      startTime: null,
      endTime: null,
      note: "Ferien",
    });
    expect(await replaced.json()).toMatchObject({ kind: "closed", note: "Ferien" });

    const list = await app.request(`/venues/${venueId}/hall-times?from=2026-09-01&to=2026-09-30`);
    expect(list.status).toBe(200);
    const rows = (await list.json()) as HallTimeRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: "2026-09-19", kind: "closed" });

    const outside = await app.request(`/venues/${venueId}/hall-times?from=2026-10-01`);
    expect(await outside.json()).toEqual([]);
  });

  it("deletes a day and answers 404 for a day or venue that is not there", async () => {
    const venueId = await seedVenue();
    await put(venueId, "2026-09-19", manual("10:00", "14:00"));

    const gone = await app.request(`/venues/${venueId}/hall-times/2026-09-19`, { method: "DELETE" });
    expect(gone.status).toBe(200);
    expect(await gone.json()).toEqual({ success: true });

    const again = await app.request(`/venues/${venueId}/hall-times/2026-09-19`, { method: "DELETE" });
    expect(again.status).toBe(404);

    const noVenue = await put(999_999, "2026-09-19", manual("10:00", "14:00"));
    expect(noVenue.status).toBe(404);
  });

  it("rejects the write without venue:update and the read without venue:view", async () => {
    const venueId = await seedVenue();
    mocks.userHasPermission.mockResolvedValue({ success: false });

    expect((await put(venueId, "2026-09-19", manual("10:00", "14:00"))).status).toBe(403);
    expect(mocks.userHasPermission).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ permissions: { venue: ["update"] } }) }),
    );

    expect((await app.request(`/venues/${venueId}/hall-times`)).status).toBe(403);
    expect(mocks.userHasPermission).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ permissions: { venue: ["view"] } }) }),
    );
  });
});

describe("POST /venues/:id/hall-times/import/preview", () => {
  it("classifies incoming rows against the stored ones inside the sheet span", async () => {
    const venueId = await seedVenue();
    await put(venueId, "2026-09-05", manual("10:00", "14:00")); // manual, sheet says nothing -> kept
    await ctx.db.insert(venueHallTimes).values([
      { venueId, date: "2026-09-12", kind: "open", startTime: "10:00", endTime: "14:00", source: "anlage_t" }, // changed
      { venueId, date: "2026-09-13", kind: "open", startTime: "10:00", endTime: "14:00", source: "anlage_t" }, // removed
      { venueId, date: "2026-09-19", kind: "open", startTime: "10:00", endTime: "22:00", source: "anlage_t" }, // unchanged
      { venueId, date: "2026-10-31", kind: "closed", source: "anlage_t", note: "outside span" }, // untouched
    ]);

    const res = await post(`/venues/${venueId}/hall-times/import/preview`, {
      rows: [
        open("2026-09-12", "12:00", "16:00"),
        open("2026-09-19", "10:00", "22:00"),
        closed("2026-10-03", "Tag der Dt. Einheit"),
      ],
    });
    expect(res.status).toBe(200);
    const preview = (await res.json()) as HallTimeImportPreview;

    expect(preview.span).toEqual({ from: "2026-09-12", to: "2026-10-03" });
    expect(preview.added.map((r) => r.date)).toEqual(["2026-10-03"]);
    expect(preview.changed).toHaveLength(1);
    expect(preview.changed[0]!.before).toMatchObject({ date: "2026-09-12", startTime: "10:00" });
    expect(preview.changed[0]!.after).toMatchObject({ date: "2026-09-12", startTime: "12:00" });
    expect(preview.removed.map((r) => r.date)).toEqual(["2026-09-13"]);
    expect(preview.unchanged).toBe(1);

    // Preview writes nothing.
    const stored = await ctx.db.select().from(venueHallTimes).where(eq(venueHallTimes.venueId, venueId));
    expect(stored).toHaveLength(5);
  });

  it("reports the bookings whose coverage the import would change", async () => {
    const venueId = await seedVenue();
    const loses = await seedBooking(venueId, "2026-09-12", { start: "17:00:00", end: "21:00:00" });
    const gains = await seedBooking(venueId, "2026-09-19", { start: "17:00:00", end: "21:00:00" });
    const same = await seedBooking(venueId, "2026-09-26", { start: "17:00:00", end: "21:00:00" });
    await ctx.db.insert(venueHallTimes).values([
      { venueId, date: "2026-09-12", kind: "open", startTime: "10:00", endTime: "22:00", source: "anlage_t" },
    ]);

    const res = await post(`/venues/${venueId}/hall-times/import/preview`, {
      rows: [
        open("2026-09-12", "10:00", "19:00"),
        open("2026-09-19", "16:00", "22:00"),
        open("2026-09-26", "10:00", "12:00"),
      ],
    });
    const preview = (await res.json()) as HallTimeImportPreview;
    expect(preview.bookings).toEqual([
      { bookingId: loses, date: "2026-09-12", before: "covered", after: "partial" },
      { bookingId: gains, date: "2026-09-19", before: "uncovered", after: "covered" },
    ]);
    expect(preview.bookings.map((b) => b.bookingId)).not.toContain(same);
  });

  it("answers 404 for an unknown venue and 400 for a malformed body", async () => {
    expect((await post(`/venues/999999/hall-times/import/preview`, { rows: [open("2026-09-12", "10:00", "12:00")] })).status).toBe(404);
    const venueId = await seedVenue();
    expect((await post(`/venues/${venueId}/hall-times/import/preview`, { rows: [] })).status).toBe(400);
  });
});

describe("POST /venues/:id/hall-times/import", () => {
  it("replaces the venue's sheet rows inside the span, keeps manual rows the sheet says nothing about, and leaves other venues alone", async () => {
    const venueId = await seedVenue();
    const otherVenueId = await seedVenue("Friedrich-Ebert-Schule");
    await put(venueId, "2026-09-05", manual("10:00", "14:00")); // manual, no sheet value -> kept
    await put(venueId, "2026-09-12", manual("10:00", "14:00")); // manual, sheet has a value -> replaced
    await ctx.db.insert(venueHallTimes).values([
      { venueId, date: "2026-09-13", kind: "open", startTime: "10:00", endTime: "14:00", source: "anlage_t" },
      { venueId, date: "2026-10-31", kind: "closed", source: "anlage_t", note: "outside span" },
      { venueId: otherVenueId, date: "2026-09-19", kind: "open", startTime: "09:00", endTime: "12:00", source: "anlage_t" },
    ]);

    const res = await post(`/venues/${venueId}/hall-times/import`, {
      rows: [open("2026-09-12", "12:00", "16:00"), closed("2026-10-03", "Tag der Dt. Einheit")],
    });
    expect(res.status).toBe(200);
    const result = (await res.json()) as HallTimeImportResult;
    expect(result.added.map((r) => r.date)).toEqual(["2026-10-03"]);
    expect(result.changed.map((c) => c.after.date)).toEqual(["2026-09-12"]);
    expect(result.removed.map((r) => r.date)).toEqual(["2026-09-13"]);
    expect(result.eventsEmitted).toBe(0);

    const stored = await ctx.db
      .select({ date: venueHallTimes.date, kind: venueHallTimes.kind, startTime: venueHallTimes.startTime, source: venueHallTimes.source })
      .from(venueHallTimes)
      .where(eq(venueHallTimes.venueId, venueId))
      .orderBy(venueHallTimes.date);
    expect(stored).toEqual([
      { date: "2026-09-05", kind: "open", startTime: "10:00:00", source: "manual" },
      { date: "2026-09-12", kind: "open", startTime: "12:00:00", source: "anlage_t" },
      { date: "2026-10-03", kind: "closed", startTime: null, source: "anlage_t" },
      { date: "2026-10-31", kind: "closed", startTime: null, source: "anlage_t" },
    ]);
    const other = await ctx.db
      .select({ date: venueHallTimes.date })
      .from(venueHallTimes)
      .where(eq(venueHallTimes.venueId, otherVenueId));
    expect(other).toEqual([{ date: "2026-09-19" }]);
  });

  it("emits booking.hall_time.missing once per booking that loses coverage, and nothing on a repeat import", async () => {
    const venueId = await seedVenue();
    const loses = await seedBooking(venueId, "2026-09-12", { start: "17:00:00", end: "21:00:00" });
    await seedBooking(venueId, "2026-09-19", { start: "17:00:00", end: "21:00:00" }); // uncovered before and after
    await seedBooking(venueId, "2026-09-26", { start: "17:00:00", end: "21:00:00" }); // gains coverage
    await ctx.db.insert(venueHallTimes).values([
      { venueId, date: "2026-09-12", kind: "open", startTime: "10:00", endTime: "22:00", source: "anlage_t" },
    ]);

    const body = {
      rows: [closed("2026-09-12", "Ferien"), open("2026-09-19", "10:00", "12:00"), open("2026-09-26", "16:00", "22:00")],
    };
    const first = (await (await post(`/venues/${venueId}/hall-times/import`, body)).json()) as HallTimeImportResult;
    expect(first.eventsEmitted).toBe(1);

    const events = await hallTimeEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.entityId).toBe(loses);
    expect(events[0]!.payload).toMatchObject({
      bookingId: loses,
      venueId,
      venueName: "Gymnasium Goetheschule",
      date: "2026-09-12",
      startTime: "17:00:00",
      endTime: "21:00:00",
      coverage: "closed",
      hallTime: { kind: "closed", note: "Ferien" },
    });

    const second = (await (await post(`/venues/${venueId}/hall-times/import`, body)).json()) as HallTimeImportResult;
    expect(second.eventsEmitted).toBe(0);
    expect(second.unchanged).toBe(3);
    expect(await hallTimeEvents()).toHaveLength(1);
  });

  it("ignores a cancelled booking: it asks the city for nothing", async () => {
    const venueId = await seedVenue();
    await ctx.db
      .insert(venueBookings)
      .values({
        venueId,
        date: "2026-09-12",
        calculatedStartTime: "17:00:00",
        calculatedEndTime: "21:00:00",
        status: "cancelled",
      });
    await ctx.db.insert(venueHallTimes).values([
      { venueId, date: "2026-09-12", kind: "open", startTime: "10:00", endTime: "22:00", source: "anlage_t" },
    ]);

    const result = (await (
      await post(`/venues/${venueId}/hall-times/import`, { rows: [closed("2026-09-12", "Ferien")] })
    ).json()) as HallTimeImportResult;

    expect(result.bookings).toEqual([]);
    expect(result.eventsEmitted).toBe(0);
    expect(await hallTimeEvents()).toHaveLength(0);
  });

  it("judges coverage by the booking's override window when one is set", async () => {
    const venueId = await seedVenue();
    await seedBooking(venueId, "2026-09-12", {
      start: "17:00:00",
      end: "21:00:00",
      overrideStart: "12:00:00",
      overrideEnd: "14:00:00",
    });
    await ctx.db.insert(venueHallTimes).values([
      { venueId, date: "2026-09-12", kind: "open", startTime: "10:00", endTime: "22:00", source: "anlage_t" },
    ]);

    const result = (await (
      await post(`/venues/${venueId}/hall-times/import`, { rows: [open("2026-09-12", "16:00", "22:00")] })
    ).json()) as HallTimeImportResult;
    expect(result.bookings[0]).toMatchObject({ before: "covered", after: "uncovered" });
    expect(result.eventsEmitted).toBe(1);
    const [row] = await ctx.db
      .select({ startTime: venueHallTimes.startTime })
      .from(venueHallTimes)
      .where(and(eq(venueHallTimes.venueId, venueId), eq(venueHallTimes.date, "2026-09-12")));
    expect(row?.startTime).toBe("16:00:00");
  });
});

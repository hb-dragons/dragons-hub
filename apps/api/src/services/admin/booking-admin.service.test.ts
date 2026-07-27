import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked. The previous
// version of this file stubbed `eq`/`and`/`gte`/`lte`/`sql`/`count` with
// identity functions and asserted `expect(mockSelect).toHaveBeenCalled()` for
// the filter tests — so swapping `gte(date, dateFrom)` for `lte`, or joining
// the match-count subquery on the wrong column, left every test green.
// Everything below runs the real SQL (joins, the match-count subquery, the
// date-range filters) against an in-process PGlite Postgres.
//
// Only the event publisher and the logger are stubbed: publishing touches
// BullMQ/Redis, and the service treats a publish failure as non-fatal.

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

vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: vi.fn().mockResolvedValue({ id: "mock-event-id" }),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// --- Imports (after mocks) ---

import {
  listBookings,
  getBookingDetail,
  updateBooking,
  updateBookingStatus,
  createBooking,
  deleteBooking,
} from "./booking-admin.service";
import { publishDomainEvent } from "../events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";
import {
  leagues,
  matches,
  teams,
  venueBookingMatches,
  venueBookings,
  venues,
} from "@dragons/db/schema";
import { eq } from "drizzle-orm";
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
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

let seq = 0;

async function seedVenue(name = "Main Hall"): Promise<number> {
  const [row] = await ctx.db
    .insert(venues)
    .values({ apiId: 8000 + ++seq, name })
    .returning({ id: venues.id });
  return row!.id;
}

async function seedBooking(opts: {
  venueId: number;
  date: string;
  calculatedStartTime?: string;
  calculatedEndTime?: string;
  overrideStartTime?: string | null;
  overrideEndTime?: string | null;
  overrideReason?: string | null;
  status?: string;
  notes?: string | null;
  needsReconfirmation?: boolean;
  confirmedBy?: string | null;
  confirmedAt?: Date | null;
}): Promise<number> {
  const [row] = await ctx.db
    .insert(venueBookings)
    .values({
      venueId: opts.venueId,
      date: opts.date,
      calculatedStartTime: opts.calculatedStartTime ?? "14:00:00",
      calculatedEndTime: opts.calculatedEndTime ?? "17:00:00",
      overrideStartTime: opts.overrideStartTime ?? null,
      overrideEndTime: opts.overrideEndTime ?? null,
      overrideReason: opts.overrideReason ?? null,
      status: (opts.status ?? "pending") as "pending",
      needsReconfirmation: opts.needsReconfirmation ?? false,
      notes: opts.notes ?? null,
      confirmedBy: opts.confirmedBy ?? null,
      confirmedAt: opts.confirmedAt ?? null,
    })
    .returning({ id: venueBookings.id });
  return row!.id;
}

async function seedTeamPair(): Promise<{ homeApi: number; guestApi: number }> {
  const rows = await ctx.db.select({ api: teams.apiTeamPermanentId }).from(teams).limit(2);
  if (rows.length === 2) return { homeApi: rows[0]!.api, guestApi: rows[1]!.api };

  const [home] = await ctx.db
    .insert(teams)
    .values({
      apiTeamPermanentId: 100 + ++seq,
      seasonTeamId: 200 + seq,
      teamCompetitionId: 300 + seq,
      name: "Dragons",
      customName: "Dragons Custom",
      clubId: 1,
      isOwnClub: true,
    })
    .returning({ api: teams.apiTeamPermanentId });
  const [guest] = await ctx.db
    .insert(teams)
    .values({
      apiTeamPermanentId: 100 + ++seq,
      seasonTeamId: 200 + seq,
      teamCompetitionId: 300 + seq,
      name: "Eagles",
      clubId: 2,
    })
    .returning({ api: teams.apiTeamPermanentId });
  return { homeApi: home!.api, guestApi: guest!.api };
}

async function seedMatch(opts: { kickoffTime: string; matchNo?: number }): Promise<number> {
  const { homeApi, guestApi } = await seedTeamPair();
  const [league] = await ctx.db
    .insert(leagues)
    .values({
      apiLigaId: 400 + ++seq,
      ligaNr: 4102,
      name: "Regionalliga",
      seasonId: 2025,
      seasonName: "2025/26",
    })
    .returning({ id: leagues.id });
  const [row] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: 9000 + ++seq,
      matchNo: opts.matchNo ?? seq,
      matchDay: 1,
      kickoffDate: "2025-03-15",
      kickoffTime: opts.kickoffTime,
      homeTeamApiId: homeApi,
      guestTeamApiId: guestApi,
      leagueId: league!.id,
    })
    .returning({ id: matches.id });
  return row!.id;
}

async function link(bookingId: number, matchId: number): Promise<void> {
  await ctx.db.insert(venueBookingMatches).values({ venueBookingId: bookingId, matchId });
}

// --- Tests ---

describe("listBookings", () => {
  it("joins the venue name and counts the linked matches", async () => {
    const venueId = await seedVenue("Main Hall");
    const bookingId = await seedBooking({ venueId, date: "2025-03-15" });
    await link(bookingId, await seedMatch({ kickoffTime: "15:00:00" }));
    await link(bookingId, await seedMatch({ kickoffTime: "17:00:00" }));

    const result = await listBookings();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: bookingId,
      venueId,
      venueName: "Main Hall",
      date: "2025-03-15",
      effectiveStartTime: "14:00:00",
      effectiveEndTime: "17:00:00",
      matchCount: 2,
    });
  });

  it("reports 0 matches for a booking with no links", async () => {
    const venueId = await seedVenue();
    await seedBooking({ venueId, date: "2025-03-15" });

    expect((await listBookings())[0]!.matchCount).toBe(0);
  });

  it("does not attribute another booking's matches", async () => {
    const venueId = await seedVenue();
    const a = await seedBooking({ venueId, date: "2025-03-15" });
    const b = await seedBooking({ venueId, date: "2025-03-16" });
    await link(a, await seedMatch({ kickoffTime: "15:00:00" }));
    await link(a, await seedMatch({ kickoffTime: "16:00:00" }));
    await link(b, await seedMatch({ kickoffTime: "17:00:00" }));

    const byId = new Map((await listBookings()).map((r) => [r.id, r.matchCount]));

    expect(byId.get(a)).toBe(2);
    expect(byId.get(b)).toBe(1);
  });

  it("prefers the override times as effective times", async () => {
    const venueId = await seedVenue();
    await seedBooking({
      venueId,
      date: "2025-03-15",
      overrideStartTime: "13:00:00",
      overrideEndTime: "18:00:00",
      status: "confirmed",
    });

    const [row] = await listBookings();

    expect(row!.effectiveStartTime).toBe("13:00:00");
    expect(row!.effectiveEndTime).toBe("18:00:00");
  });

  it("returns an empty array when no bookings exist", async () => {
    expect(await listBookings()).toEqual([]);
  });

  it("filters by status", async () => {
    const venueId = await seedVenue();
    const pending = await seedBooking({ venueId, date: "2025-03-15", status: "pending" });
    const confirmed = await seedBooking({ venueId, date: "2025-03-16", status: "confirmed" });

    const result = await listBookings({ status: "confirmed" });

    expect(result.map((r) => r.id)).toEqual([confirmed]);
    expect(result.map((r) => r.id)).not.toContain(pending);
  });

  it("keeps only bookings on or after dateFrom", async () => {
    const venueId = await seedVenue();
    await seedBooking({ venueId, date: "2025-01-01" });
    const mid = await seedBooking({ venueId, date: "2025-06-01" });
    const late = await seedBooking({ venueId, date: "2025-12-01" });

    const result = await listBookings({ dateFrom: "2025-06-01" });

    expect(result.map((r) => r.id)).toEqual([mid, late]);
  });

  it("keeps only bookings on or before dateTo", async () => {
    const venueId = await seedVenue();
    const early = await seedBooking({ venueId, date: "2025-01-01" });
    const mid = await seedBooking({ venueId, date: "2025-06-01" });
    await seedBooking({ venueId, date: "2025-12-01" });

    const result = await listBookings({ dateTo: "2025-06-01" });

    expect(result.map((r) => r.id)).toEqual([early, mid]);
  });

  it("intersects dateFrom and dateTo into a closed range", async () => {
    const venueId = await seedVenue();
    await seedBooking({ venueId, date: "2025-01-01" });
    const mid = await seedBooking({ venueId, date: "2025-06-01" });
    await seedBooking({ venueId, date: "2025-12-01" });

    const result = await listBookings({ dateFrom: "2025-05-01", dateTo: "2025-07-01" });

    expect(result.map((r) => r.id)).toEqual([mid]);
  });

  it("orders by date then calculated start time", async () => {
    const venueA = await seedVenue("A");
    const venueB = await seedVenue("B");
    const later = await seedBooking({ venueId: venueA, date: "2025-03-16" });
    const earlySlot = await seedBooking({
      venueId: venueA,
      date: "2025-03-15",
      calculatedStartTime: "09:00:00",
    });
    const lateSlot = await seedBooking({
      venueId: venueB,
      date: "2025-03-15",
      calculatedStartTime: "18:00:00",
    });

    expect((await listBookings()).map((r) => r.id)).toEqual([earlySlot, lateSlot, later]);
  });
});

describe("getBookingDetail", () => {
  it("returns the booking with its linked matches, ordered by kickoff time", async () => {
    const venueId = await seedVenue("Main Hall");
    const bookingId = await seedBooking({
      venueId,
      date: "2025-03-15",
      notes: "Test note",
    });
    const late = await seedMatch({ kickoffTime: "18:00:00", matchNo: 2 });
    const early = await seedMatch({ kickoffTime: "15:00:00", matchNo: 1 });
    await link(bookingId, late);
    await link(bookingId, early);

    const result = await getBookingDetail(bookingId);

    expect(result).toMatchObject({
      id: bookingId,
      venueName: "Main Hall",
      date: "2025-03-15",
      effectiveStartTime: "14:00:00",
      effectiveEndTime: "17:00:00",
      notes: "Test note",
    });
    expect(result!.matches.map((m) => m.id)).toEqual([early, late]);
    expect(result!.matches[0]).toMatchObject({
      homeTeam: "Dragons",
      homeTeamCustomName: "Dragons Custom",
      guestTeam: "Eagles",
      leagueName: "Regionalliga",
    });
  });

  it("does not include another booking's matches", async () => {
    const venueId = await seedVenue();
    const target = await seedBooking({ venueId, date: "2025-03-15" });
    const other = await seedBooking({ venueId, date: "2025-03-16" });
    await link(target, await seedMatch({ kickoffTime: "15:00:00" }));
    await link(other, await seedMatch({ kickoffTime: "16:00:00" }));

    expect((await getBookingDetail(target))!.matches).toHaveLength(1);
  });

  it("returns null when the booking does not exist", async () => {
    const venueId = await seedVenue();
    await seedBooking({ venueId, date: "2025-03-15" });

    expect(await getBookingDetail(999)).toBeNull();
  });

  it("falls back per-field when only one override time is set", async () => {
    const venueId = await seedVenue("Hall");
    const bookingId = await seedBooking({
      venueId,
      date: "2025-03-15",
      overrideStartTime: "13:00:00",
      overrideEndTime: null,
      overrideReason: "Early start",
      status: "confirmed",
      confirmedBy: "admin",
      confirmedAt: new Date("2025-01-01T10:00:00.000Z"),
    });

    const result = await getBookingDetail(bookingId);

    expect(result!.effectiveStartTime).toBe("13:00:00");
    expect(result!.effectiveEndTime).toBe("17:00:00");
    expect(result!.overrideReason).toBe("Early start");
    expect(result!.confirmedBy).toBe("admin");
    expect(result!.confirmedAt).toBe("2025-01-01T10:00:00.000Z");
  });
});

describe("updateBooking", () => {
  it("persists the change on the addressed booking only", async () => {
    const venueId = await seedVenue("Main Hall");
    const target = await seedBooking({ venueId, date: "2025-03-15" });
    const bystander = await seedBooking({ venueId, date: "2025-03-16", notes: "keep me" });
    await link(target, await seedMatch({ kickoffTime: "15:00:00" }));
    await link(target, await seedMatch({ kickoffTime: "16:00:00" }));

    const result = await updateBooking(target, {
      overrideStartTime: "13:00:00",
      notes: "Updated",
    });

    expect(result).toMatchObject({
      id: target,
      venueName: "Main Hall",
      effectiveStartTime: "13:00:00",
      notes: "Updated",
      matchCount: 2,
    });

    const [untouched] = await ctx.db
      .select()
      .from(venueBookings)
      .where(eq(venueBookings.id, bystander));
    expect(untouched!.notes).toBe("keep me");
  });

  it("returns null when the booking does not exist", async () => {
    const venueId = await seedVenue();
    await seedBooking({ venueId, date: "2025-03-15" });

    expect(await updateBooking(999, { notes: "Test" })).toBeNull();
  });

  it("clears the override times when they are explicitly set to null", async () => {
    const venueId = await seedVenue("Hall");
    const id = await seedBooking({
      venueId,
      date: "2025-03-15",
      overrideStartTime: "13:00:00",
      overrideEndTime: "16:00:00",
    });

    const result = await updateBooking(id, {
      overrideStartTime: null,
      overrideEndTime: null,
      overrideReason: null,
      status: "pending",
      notes: null,
    });

    expect(result!.effectiveStartTime).toBe("14:00:00");
    expect(result!.effectiveEndTime).toBe("17:00:00");
  });

  it("emits booking.status.changed with the real pre-update times on a reschedule", async () => {
    const venueId = await seedVenue("Main Hall");
    const id = await seedBooking({
      venueId,
      date: "2025-03-15",
      overrideStartTime: "12:00:00",
      overrideEndTime: "15:00:00",
    });

    await updateBooking(id, { overrideStartTime: "13:00:00", overrideEndTime: "16:00:00" });

    expect(publishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EVENT_TYPES.BOOKING_STATUS_CHANGED,
        entityId: id,
        payload: expect.objectContaining({
          venueName: "Main Hall",
          oldStartTime: "12:00:00",
          oldEndTime: "15:00:00",
          newStartTime: "13:00:00",
          newEndTime: "16:00:00",
        }),
      }),
    );
  });

  it("does not emit when the effective times are unchanged", async () => {
    const venueId = await seedVenue();
    const id = await seedBooking({
      venueId,
      date: "2025-03-15",
      overrideStartTime: "13:00:00",
      overrideEndTime: "16:00:00",
    });

    await updateBooking(id, {
      overrideStartTime: "13:00:00",
      overrideEndTime: "16:00:00",
      notes: "note only",
    });

    expect(publishDomainEvent).not.toHaveBeenCalled();
  });

  it("does not emit when no time field is touched at all", async () => {
    const venueId = await seedVenue();
    const id = await seedBooking({ venueId, date: "2025-03-15" });

    await updateBooking(id, { notes: "note only" });

    expect(publishDomainEvent).not.toHaveBeenCalled();
  });
});

describe("updateBookingStatus", () => {
  it("confirms the booking, stamps confirmedAt and clears the reconfirm flag", async () => {
    const venueId = await seedVenue("Main Hall");
    const id = await seedBooking({ venueId, date: "2025-03-15", needsReconfirmation: true });

    const result = await updateBookingStatus(id, "confirmed");

    expect(result).toMatchObject({ status: "confirmed", needsReconfirmation: false });
    const [stored] = await ctx.db
      .select()
      .from(venueBookings)
      .where(eq(venueBookings.id, id));
    expect(stored!.confirmedAt).toBeInstanceOf(Date);
  });

  it("clears confirmedAt/confirmedBy when moving away from confirmed", async () => {
    const venueId = await seedVenue("Hall");
    const id = await seedBooking({
      venueId,
      date: "2025-03-15",
      status: "confirmed",
      confirmedBy: "admin",
      confirmedAt: new Date("2025-01-01T00:00:00.000Z"),
    });

    const result = await updateBookingStatus(id, "pending");

    expect(result!.status).toBe("pending");
    const [stored] = await ctx.db
      .select()
      .from(venueBookings)
      .where(eq(venueBookings.id, id));
    expect(stored!.confirmedAt).toBeNull();
    expect(stored!.confirmedBy).toBeNull();
  });

  it("emits booking.status.changed when cancelling", async () => {
    const venueId = await seedVenue("Main Hall");
    const id = await seedBooking({ venueId, date: "2025-03-15" });

    await updateBookingStatus(id, "cancelled");

    expect(publishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EVENT_TYPES.BOOKING_STATUS_CHANGED,
        entityId: id,
        payload: expect.objectContaining({ reason: "Status changed to cancelled" }),
      }),
    );
  });

  it("does not emit for a non-cancel status change", async () => {
    const venueId = await seedVenue();
    const id = await seedBooking({ venueId, date: "2025-03-15" });

    await updateBookingStatus(id, "confirmed");

    expect(publishDomainEvent).not.toHaveBeenCalled();
  });

  it("returns null when the booking does not exist", async () => {
    expect(await updateBookingStatus(999, "confirmed")).toBeNull();
  });
});

describe("createBooking", () => {
  it("creates the booking and returns its detail", async () => {
    const venueId = await seedVenue("Main Hall");

    const result = await createBooking({
      venueId,
      date: "2025-03-15",
      overrideStartTime: "14:00:00",
      overrideEndTime: "17:00:00",
    });

    expect(result).toMatchObject({
      venueId,
      venueName: "Main Hall",
      date: "2025-03-15",
      status: "pending",
      needsReconfirmation: false,
      effectiveStartTime: "14:00:00",
      effectiveEndTime: "17:00:00",
      matches: [],
    });
    // calculated* seed from the supplied override times.
    expect(result!.calculatedStartTime).toBe("14:00:00");
    expect(result!.calculatedEndTime).toBe("17:00:00");
    // Published with a transaction client (issue #77): the event row commits
    // with the booking rather than after it.
    expect(publishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EVENT_TYPES.BOOKING_CREATED,
        payload: expect.objectContaining({ venueName: "Main Hall", matchCount: 0 }),
      }),
      expect.anything(),
    );
  });

  it("links the supplied matches", async () => {
    const venueId = await seedVenue("Main Hall");
    const m1 = await seedMatch({ kickoffTime: "15:00:00" });
    const m2 = await seedMatch({ kickoffTime: "16:00:00" });

    const result = await createBooking({
      venueId,
      date: "2025-03-15",
      overrideStartTime: "14:00:00",
      overrideEndTime: "17:00:00",
      matchIds: [m2, m1],
    });

    expect(result!.matches.map((m) => m.id)).toEqual([m1, m2]);
    expect(publishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ matchCount: 2 }) }),
      expect.anything(),
    );
  });

  it("returns null for a venue that does not exist", async () => {
    expect(
      await createBooking({
        venueId: 999,
        date: "2025-03-15",
        overrideStartTime: "14:00:00",
        overrideEndTime: "17:00:00",
      }),
    ).toBeNull();
  });

  it("returns null on a duplicate venue+date and writes nothing", async () => {
    const venueId = await seedVenue();
    await seedBooking({ venueId, date: "2025-03-15" });

    const result = await createBooking({
      venueId,
      date: "2025-03-15",
      overrideStartTime: "14:00:00",
      overrideEndTime: "17:00:00",
    });

    expect(result).toBeNull();
    expect(await ctx.db.select().from(venueBookings)).toHaveLength(1);
  });

  it("allows the same date at a different venue", async () => {
    const first = await seedVenue("Hall A");
    const second = await seedVenue("Hall B");
    await seedBooking({ venueId: first, date: "2025-03-15" });

    const result = await createBooking({
      venueId: second,
      date: "2025-03-15",
      overrideStartTime: "14:00:00",
      overrideEndTime: "17:00:00",
    });

    expect(result).not.toBeNull();
    expect(result!.venueName).toBe("Hall B");
  });

  it("writes nothing when the booking.created event cannot be recorded (#77)", async () => {
    const venueId = await seedVenue("Main Hall");
    const matchId = await seedMatch({ kickoffTime: "15:00:00" });
    vi.mocked(publishDomainEvent).mockRejectedValueOnce(new Error("outbox down"));

    await expect(
      createBooking({
        venueId,
        date: "2025-03-15",
        overrideStartTime: "14:00:00",
        overrideEndTime: "17:00:00",
        matchIds: [matchId],
      }),
    ).rejects.toThrow("outbox down");

    // The booking row and its match links share the event's transaction, so
    // there is no booking left behind that nobody was told about.
    expect(await ctx.db.select().from(venueBookings)).toHaveLength(0);
    expect(await ctx.db.select().from(venueBookingMatches)).toHaveLength(0);
  });

  it("links duplicate match ids once", async () => {
    const venueId = await seedVenue("Main Hall");
    const matchId = await seedMatch({ kickoffTime: "15:00:00" });

    const result = await createBooking({
      venueId,
      date: "2025-03-15",
      overrideStartTime: "14:00:00",
      overrideEndTime: "17:00:00",
      matchIds: [matchId, matchId],
    });

    // One multi-row insert replaced the per-match loop, so a repeated id has to
    // be collapsed before it reaches `venue_booking_matches_uniq`.
    expect(result!.matches.map((m) => m.id)).toEqual([matchId]);
    expect(await ctx.db.select().from(venueBookingMatches)).toHaveLength(1);
  });
});

describe("deleteBooking", () => {
  it("removes the booking and its links, leaving other bookings intact", async () => {
    const venueId = await seedVenue("Main Hall");
    const target = await seedBooking({ venueId, date: "2025-03-15" });
    const bystander = await seedBooking({ venueId, date: "2025-03-16" });
    await link(target, await seedMatch({ kickoffTime: "15:00:00" }));

    expect(await deleteBooking(target)).toBe(true);

    expect(await getBookingDetail(target)).toBeNull();
    expect(await getBookingDetail(bystander)).not.toBeNull();
    expect(await ctx.db.select().from(venueBookingMatches)).toHaveLength(0);
    expect(publishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EVENT_TYPES.BOOKING_STATUS_CHANGED,
        entityId: target,
        payload: expect.objectContaining({ reason: "Booking deleted" }),
      }),
    );
  });

  it("returns false and emits nothing for a booking that does not exist", async () => {
    expect(await deleteBooking(999)).toBe(false);
    expect(publishDomainEvent).not.toHaveBeenCalled();
  });
});

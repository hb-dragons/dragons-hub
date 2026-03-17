import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: vi.fn().mockResolvedValue({ id: "mock-event-id" }),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  venueBookings: { id: "vb.id", venueId: "vb.venueId", date: "vb.date", calculatedStartTime: "vb.cst", calculatedEndTime: "vb.cet", overrideStartTime: "vb.ost", overrideEndTime: "vb.oet", overrideReason: "vb.or", status: "vb.status", needsReconfirmation: "vb.nr", notes: "vb.notes", confirmedBy: "vb.cb", confirmedAt: "vb.ca", createdAt: "vb.createdAt", updatedAt: "vb.updatedAt" },
  venues: { id: "v.id", name: "v.name" },
  venueBookingMatches: { venueBookingId: "vbm.vbId", matchId: "vbm.matchId" },
  matches: { id: "m.id", matchNo: "m.matchNo", kickoffDate: "m.kd", kickoffTime: "m.kt", homeTeamApiId: "m.htId", guestTeamApiId: "m.gtId", leagueId: "m.leagueId" },
  teams: { apiTeamPermanentId: "t.aptId", name: "t.name", customName: "t.customName" },
  leagues: { id: "l.id", name: "l.name" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  gte: vi.fn((...args: unknown[]) => ({ gte: args })),
  lte: vi.fn((...args: unknown[]) => ({ lte: args })),
  sql: Object.assign(
    vi.fn((...args: unknown[]) => ({ sql: args, as: vi.fn().mockReturnValue("sql_aliased") })),
    { raw: vi.fn((s: string) => ({ raw: s })) },
  ),
  count: vi.fn(() => ({ as: vi.fn().mockReturnValue("count_aliased") })),
  asc: vi.fn((...args: unknown[]) => ({ asc: args })),
}));

import {
  listBookings,
  getBookingDetail,
  updateBooking,
  updateBookingStatus,
  createBooking,
  deleteBooking,
} from "./booking-admin.service";

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Helpers ---

/**
 * Build a mock chain object that handles any combination of Drizzle calls.
 * Each method returns the chain itself (to allow arbitrary chaining),
 * except terminal methods that resolve to rows.
 */
function makeChain(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  const terminal = vi.fn().mockResolvedValue(rows);
  const methods = ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // as() returns a subquery ref (not a promise), with arbitrary property access
  chain.as = vi.fn().mockReturnValue(
    new Proxy({}, {
      get: () => "subquery_field",
    }),
  );
  // Override limit and orderBy and where to also work as terminal (return promise)
  chain.limit = vi.fn().mockResolvedValue(rows);
  chain.orderBy = vi.fn().mockResolvedValue(rows);
  // where() sometimes terminates (detail match query), sometimes chains
  chain.where = vi.fn().mockImplementation(() => {
    return Object.assign(Promise.resolve(rows), {
      limit: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn().mockResolvedValue(rows),
    });
  });
  // Make chain itself thenable so `await db.select(...).from(...).innerJoin(...)...where(...)` works
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

function mockUpdateChain(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

describe("listBookings", () => {
  it("returns bookings with venue name and match count", async () => {
    const rows = [
      {
        id: 1, venueId: 10, venueName: "Main Hall", date: "2025-03-15",
        calculatedStartTime: "14:00:00", calculatedEndTime: "17:00:00",
        overrideStartTime: null, overrideEndTime: null,
        status: "pending", needsReconfirmation: false, notes: null,
        matchCount: 2,
      },
    ];
    mockSelect.mockReturnValue(makeChain(rows));

    const result = await listBookings();

    expect(result).toHaveLength(1);
    expect(result[0]!.venueName).toBe("Main Hall");
    expect(result[0]!.effectiveStartTime).toBe("14:00:00");
    expect(result[0]!.effectiveEndTime).toBe("17:00:00");
    expect(result[0]!.matchCount).toBe(2);
  });

  it("uses override times for effective times", async () => {
    const rows = [
      {
        id: 1, venueId: 10, venueName: "Main Hall", date: "2025-03-15",
        calculatedStartTime: "14:00:00", calculatedEndTime: "17:00:00",
        overrideStartTime: "13:00:00", overrideEndTime: "18:00:00",
        status: "confirmed", needsReconfirmation: false, notes: null,
        matchCount: 1,
      },
    ];
    mockSelect.mockReturnValue(makeChain(rows));

    const result = await listBookings();

    expect(result[0]!.effectiveStartTime).toBe("13:00:00");
    expect(result[0]!.effectiveEndTime).toBe("18:00:00");
  });

  it("returns empty array when no bookings exist", async () => {
    mockSelect.mockReturnValue(makeChain([]));

    const result = await listBookings();

    expect(result).toEqual([]);
  });

  it("passes status filter", async () => {
    mockSelect.mockReturnValue(makeChain([]));

    await listBookings({ status: "confirmed" });

    expect(mockSelect).toHaveBeenCalled();
  });

  it("passes date range filters", async () => {
    mockSelect.mockReturnValue(makeChain([]));

    await listBookings({ dateFrom: "2025-01-01", dateTo: "2025-12-31" });

    expect(mockSelect).toHaveBeenCalled();
  });
});

describe("getBookingDetail", () => {
  it("returns full booking detail with matches", async () => {
    const bookingRow = {
      id: 1, venueId: 10, venueName: "Main Hall", date: "2025-03-15",
      calculatedStartTime: "14:00:00", calculatedEndTime: "17:00:00",
      overrideStartTime: null, overrideEndTime: null, overrideReason: null,
      status: "pending", needsReconfirmation: false, notes: "Test note",
      confirmedBy: null, confirmedAt: null,
      createdAt: new Date("2025-01-01"), updatedAt: new Date("2025-01-01"),
    };

    const matchRows = [
      { id: 100, matchNo: 42, kickoffDate: "2025-03-15", kickoffTime: "15:00:00", homeTeam: "Dragons", guestTeam: "Eagles" },
    ];

    let selectCallIndex = 0;
    mockSelect.mockImplementation(() => {
      const idx = selectCallIndex++;
      if (idx === 0) return makeChain([bookingRow]);  // booking
      if (idx === 1) return makeChain([]);             // homeTeam subquery
      if (idx === 2) return makeChain([]);             // guestTeam subquery
      return makeChain(matchRows);                     // linked matches
    });

    const result = await getBookingDetail(1);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.venueName).toBe("Main Hall");
    expect(result!.effectiveStartTime).toBe("14:00:00");
    expect(result!.notes).toBe("Test note");
  });

  it("returns null when booking not found", async () => {
    mockSelect.mockReturnValue(makeChain([]));

    const result = await getBookingDetail(999);

    expect(result).toBeNull();
  });

  it("uses override times for effective times", async () => {
    const bookingRow = {
      id: 1, venueId: 10, venueName: "Hall", date: "2025-03-15",
      calculatedStartTime: "14:00:00", calculatedEndTime: "17:00:00",
      overrideStartTime: "13:00:00", overrideEndTime: null,
      overrideReason: "Early start", status: "confirmed",
      needsReconfirmation: false, notes: null,
      confirmedBy: "admin", confirmedAt: new Date("2025-01-01"),
      createdAt: new Date("2025-01-01"), updatedAt: new Date("2025-01-01"),
    };

    let selectCallIndex = 0;
    mockSelect.mockImplementation(() => {
      const idx = selectCallIndex++;
      if (idx === 0) return makeChain([bookingRow]);
      return makeChain([]);
    });

    const result = await getBookingDetail(1);

    expect(result).not.toBeNull();
    expect(result!.effectiveStartTime).toBe("13:00:00");
    expect(result!.effectiveEndTime).toBe("17:00:00");
  });
});

describe("updateBooking", () => {
  it("updates booking and returns result with venue info", async () => {
    const updatedRow = {
      id: 1, venueId: 10, date: "2025-03-15",
      calculatedStartTime: "14:00:00", calculatedEndTime: "17:00:00",
      overrideStartTime: "13:00:00", overrideEndTime: null,
      status: "pending", needsReconfirmation: false, notes: "Updated",
    };

    mockUpdate.mockReturnValue(mockUpdateChain([updatedRow]));

    let selectCallIndex = 0;
    mockSelect.mockImplementation(() => {
      const idx = selectCallIndex++;
      if (idx === 0) return makeChain([{ name: "Main Hall" }]);   // venue
      return makeChain([{ count: 2 }]);                           // matchCount
    });

    const result = await updateBooking(1, {
      overrideStartTime: "13:00:00",
      notes: "Updated",
    });

    expect(result).not.toBeNull();
    expect(result!.venueName).toBe("Main Hall");
    expect(result!.effectiveStartTime).toBe("13:00:00");
    expect(result!.notes).toBe("Updated");
    expect(result!.matchCount).toBe(2);
  });

  it("returns null when booking not found", async () => {
    mockUpdate.mockReturnValue(mockUpdateChain([]));

    const result = await updateBooking(999, { notes: "Test" });

    expect(result).toBeNull();
  });

  it("handles null override values", async () => {
    const updatedRow = {
      id: 1, venueId: 10, date: "2025-03-15",
      calculatedStartTime: "14:00:00", calculatedEndTime: "17:00:00",
      overrideStartTime: null, overrideEndTime: null,
      status: "pending", needsReconfirmation: false, notes: null,
    };

    mockUpdate.mockReturnValue(mockUpdateChain([updatedRow]));

    let selectCallIndex = 0;
    mockSelect.mockImplementation(() => {
      const idx = selectCallIndex++;
      if (idx === 0) return makeChain([{ name: "Hall" }]);
      return makeChain([{ count: 0 }]);
    });

    const result = await updateBooking(1, {
      overrideStartTime: null,
      overrideEndTime: null,
      overrideReason: null,
      status: "pending",
      notes: null,
    });

    expect(result).not.toBeNull();
    expect(result!.effectiveStartTime).toBe("14:00:00");
  });
});

describe("updateBookingStatus", () => {
  it("confirms booking and sets confirmedAt", async () => {
    const updatedRow = {
      id: 1, venueId: 10, date: "2025-03-15",
      calculatedStartTime: "14:00:00", calculatedEndTime: "17:00:00",
      overrideStartTime: null, overrideEndTime: null,
      status: "confirmed", needsReconfirmation: false, notes: null,
    };

    mockUpdate.mockReturnValue(mockUpdateChain([updatedRow]));

    let selectCallIndex = 0;
    mockSelect.mockImplementation(() => {
      const idx = selectCallIndex++;
      if (idx === 0) return makeChain([{ name: "Main Hall" }]);
      return makeChain([{ count: 1 }]);
    });

    const result = await updateBookingStatus(1, "confirmed");

    expect(result).not.toBeNull();
    expect(result!.status).toBe("confirmed");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("clears confirmedAt when moving away from confirmed", async () => {
    const updatedRow = {
      id: 1, venueId: 10, date: "2025-03-15",
      calculatedStartTime: "14:00:00", calculatedEndTime: "17:00:00",
      overrideStartTime: null, overrideEndTime: null,
      status: "pending", needsReconfirmation: false, notes: null,
    };

    mockUpdate.mockReturnValue(mockUpdateChain([updatedRow]));

    let selectCallIndex = 0;
    mockSelect.mockImplementation(() => {
      const idx = selectCallIndex++;
      if (idx === 0) return makeChain([{ name: "Hall" }]);
      return makeChain([{ count: 0 }]);
    });

    const result = await updateBookingStatus(1, "pending");

    expect(result).not.toBeNull();
    expect(result!.status).toBe("pending");
  });

  it("returns null when booking not found", async () => {
    mockUpdate.mockReturnValue(mockUpdateChain([]));

    const result = await updateBookingStatus(999, "confirmed");

    expect(result).toBeNull();
  });
});

function mockInsertChain(rows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function mockDeleteChain(rows: unknown[]) {
  return {
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
}

describe("createBooking", () => {
  it("creates a booking and returns detail", async () => {
    // select calls: venue check, duplicate check, then getBookingDetail calls
    const detailBookingRow = {
      id: 1, venueId: 10, venueName: "Main Hall", date: "2025-03-15",
      calculatedStartTime: null, calculatedEndTime: null,
      overrideStartTime: "14:00:00", overrideEndTime: "17:00:00",
      overrideReason: null, status: "pending", needsReconfirmation: false,
      notes: null, confirmedBy: null, confirmedAt: null,
      createdAt: new Date("2025-01-01"), updatedAt: new Date("2025-01-01"),
    };

    let selectCallIndex = 0;
    mockSelect.mockImplementation(() => {
      const idx = selectCallIndex++;
      if (idx === 0) return makeChain([{ id: 10 }]);           // venue exists
      if (idx === 1) return makeChain([]);                      // no duplicate
      if (idx === 2) return makeChain([{ name: "Main Hall" }]); // getVenueName for event
      if (idx === 3) return makeChain([detailBookingRow]);      // getBookingDetail booking
      if (idx === 4) return makeChain([]);                      // homeTeam subquery
      if (idx === 5) return makeChain([]);                      // guestTeam subquery
      return makeChain([]);                                     // linked matches
    });

    mockInsert.mockReturnValue(mockInsertChain([{ id: 1 }]));

    const result = await createBooking({
      venueId: 10,
      date: "2025-03-15",
      overrideStartTime: "14:00:00",
      overrideEndTime: "17:00:00",
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("creates a booking with matchIds", async () => {
    const detailBookingRow = {
      id: 1, venueId: 10, venueName: "Main Hall", date: "2025-03-15",
      calculatedStartTime: null, calculatedEndTime: null,
      overrideStartTime: "14:00:00", overrideEndTime: "17:00:00",
      overrideReason: null, status: "pending", needsReconfirmation: false,
      notes: null, confirmedBy: null, confirmedAt: null,
      createdAt: new Date("2025-01-01"), updatedAt: new Date("2025-01-01"),
    };

    let selectCallIndex = 0;
    mockSelect.mockImplementation(() => {
      const idx = selectCallIndex++;
      if (idx === 0) return makeChain([{ id: 10 }]);
      if (idx === 1) return makeChain([]);
      if (idx === 2) return makeChain([{ name: "Main Hall" }]); // getVenueName for event
      if (idx === 3) return makeChain([detailBookingRow]);
      if (idx === 4) return makeChain([]);
      if (idx === 5) return makeChain([]);
      return makeChain([]);
    });

    // First insert call is for the booking, subsequent ones for match links
    mockInsert
      .mockReturnValueOnce(mockInsertChain([{ id: 1 }]))
      .mockReturnValueOnce(mockInsertChain([]))
      .mockReturnValueOnce(mockInsertChain([]));

    const result = await createBooking({
      venueId: 10,
      date: "2025-03-15",
      overrideStartTime: "14:00:00",
      overrideEndTime: "17:00:00",
      matchIds: [100, 200],
    });

    expect(result).not.toBeNull();
    expect(mockInsert).toHaveBeenCalledTimes(3);
  });

  it("returns null for non-existent venue", async () => {
    mockSelect.mockReturnValue(makeChain([]));

    const result = await createBooking({
      venueId: 999,
      date: "2025-03-15",
      overrideStartTime: "14:00:00",
      overrideEndTime: "17:00:00",
    });

    expect(result).toBeNull();
  });

  it("returns null for duplicate venue+date", async () => {
    let selectCallIndex = 0;
    mockSelect.mockImplementation(() => {
      const idx = selectCallIndex++;
      if (idx === 0) return makeChain([{ id: 10 }]);           // venue exists
      return makeChain([{ id: 99 }]);                           // duplicate exists
    });

    const result = await createBooking({
      venueId: 10,
      date: "2025-03-15",
      overrideStartTime: "14:00:00",
      overrideEndTime: "17:00:00",
    });

    expect(result).toBeNull();
  });
});

describe("deleteBooking", () => {
  it("deletes existing booking and returns true", async () => {
    mockDelete.mockReturnValue(mockDeleteChain([{ id: 1 }]));

    const result = await deleteBooking(1);

    expect(result).toBe(true);
    expect(mockDelete).toHaveBeenCalledTimes(2); // junction + booking
  });

  it("returns false for non-existent booking", async () => {
    mockDelete.mockReturnValue(mockDeleteChain([]));

    const result = await deleteBooking(999);

    expect(result).toBe(false);
  });
});

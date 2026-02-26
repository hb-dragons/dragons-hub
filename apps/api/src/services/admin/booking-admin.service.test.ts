import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  venueBookings: { id: "vb.id", venueId: "vb.venueId", date: "vb.date", calculatedStartTime: "vb.cst", calculatedEndTime: "vb.cet", overrideStartTime: "vb.ost", overrideEndTime: "vb.oet", overrideReason: "vb.or", status: "vb.status", needsReconfirmation: "vb.nr", notes: "vb.notes", confirmedBy: "vb.cb", confirmedAt: "vb.ca", createdAt: "vb.createdAt", updatedAt: "vb.updatedAt" },
  venues: { id: "v.id", name: "v.name" },
  venueBookingMatches: { venueBookingId: "vbm.vbId", matchId: "vbm.matchId" },
  matches: { id: "m.id", matchNo: "m.matchNo", kickoffDate: "m.kd", kickoffTime: "m.kt", homeTeamApiId: "m.htId", guestTeamApiId: "m.gtId" },
  teams: { apiTeamPermanentId: "t.aptId", name: "t.name" },
  tasks: { id: "task.id", title: "task.title", columnId: "task.colId", venueBookingId: "task.vbId" },
  boardColumns: { id: "bc.id", name: "bc.name", isDoneColumn: "bc.isDone" },
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
}));

import {
  listBookings,
  getBookingDetail,
  updateBooking,
  updateBookingStatus,
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
  it("returns bookings with venue name, match count, and task info", async () => {
    const rows = [
      {
        id: 1, venueId: 10, venueName: "Main Hall", date: "2025-03-15",
        calculatedStartTime: "14:00:00", calculatedEndTime: "17:00:00",
        overrideStartTime: null, overrideEndTime: null,
        status: "pending", needsReconfirmation: false, notes: null,
        matchCount: 2, taskId: 5, taskTitle: "Book venue",
      },
    ];
    mockSelect.mockReturnValue(makeChain(rows));

    const result = await listBookings();

    expect(result).toHaveLength(1);
    expect(result[0]!.venueName).toBe("Main Hall");
    expect(result[0]!.effectiveStartTime).toBe("14:00:00");
    expect(result[0]!.effectiveEndTime).toBe("17:00:00");
    expect(result[0]!.matchCount).toBe(2);
    expect(result[0]!.task).toEqual({ id: 5, title: "Book venue" });
  });

  it("uses override times for effective times", async () => {
    const rows = [
      {
        id: 1, venueId: 10, venueName: "Main Hall", date: "2025-03-15",
        calculatedStartTime: "14:00:00", calculatedEndTime: "17:00:00",
        overrideStartTime: "13:00:00", overrideEndTime: "18:00:00",
        status: "confirmed", needsReconfirmation: false, notes: null,
        matchCount: 1, taskId: null, taskTitle: null,
      },
    ];
    mockSelect.mockReturnValue(makeChain(rows));

    const result = await listBookings();

    expect(result[0]!.effectiveStartTime).toBe("13:00:00");
    expect(result[0]!.effectiveEndTime).toBe("18:00:00");
    expect(result[0]!.task).toBeNull();
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
  it("returns full booking detail with matches and task", async () => {
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

    const taskRow = { id: 5, title: "Book venue", columnName: "To Do", status: "open" };

    let selectCallIndex = 0;
    mockSelect.mockImplementation(() => {
      const idx = selectCallIndex++;
      if (idx === 0) return makeChain([bookingRow]);  // booking
      if (idx === 1) return makeChain([]);             // homeTeam subquery
      if (idx === 2) return makeChain([]);             // guestTeam subquery
      if (idx === 3) return makeChain(matchRows);      // linked matches
      return makeChain([taskRow]);                     // linked task
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

  it("returns null task when no task linked", async () => {
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
    expect(result!.task).toBeNull();
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
      if (idx === 1) return makeChain([{ count: 2 }]);            // matchCount
      return makeChain([{ id: 5, title: "Book venue" }]);         // task
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
    expect(result!.task).toEqual({ id: 5, title: "Book venue" });
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
      if (idx === 1) return makeChain([{ count: 0 }]);
      return makeChain([]);
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
    expect(result!.task).toBeNull();
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
      if (idx === 1) return makeChain([{ count: 1 }]);
      return makeChain([]);
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
      if (idx === 1) return makeChain([{ count: 0 }]);
      return makeChain([]);
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

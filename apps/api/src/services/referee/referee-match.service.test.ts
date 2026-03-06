import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  matches: {
    id: "m.id",
    apiMatchId: "m.apiMatchId",
    matchNo: "m.matchNo",
    kickoffDate: "m.kickoffDate",
    kickoffTime: "m.kickoffTime",
    homeTeamApiId: "m.homeTeamApiId",
    guestTeamApiId: "m.guestTeamApiId",
    leagueId: "m.leagueId",
    venueId: "m.venueId",
    sr1Open: "m.sr1Open",
    sr2Open: "m.sr2Open",
    sr3Open: "m.sr3Open",
    isForfeited: "m.isForfeited",
    isCancelled: "m.isCancelled",
  },
  teams: {
    id: "t.id",
    name: "t.name",
    apiTeamPermanentId: "t.apiTeamPermanentId",
    isOwnClub: "t.isOwnClub",
  },
  leagues: { id: "l.id", name: "l.name", ownClubRefs: "l.ownClubRefs" },
  venues: { id: "v.id", name: "v.name", city: "v.city" },
  refereeAssignmentIntents: {
    matchId: "rai.matchId",
    refereeId: "rai.refereeId",
    slotNumber: "rai.slotNumber",
    clickedAt: "rai.clickedAt",
    confirmedBySyncAt: "rai.confirmedBySyncAt",
  },
  matchReferees: {
    matchId: "mr.matchId",
    refereeId: "mr.refereeId",
    slotNumber: "mr.slotNumber",
  },
  referees: {
    id: "r.id",
    firstName: "r.firstName",
    lastName: "r.lastName",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  asc: vi.fn((...args: unknown[]) => ({ asc: args })),
  gte: vi.fn((...args: unknown[]) => ({ gte: args })),
  lte: vi.fn((...args: unknown[]) => ({ lte: args })),
  inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
  isNull: vi.fn((...args: unknown[]) => ({ isNull: args })),
  sql: vi.fn((...args: unknown[]) => ({ sql: args })),
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: vi.fn((_table: unknown, name: string) => ({
    name: `${name}.name`,
    apiTeamPermanentId: `${name}.apiTeamPermanentId`,
    isOwnClub: `${name}.isOwnClub`,
  })),
}));

import {
  getMatchesWithOpenSlots,
  recordTakeIntent,
  cancelTakeIntent,
} from "./referee-match.service";

function buildChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "orderBy",
    "limit",
    "offset",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (v: unknown) => void) => {
    resolve(result);
    return chain;
  };
  return chain;
}

function buildInsertChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.values = vi.fn().mockReturnValue(chain);
  chain.onConflictDoUpdate = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(result);
  return chain;
}

describe("getMatchesWithOpenSlots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matches where at least one SR slot is open", async () => {
    const rows = [
      {
        id: 1,
        apiMatchId: 100,
        matchNo: 1001,
        kickoffDate: "2025-06-01",
        kickoffTime: "18:00:00",
        homeTeamName: "Dragons",
        guestTeamName: "Eagles",
        homeIsOwnClub: true,
        guestIsOwnClub: false,
        leagueName: "Bezirksliga",
        venueName: "Sporthalle",
        venueCity: "Berlin",
        sr1Open: true,
        sr2Open: false,
        isForfeited: false,
        isCancelled: false,
        ownClubRefs: false,
      },
    ];
    const countResult = [{ count: 1 }];

    const dataChain = buildChain(rows);
    const countChain = buildChain(countResult);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(buildChain([])) // intents
      .mockReturnValueOnce(buildChain([])); // assignments

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      id: 1,
      apiMatchId: 100,
      matchNo: 1001,
      kickoffDate: "2025-06-01",
      kickoffTime: "18:00:00",
      homeTeamName: "Dragons",
      guestTeamName: "Eagles",
      homeIsOwnClub: true,
      guestIsOwnClub: false,
      leagueName: "Bezirksliga",
      venueName: "Sporthalle",
      venueCity: "Berlin",
      sr1Open: true,
      sr2Open: false,
      isForfeited: false,
      isCancelled: false,
      ownClubRefs: false,
      sr1Referee: null,
      sr2Referee: null,
      myIntents: [],
    });
    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(false);
  });

  it("returns empty results when no matches have open slots", async () => {
    const dataChain = buildChain([]);
    const countChain = buildChain([{ count: 0 }]);

    mockSelect.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    // Should not query intents when no matchIds
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("includes own-club flags correctly", async () => {
    const rows = [
      {
        id: 2,
        apiMatchId: 200,
        matchNo: 2002,
        kickoffDate: "2025-06-02",
        kickoffTime: "20:00:00",
        homeTeamName: "Lions",
        guestTeamName: "Dragons",
        homeIsOwnClub: false,
        guestIsOwnClub: true,
        leagueName: "Kreisliga",
        venueName: null,
        venueCity: null,
        sr1Open: false,
        sr2Open: true,
        ownClubRefs: false,
      },
    ];
    const countResult = [{ count: 1 }];

    const dataChain = buildChain(rows);
    const countChain = buildChain(countResult);
    const intentChain = buildChain([]);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(intentChain)
      .mockReturnValueOnce(buildChain([])); // assignments

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items[0]?.homeIsOwnClub).toBe(false);
    expect(result.items[0]?.guestIsOwnClub).toBe(true);
  });

  it("defaults isOwnClub to false when null", async () => {
    const rows = [
      {
        id: 3,
        apiMatchId: 300,
        matchNo: 3003,
        kickoffDate: "2025-06-03",
        kickoffTime: "14:00:00",
        homeTeamName: "Bears",
        guestTeamName: "Wolves",
        homeIsOwnClub: null,
        guestIsOwnClub: null,
        leagueName: "Oberliga",
        venueName: "Arena",
        venueCity: "Hamburg",
        sr1Open: false,
        sr2Open: true,
        ownClubRefs: null,
      },
    ];
    const countResult = [{ count: 1 }];

    mockSelect
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain(countResult))
      .mockReturnValueOnce(buildChain([])) // intents
      .mockReturnValueOnce(buildChain([])); // assignments

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items[0]?.homeIsOwnClub).toBe(false);
    expect(result.items[0]?.guestIsOwnClub).toBe(false);
  });

  it("supports pagination with limit and offset", async () => {
    const rows = [
      {
        id: 5,
        apiMatchId: 500,
        matchNo: 5005,
        kickoffDate: "2025-06-05",
        kickoffTime: "19:00:00",
        homeTeamName: "Hawks",
        guestTeamName: "Falcons",
        homeIsOwnClub: false,
        guestIsOwnClub: false,
        leagueName: "Liga",
        venueName: "Halle",
        venueCity: "Munich",
        sr1Open: true,
        sr2Open: true,
        ownClubRefs: false,
      },
    ];
    const countResult = [{ count: 10 }];

    mockSelect
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain(countResult))
      .mockReturnValueOnce(buildChain([])) // intents
      .mockReturnValueOnce(buildChain([])); // assignments

    const result = await getMatchesWithOpenSlots(
      { limit: 1, offset: 4 },
      42,
    );

    expect(result.total).toBe(10);
    expect(result.limit).toBe(1);
    expect(result.offset).toBe(4);
    expect(result.hasMore).toBe(true);
  });

  it("includes the referee's intents for returned matches", async () => {
    const rows = [
      {
        id: 10,
        apiMatchId: 1000,
        matchNo: 10010,
        kickoffDate: "2025-07-01",
        kickoffTime: "17:00:00",
        homeTeamName: "TeamA",
        guestTeamName: "TeamB",
        homeIsOwnClub: false,
        guestIsOwnClub: false,
        leagueName: "Liga",
        venueName: "Gym",
        venueCity: "Cologne",
        sr1Open: true,
        sr2Open: true,
        ownClubRefs: false,
      },
    ];
    const countResult = [{ count: 1 }];
    const intentRows = [
      {
        matchId: 10,
        slotNumber: 1,
        clickedAt: new Date("2025-06-30T12:00:00Z"),
        confirmedBySyncAt: null,
      },
      {
        matchId: 10,
        slotNumber: 2,
        clickedAt: new Date("2025-06-30T13:00:00Z"),
        confirmedBySyncAt: new Date("2025-06-30T14:00:00Z"),
      },
    ];

    mockSelect
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain(countResult))
      .mockReturnValueOnce(buildChain(intentRows))
      .mockReturnValueOnce(buildChain([])); // assignments

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items[0]?.myIntents).toEqual([
      {
        slotNumber: 1,
        clickedAt: "2025-06-30T12:00:00.000Z",
        confirmedBySyncAt: null,
      },
      {
        slotNumber: 2,
        clickedAt: "2025-06-30T13:00:00.000Z",
        confirmedBySyncAt: "2025-06-30T14:00:00.000Z",
      },
    ]);
  });

  it("filters by leagueId when provided", async () => {
    mockSelect
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([{ count: 0 }]));

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0, leagueId: 5 },
      42,
    );

    expect(result.items).toEqual([]);
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("filters by dateFrom and dateTo when provided", async () => {
    mockSelect
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([{ count: 0 }]));

    const result = await getMatchesWithOpenSlots(
      {
        limit: 20,
        offset: 0,
        dateFrom: "2025-06-01",
        dateTo: "2025-06-30",
      },
      42,
    );

    expect(result.items).toEqual([]);
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("defaults total to 0 when count result is empty", async () => {
    mockSelect
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]));

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.total).toBe(0);
  });
});

describe("recordTakeIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates intent and returns deep-link URL with correct apiMatchId", async () => {
    const matchRow = [
      {
        id: 1,
        apiMatchId: 999,
        sr1Open: true,
        sr2Open: false,
        leagueOwnClubRefs: false,
        homeIsOwnClub: false,
      },
    ];

    const selectChain = buildChain(matchRow);
    mockSelect.mockReturnValueOnce(selectChain);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-07-01T10:00:00Z"));

    const insertChain = buildInsertChain([
      {
        matchId: 1,
        refereeId: 42,
        slotNumber: 1,
        clickedAt: new Date("2025-07-01T10:00:00Z"),
      },
    ]);
    mockInsert.mockReturnValueOnce(insertChain);

    const result = await recordTakeIntent(1, 42, 1);

    expect(result).toEqual({
      deepLink:
        "https://basketball-bund.net/app.do?app=/sr/take&spielId=999",
      intent: {
        matchId: 1,
        slotNumber: 1,
        clickedAt: "2025-07-01T10:00:00.000Z",
      },
    });

    vi.useRealTimers();
  });

  it("returns error with status 404 for nonexistent match", async () => {
    const selectChain = buildChain([]);
    mockSelect.mockReturnValueOnce(selectChain);

    const result = await recordTakeIntent(999, 42, 1);

    expect(result).toEqual({ error: "Match not found", status: 404 });
  });

  it("returns error with status 400 if the slot is not open", async () => {
    const matchRow = [
      {
        id: 1,
        apiMatchId: 100,
        sr1Open: false,
        sr2Open: true,
        leagueOwnClubRefs: false,
        homeIsOwnClub: false,
      },
    ];
    const selectChain = buildChain(matchRow);
    mockSelect.mockReturnValueOnce(selectChain);

    const result = await recordTakeIntent(1, 42, 1);

    expect(result).toEqual({
      error: "This referee slot is not open",
      status: 400,
    });
  });

  it("returns error for slot 2 when sr2Open is false", async () => {
    const matchRow = [
      {
        id: 1,
        apiMatchId: 100,
        sr1Open: true,
        sr2Open: false,
        leagueOwnClubRefs: false,
        homeIsOwnClub: false,
      },
    ];
    const selectChain = buildChain(matchRow);
    mockSelect.mockReturnValueOnce(selectChain);

    const result = await recordTakeIntent(1, 42, 2);

    expect(result).toEqual({
      error: "This referee slot is not open",
      status: 400,
    });
  });

  it("allows take on ownClubRefs home game even when slot not explicitly open", async () => {
    const matchRow = [
      {
        id: 1,
        apiMatchId: 100,
        sr1Open: false,
        sr2Open: false,
        leagueOwnClubRefs: true,
        homeIsOwnClub: true,
      },
    ];
    const selectChain = buildChain(matchRow);
    mockSelect.mockReturnValueOnce(selectChain);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-07-01T10:00:00Z"));

    const insertChain = buildInsertChain([
      {
        matchId: 1,
        refereeId: 42,
        slotNumber: 1,
        clickedAt: new Date("2025-07-01T10:00:00Z"),
      },
    ]);
    mockInsert.mockReturnValueOnce(insertChain);

    const result = await recordTakeIntent(1, 42, 1);

    expect(result).toEqual({
      deepLink:
        "https://basketball-bund.net/app.do?app=/sr/take&spielId=100",
      intent: {
        matchId: 1,
        slotNumber: 1,
        clickedAt: "2025-07-01T10:00:00.000Z",
      },
    });

    vi.useRealTimers();
  });

  it("on duplicate upserts clickedAt via onConflictDoUpdate", async () => {
    const matchRow = [
      {
        id: 1,
        apiMatchId: 100,
        sr1Open: true,
        sr2Open: false,
        leagueOwnClubRefs: false,
        homeIsOwnClub: false,
      },
    ];
    const selectChain = buildChain(matchRow);
    mockSelect.mockReturnValueOnce(selectChain);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-07-02T08:00:00Z"));

    const insertChain = buildInsertChain([
      {
        matchId: 1,
        refereeId: 42,
        slotNumber: 1,
        clickedAt: new Date("2025-07-02T08:00:00Z"),
      },
    ]);
    mockInsert.mockReturnValueOnce(insertChain);

    const result = await recordTakeIntent(1, 42, 1);

    expect(result).toEqual({
      deepLink:
        "https://basketball-bund.net/app.do?app=/sr/take&spielId=100",
      intent: {
        matchId: 1,
        slotNumber: 1,
        clickedAt: "2025-07-02T08:00:00.000Z",
      },
    });

    // Verify insert was called with onConflictDoUpdate
    expect(insertChain.values).toHaveBeenCalled();
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalled();
    expect(insertChain.returning).toHaveBeenCalled();

    vi.useRealTimers();
  });
});

function buildDeleteChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.where = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(result);
  return chain;
}

describe("cancelTakeIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes unconfirmed intent and returns success", async () => {
    const deleteChain = buildDeleteChain([
      { matchId: 1, refereeId: 42, slotNumber: 1 },
    ]);
    mockDelete.mockReturnValueOnce(deleteChain);

    const result = await cancelTakeIntent(1, 42, 1);

    expect(result).toEqual({ success: true });
    expect(deleteChain.where).toHaveBeenCalled();
    expect(deleteChain.returning).toHaveBeenCalled();
  });

  it("returns 404 when no pending intent exists", async () => {
    const deleteChain = buildDeleteChain([]);
    mockDelete.mockReturnValueOnce(deleteChain);

    const result = await cancelTakeIntent(1, 42, 1);

    expect(result).toEqual({ error: "No pending intent found", status: 404 });
  });
});

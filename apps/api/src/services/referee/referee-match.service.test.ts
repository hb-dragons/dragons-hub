import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
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
    id: "mr.id",
    matchId: "mr.matchId",
    refereeId: "mr.refereeId",
    slotNumber: "mr.slotNumber",
  },
  referees: {
    id: "r.id",
    apiId: "r.apiId",
    firstName: "r.firstName",
    lastName: "r.lastName",
  },
  refereeRoles: {
    apiId: "rr.apiId",
    name: "rr.name",
    shortName: "rr.shortName",
  },
  refereeAssignmentRules: {
    id: "rar.id",
    refereeId: "rar.refereeId",
    teamId: "rar.teamId",
    deny: "rar.deny",
    allowSr1: "rar.allowSr1",
    allowSr2: "rar.allowSr2",
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
  exists: vi.fn((...args: unknown[]) => ({ exists: args })),
  notExists: vi.fn((...args: unknown[]) => ({ notExists: args })),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  },
}));

const mockGetGameDetails = vi.fn();
vi.mock("../sync/sdk-client", () => ({
  sdkClient: {
    getGameDetails: (...args: unknown[]) => mockGetGameDetails(...args),
  },
}));

vi.mock("./referee-rules.service", () => ({
  hasAnyRules: vi.fn(),
  getRuleForRefereeAndTeam: vi.fn(),
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: vi.fn((_table: unknown, name: string) => ({
    id: `${name}.id`,
    name: `${name}.name`,
    apiTeamPermanentId: `${name}.apiTeamPermanentId`,
    isOwnClub: `${name}.isOwnClub`,
  })),
}));

import {
  getMatchesWithOpenSlots,
  recordTakeIntent,
  cancelTakeIntent,
  verifyMatchAssignment,
} from "./referee-match.service";
import { hasAnyRules, getRuleForRefereeAndTeam } from "./referee-rules.service";

const mockHasAnyRules = hasAnyRules as ReturnType<typeof vi.fn>;
const mockGetRuleForRefereeAndTeam = getRuleForRefereeAndTeam as ReturnType<typeof vi.fn>;

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

function buildUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockResolvedValue(undefined);
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
      .mockReturnValueOnce(buildChain([])) // rules check (no rules)
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(buildChain([])) // intents
      .mockReturnValueOnce(buildChain([])) // assignments
      .mockReturnValueOnce(buildChain([])); // allRefRules for slot eligibility

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
      sr1Allowed: true,
      sr2Allowed: true,
      currentRefereeId: 42,
      intents: [],
    });
    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(false);
  });

  it("returns empty results when no matches have open slots", async () => {
    const dataChain = buildChain([]);
    const countChain = buildChain([{ count: 0 }]);

    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check (no rules)
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(buildChain([])); // allRefRules for slot eligibility

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    // Should not query intents when no matchIds (rules check + data + count + allRefRules = 4)
    expect(mockSelect).toHaveBeenCalledTimes(4);
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
        homeTeamId: 10,
      },
    ];
    const countResult = [{ count: 1 }];

    const dataChain = buildChain(rows);
    const countChain = buildChain(countResult);
    const intentChain = buildChain([]);

    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check (no rules)
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(intentChain)
      .mockReturnValueOnce(buildChain([])) // assignments
      .mockReturnValueOnce(buildChain([])); // allRefRules for slot eligibility

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
        homeTeamId: 10,
      },
    ];
    const countResult = [{ count: 1 }];

    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check (no rules)
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain(countResult))
      .mockReturnValueOnce(buildChain([])) // intents
      .mockReturnValueOnce(buildChain([])) // assignments
      .mockReturnValueOnce(buildChain([])); // allRefRules for slot eligibility

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
        homeTeamId: 10,
      },
    ];
    const countResult = [{ count: 10 }];

    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check (no rules)
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain(countResult))
      .mockReturnValueOnce(buildChain([])) // intents
      .mockReturnValueOnce(buildChain([])) // assignments
      .mockReturnValueOnce(buildChain([])); // allRefRules for slot eligibility

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
        homeTeamId: 10,
      },
    ];
    const countResult = [{ count: 1 }];
    const intentRows = [
      {
        matchId: 10,
        slotNumber: 1,
        refereeId: 42,
        clickedAt: new Date("2025-06-30T12:00:00Z"),
        confirmedBySyncAt: null,
        refereeFirstName: "Max",
        refereeLastName: "Müller",
      },
      {
        matchId: 10,
        slotNumber: 2,
        refereeId: 42,
        clickedAt: new Date("2025-06-30T13:00:00Z"),
        confirmedBySyncAt: new Date("2025-06-30T14:00:00Z"),
        refereeFirstName: "Max",
        refereeLastName: "Müller",
      },
    ];

    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check (no rules)
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain(countResult))
      .mockReturnValueOnce(buildChain(intentRows))
      .mockReturnValueOnce(buildChain([])) // assignments
      .mockReturnValueOnce(buildChain([])); // allRefRules for slot eligibility

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items[0]?.intents).toEqual([
      {
        slotNumber: 1,
        refereeId: 42,
        refereeFirstName: "Max",
        refereeLastName: "Müller",
        clickedAt: "2025-06-30T12:00:00.000Z",
        confirmedBySyncAt: null,
      },
      {
        slotNumber: 2,
        refereeId: 42,
        refereeFirstName: "Max",
        refereeLastName: "Müller",
        clickedAt: "2025-06-30T13:00:00.000Z",
        confirmedBySyncAt: "2025-06-30T14:00:00.000Z",
      },
    ]);
    expect(result.items[0]?.currentRefereeId).toBe(42);
  });

  it("filters by leagueId when provided", async () => {
    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check (no rules)
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([{ count: 0 }]))
      .mockReturnValueOnce(buildChain([])); // allRefRules for slot eligibility

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0, leagueId: 5 },
      42,
    );

    expect(result.items).toEqual([]);
    expect(mockSelect).toHaveBeenCalledTimes(4);
  });

  it("filters by dateFrom and dateTo when provided", async () => {
    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check (no rules)
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([{ count: 0 }]))
      .mockReturnValueOnce(buildChain([])); // allRefRules for slot eligibility

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
    expect(mockSelect).toHaveBeenCalledTimes(4);
  });

  it("defaults total to 0 when count result is empty", async () => {
    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check (no rules)
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([])); // allRefRules for slot eligibility

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.total).toBe(0);
  });

  it("defaults isForfeited and isCancelled to false when null", async () => {
    const rows = [
      {
        id: 20,
        apiMatchId: 2000,
        matchNo: 20020,
        kickoffDate: "2025-08-01",
        kickoffTime: "15:00:00",
        homeTeamName: "TeamX",
        guestTeamName: "TeamY",
        homeIsOwnClub: false,
        guestIsOwnClub: false,
        leagueName: "Liga",
        venueName: "Hall",
        venueCity: "Stuttgart",
        sr1Open: true,
        sr2Open: false,
        isForfeited: null,
        isCancelled: null,
        ownClubRefs: false,
        homeTeamId: 10,
      },
    ];

    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain([{ count: 1 }]))
      .mockReturnValueOnce(buildChain([])) // intents
      .mockReturnValueOnce(buildChain([])) // assignments
      .mockReturnValueOnce(buildChain([])); // allRefRules

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items[0]?.isForfeited).toBe(false);
    expect(result.items[0]?.isCancelled).toBe(false);
  });

  it("populates sr1Referee and sr2Referee from assignment data", async () => {
    const rows = [
      {
        id: 30,
        apiMatchId: 3000,
        matchNo: 30030,
        kickoffDate: "2025-09-01",
        kickoffTime: "18:00:00",
        homeTeamName: "TeamA",
        guestTeamName: "TeamB",
        homeIsOwnClub: false,
        guestIsOwnClub: false,
        leagueName: "Liga",
        venueName: "Gym",
        venueCity: "Berlin",
        sr1Open: false,
        sr2Open: false,
        isForfeited: false,
        isCancelled: false,
        ownClubRefs: false,
        homeTeamId: 10,
      },
    ];

    const assignmentRows = [
      { matchId: 30, slotNumber: 1, firstName: "Anna", lastName: "Schmidt" },
      { matchId: 30, slotNumber: 2, firstName: "Tom", lastName: "Weber" },
    ];

    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain([{ count: 1 }]))
      .mockReturnValueOnce(buildChain([])) // intents
      .mockReturnValueOnce(buildChain(assignmentRows)) // assignments
      .mockReturnValueOnce(buildChain([])); // allRefRules

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items[0]?.sr1Referee).toEqual({ firstName: "Anna", lastName: "Schmidt" });
    expect(result.items[0]?.sr2Referee).toEqual({ firstName: "Tom", lastName: "Weber" });
  });

  it("sets sr1Allowed/sr2Allowed to false when deny rule exists for the home team", async () => {
    const rows = [
      {
        id: 40,
        apiMatchId: 4000,
        matchNo: 40040,
        kickoffDate: "2025-09-15",
        kickoffTime: "19:00:00",
        homeTeamName: "Dragons",
        guestTeamName: "Eagles",
        homeIsOwnClub: true,
        guestIsOwnClub: false,
        leagueName: "Liga",
        venueName: "Halle",
        venueCity: "Berlin",
        sr1Open: true,
        sr2Open: true,
        isForfeited: false,
        isCancelled: false,
        ownClubRefs: true,
        homeTeamId: 10,
      },
    ];

    const denyRule = [
      { teamId: 10, deny: true, allowSr1: false, allowSr2: false },
    ];

    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check (no rules -> permissive path)
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain([{ count: 1 }]))
      .mockReturnValueOnce(buildChain([])) // intents
      .mockReturnValueOnce(buildChain([])) // assignments
      .mockReturnValueOnce(buildChain(denyRule)); // allRefRules: deny rule for team 10

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items[0]?.sr1Allowed).toBe(false);
    expect(result.items[0]?.sr2Allowed).toBe(false);
  });

  it("respects allow rule allowSr1/allowSr2 specifics for a team", async () => {
    const rows = [
      {
        id: 41,
        apiMatchId: 4100,
        matchNo: 41041,
        kickoffDate: "2025-09-16",
        kickoffTime: "19:00:00",
        homeTeamName: "Dragons",
        guestTeamName: "Eagles",
        homeIsOwnClub: true,
        guestIsOwnClub: false,
        leagueName: "Liga",
        venueName: "Halle",
        venueCity: "Berlin",
        sr1Open: true,
        sr2Open: true,
        isForfeited: false,
        isCancelled: false,
        ownClubRefs: true,
        homeTeamId: 10,
      },
    ];

    const allowRule = [
      { teamId: 10, deny: false, allowSr1: true, allowSr2: false },
    ];

    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain([{ count: 1 }]))
      .mockReturnValueOnce(buildChain([])) // intents
      .mockReturnValueOnce(buildChain([])) // assignments
      .mockReturnValueOnce(buildChain(allowRule)); // allRefRules

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items[0]?.sr1Allowed).toBe(true);
    expect(result.items[0]?.sr2Allowed).toBe(false);
  });

  it("disallows both slots when referee has allow rules but none for this team", async () => {
    const rows = [
      {
        id: 42,
        apiMatchId: 4200,
        matchNo: 42042,
        kickoffDate: "2025-09-17",
        kickoffTime: "19:00:00",
        homeTeamName: "Dragons",
        guestTeamName: "Eagles",
        homeIsOwnClub: true,
        guestIsOwnClub: false,
        leagueName: "Liga",
        venueName: "Halle",
        venueCity: "Berlin",
        sr1Open: true,
        sr2Open: true,
        isForfeited: false,
        isCancelled: false,
        ownClubRefs: true,
        homeTeamId: 10,
      },
    ];

    // Referee has allow rule for team 99, not team 10
    const otherTeamRule = [
      { teamId: 99, deny: false, allowSr1: true, allowSr2: true },
    ];

    mockSelect
      .mockReturnValueOnce(buildChain([])) // rules check
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain([{ count: 1 }]))
      .mockReturnValueOnce(buildChain([])) // intents
      .mockReturnValueOnce(buildChain([])) // assignments
      .mockReturnValueOnce(buildChain(otherTeamRule)); // allRefRules: allow rule for different team

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      43, // different refereeId to avoid collision with match id
    );

    expect(result.items[0]?.sr1Allowed).toBe(false);
    expect(result.items[0]?.sr2Allowed).toBe(false);
  });
});

describe("getMatchesWithOpenSlots - rule-based filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces base condition with exists subquery when referee has rules", async () => {
    // Rules check returns a row (referee has allow rules)
    mockSelect
      .mockReturnValueOnce(buildChain([{ id: 1, deny: false }])) // rules check (has allow rules)
      .mockReturnValueOnce(buildChain([])) // notExists subquery builder
      .mockReturnValueOnce(buildChain([])) // exists subquery builder
      .mockReturnValueOnce(buildChain([])) // data
      .mockReturnValueOnce(buildChain([{ count: 0 }])) // count
      .mockReturnValueOnce(buildChain([])); // allRefRules for slot eligibility

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    // rules check + notExists subquery + exists subquery + data + count + allRefRules = 6
    expect(mockSelect).toHaveBeenCalledTimes(6);
  });

  it("skips rule check when refereeId is null", async () => {
    mockSelect
      .mockReturnValueOnce(buildChain([])) // data
      .mockReturnValueOnce(buildChain([{ count: 0 }])); // count

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      null,
    );

    expect(result.items).toEqual([]);
    // No rules check when refereeId is null: data + count = 2
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("uses deny-only path when referee has only deny rules (no allow rules)", async () => {
    // Rules check returns only deny rules (no allow rules)
    mockSelect
      .mockReturnValueOnce(buildChain([{ id: 1, deny: true }])) // rules check (deny only)
      .mockReturnValueOnce(buildChain([])) // notExists subquery builder (denyCheck)
      .mockReturnValueOnce(buildChain([])) // data
      .mockReturnValueOnce(buildChain([{ count: 0 }])) // count
      .mockReturnValueOnce(buildChain([])); // allRefRules

    const result = await getMatchesWithOpenSlots(
      { limit: 20, offset: 0 },
      42,
    );

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    // rules check + notExists subquery + data + count + allRefRules = 5 (no exists subquery)
    expect(mockSelect).toHaveBeenCalledTimes(5);
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
        homeTeamId: 10,
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
        homeTeamId: 10,
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
        homeTeamId: 10,
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
        homeTeamId: 10,
      },
    ];
    const selectChain = buildChain(matchRow);
    mockSelect.mockReturnValueOnce(selectChain);
    mockHasAnyRules.mockResolvedValueOnce(false);

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
        homeTeamId: 10,
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

describe("recordTakeIntent - rule-based guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when referee has rules but no rule for this team", async () => {
    const matchRow = [
      {
        id: 1,
        apiMatchId: 100,
        sr1Open: false,
        sr2Open: false,
        leagueOwnClubRefs: true,
        homeIsOwnClub: true,
        homeTeamId: 10,
      },
    ];
    mockSelect
      .mockReturnValueOnce(buildChain(matchRow)) // match lookup
      .mockReturnValueOnce(buildChain([{ deny: false }])); // allRules check (has allow rules)
    mockHasAnyRules.mockResolvedValueOnce(true);
    mockGetRuleForRefereeAndTeam.mockResolvedValueOnce(null);

    const result = await recordTakeIntent(1, 42, 1);

    expect(result).toEqual({ error: "Not eligible for this match", status: 403 });
  });

  it("returns 403 when rule exists but slot is not allowed", async () => {
    const matchRow = [
      {
        id: 1,
        apiMatchId: 100,
        sr1Open: false,
        sr2Open: false,
        leagueOwnClubRefs: true,
        homeIsOwnClub: true,
        homeTeamId: 10,
      },
    ];
    mockSelect.mockReturnValueOnce(buildChain(matchRow));
    mockHasAnyRules.mockResolvedValueOnce(true);
    mockGetRuleForRefereeAndTeam.mockResolvedValueOnce({ deny: false, allowSr1: false, allowSr2: true });

    const result = await recordTakeIntent(1, 42, 1);

    expect(result).toEqual({ error: "Not eligible for this slot", status: 403 });
  });

  it("allows take when rule exists and slot is allowed", async () => {
    const matchRow = [
      {
        id: 1,
        apiMatchId: 100,
        sr1Open: false,
        sr2Open: false,
        leagueOwnClubRefs: true,
        homeIsOwnClub: true,
        homeTeamId: 10,
      },
    ];
    mockSelect.mockReturnValueOnce(buildChain(matchRow));
    mockHasAnyRules.mockResolvedValueOnce(true);
    mockGetRuleForRefereeAndTeam.mockResolvedValueOnce({ deny: false, allowSr1: true, allowSr2: false });

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
      deepLink: "https://basketball-bund.net/app.do?app=/sr/take&spielId=100",
      intent: {
        matchId: 1,
        slotNumber: 1,
        clickedAt: "2025-07-01T10:00:00.000Z",
      },
    });

    vi.useRealTimers();
  });

  it("allows take for slot 2 when rule allows sr2", async () => {
    const matchRow = [
      {
        id: 1,
        apiMatchId: 100,
        sr1Open: false,
        sr2Open: false,
        leagueOwnClubRefs: true,
        homeIsOwnClub: true,
        homeTeamId: 10,
      },
    ];
    mockSelect.mockReturnValueOnce(buildChain(matchRow));
    mockHasAnyRules.mockResolvedValueOnce(true);
    mockGetRuleForRefereeAndTeam.mockResolvedValueOnce({ deny: false, allowSr1: false, allowSr2: true });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-07-01T10:00:00Z"));

    const insertChain = buildInsertChain([
      {
        matchId: 1,
        refereeId: 42,
        slotNumber: 2,
        clickedAt: new Date("2025-07-01T10:00:00Z"),
      },
    ]);
    mockInsert.mockReturnValueOnce(insertChain);

    const result = await recordTakeIntent(1, 42, 2);

    expect(result).toEqual({
      deepLink: "https://basketball-bund.net/app.do?app=/sr/take&spielId=100",
      intent: {
        matchId: 1,
        slotNumber: 2,
        clickedAt: "2025-07-01T10:00:00.000Z",
      },
    });

    vi.useRealTimers();
  });

  it("skips rule guard for non-ownClubRefs matches", async () => {
    const matchRow = [
      {
        id: 1,
        apiMatchId: 100,
        sr1Open: true,
        sr2Open: false,
        leagueOwnClubRefs: false,
        homeIsOwnClub: false,
        homeTeamId: 10,
      },
    ];
    mockSelect.mockReturnValueOnce(buildChain(matchRow));

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
      deepLink: "https://basketball-bund.net/app.do?app=/sr/take&spielId=100",
      intent: {
        matchId: 1,
        slotNumber: 1,
        clickedAt: "2025-07-01T10:00:00.000Z",
      },
    });
    // hasAnyRules should NOT have been called
    expect(mockHasAnyRules).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("returns 403 when deny rule exists for this team", async () => {
    const matchRow = [
      {
        id: 1,
        apiMatchId: 100,
        sr1Open: false,
        sr2Open: false,
        leagueOwnClubRefs: true,
        homeIsOwnClub: true,
        homeTeamId: 10,
      },
    ];
    mockSelect.mockReturnValueOnce(buildChain(matchRow));
    mockHasAnyRules.mockResolvedValueOnce(true);
    mockGetRuleForRefereeAndTeam.mockResolvedValueOnce({ deny: true, allowSr1: false, allowSr2: false });

    const result = await recordTakeIntent(1, 42, 1);

    expect(result).toEqual({ error: "Not eligible for this match", status: 403 });
  });

  it("allows take when referee has only deny rules and this team is not denied", async () => {
    const matchRow = [
      {
        id: 1,
        apiMatchId: 100,
        sr1Open: false,
        sr2Open: false,
        leagueOwnClubRefs: true,
        homeIsOwnClub: true,
        homeTeamId: 10,
      },
    ];
    mockSelect
      .mockReturnValueOnce(buildChain(matchRow)) // match lookup
      .mockReturnValueOnce(buildChain([{ deny: true }])); // allRules: only deny rules (none for team 10)
    mockHasAnyRules.mockResolvedValueOnce(true);
    mockGetRuleForRefereeAndTeam.mockResolvedValueOnce(null); // no rule for this team

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
      deepLink: "https://basketball-bund.net/app.do?app=/sr/take&spielId=100",
      intent: {
        matchId: 1,
        slotNumber: 1,
        clickedAt: "2025-07-01T10:00:00.000Z",
      },
    });

    vi.useRealTimers();
  });
});

describe("verifyMatchAssignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when match is not found", async () => {
    mockSelect.mockReturnValueOnce(buildChain([])); // match lookup returns empty

    const result = await verifyMatchAssignment(999, 42);

    expect(result).toEqual({ error: "Match not found", status: 404 });
  });

  it("returns 502 when SDK getGameDetails throws", async () => {
    mockSelect.mockReturnValueOnce(buildChain([{ id: 1, apiMatchId: 100 }])); // match found
    mockGetGameDetails.mockRejectedValueOnce(new Error("Network failure"));

    const result = await verifyMatchAssignment(1, 42);

    expect(result).toEqual({
      error: "Failed to fetch game details from Basketball-Bund",
      status: 502,
    });
  });

  it("returns confirmed=true and updates intent when referee is assigned", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-08-01T12:00:00Z"));

    // 1. match lookup
    mockSelect.mockReturnValueOnce(buildChain([{ id: 1, apiMatchId: 100 }]));

    // SDK returns details with no referee assignments in slots
    mockGetGameDetails.mockResolvedValueOnce({
      sr1: { offenAngeboten: false },
      sr2: { offenAngeboten: true },
    });

    // 2. db.update(matches).set(...).where(...)
    const matchUpdateChain = buildUpdateChain();
    mockUpdate.mockReturnValueOnce(matchUpdateChain);

    // No slot spielleitung data, so the for loop doesn't trigger inserts

    // 3. assignment check: referee IS assigned
    mockSelect.mockReturnValueOnce(buildChain([{ id: 5 }]));

    // 4. db.update(refereeAssignmentIntents).set(...).where(...)
    const intentUpdateChain = buildUpdateChain();
    mockUpdate.mockReturnValueOnce(intentUpdateChain);

    // 5. assigned refs query
    mockSelect.mockReturnValueOnce(buildChain([
      { slotNumber: 1, firstName: "Max", lastName: "Müller" },
    ]));

    const result = await verifyMatchAssignment(1, 42);

    expect(result).toEqual({
      confirmed: true,
      sr1Open: false,
      sr2Open: true,
      sr1Referee: { firstName: "Max", lastName: "Müller" },
      sr2Referee: null,
    });

    // Verify intent confirmation update was called
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("returns confirmed=false when referee is not assigned", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-08-01T12:00:00Z"));

    // match lookup
    mockSelect.mockReturnValueOnce(buildChain([{ id: 1, apiMatchId: 100 }]));

    mockGetGameDetails.mockResolvedValueOnce({
      sr1: { offenAngeboten: true },
      sr2: { offenAngeboten: true },
    });

    // update matches
    const matchUpdateChain = buildUpdateChain();
    mockUpdate.mockReturnValueOnce(matchUpdateChain);

    // assignment check: NOT assigned
    mockSelect.mockReturnValueOnce(buildChain([]));

    // assigned refs query (none)
    mockSelect.mockReturnValueOnce(buildChain([]));

    const result = await verifyMatchAssignment(1, 42);

    expect(result).toEqual({
      confirmed: false,
      sr1Open: true,
      sr2Open: true,
      sr1Referee: null,
      sr2Referee: null,
    });

    // No intent confirmation update when not confirmed
    expect(mockUpdate).toHaveBeenCalledTimes(1); // only match update

    vi.useRealTimers();
  });

  it("upserts referee and role when slot has spielleitung data, inserts new assignment", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-08-01T12:00:00Z"));

    // match lookup
    mockSelect.mockReturnValueOnce(buildChain([{ id: 1, apiMatchId: 100 }]));

    mockGetGameDetails.mockResolvedValueOnce({
      sr1: {
        offenAngeboten: false,
        spielleitung: {
          schiedsrichter: {
            schiedsrichterId: 500,
            personVO: { vorname: "Anna", nachname: "Schmidt" },
            lizenznummer: "LIC-001",
          },
          schirirolle: {
            schirirolleId: 10,
            schirirollename: "Schiedsrichter",
            schirirollekurzname: "SR",
          },
        },
      },
      sr2: { offenAngeboten: true },
    });

    // update matches
    mockUpdate.mockReturnValueOnce(buildUpdateChain());

    // Insert referee (upsert) -> returns id
    const refInsertChain = buildInsertChain([{ id: 77 }]);
    mockInsert.mockReturnValueOnce(refInsertChain);

    // Insert refereeRole (upsert) -> returns id
    const roleInsertChain = buildInsertChain([{ id: 33 }]);
    mockInsert.mockReturnValueOnce(roleInsertChain);

    // Check existing matchReferee for this slot: none
    mockSelect.mockReturnValueOnce(buildChain([]));

    // Insert new matchReferee assignment
    const mrInsertChain = buildInsertChain(undefined);
    mockInsert.mockReturnValueOnce(mrInsertChain);

    // assignment check for our referee (refereeId=42): not assigned
    mockSelect.mockReturnValueOnce(buildChain([]));

    // assigned refs query
    mockSelect.mockReturnValueOnce(buildChain([
      { slotNumber: 1, firstName: "Anna", lastName: "Schmidt" },
    ]));

    const result = await verifyMatchAssignment(1, 42);

    expect(result).toEqual({
      confirmed: false,
      sr1Open: false,
      sr2Open: true,
      sr1Referee: { firstName: "Anna", lastName: "Schmidt" },
      sr2Referee: null,
    });

    // referee upsert + role upsert + matchReferee insert = 3 inserts
    expect(mockInsert).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("updates existing assignment when referee or role changed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-08-01T12:00:00Z"));

    // match lookup
    mockSelect.mockReturnValueOnce(buildChain([{ id: 1, apiMatchId: 100 }]));

    mockGetGameDetails.mockResolvedValueOnce({
      sr1: {
        offenAngeboten: false,
        spielleitung: {
          schiedsrichter: {
            schiedsrichterId: 500,
            personVO: { vorname: "Anna", nachname: "Schmidt" },
            lizenznummer: "LIC-001",
          },
          schirirolle: {
            schirirolleId: 10,
            schirirollename: "Schiedsrichter",
            schirirollekurzname: "SR",
          },
        },
      },
      sr2: { offenAngeboten: false },
    });

    // update matches
    mockUpdate.mockReturnValueOnce(buildUpdateChain());

    // Insert referee (upsert) -> returns id 77
    mockInsert.mockReturnValueOnce(buildInsertChain([{ id: 77 }]));

    // Insert refereeRole (upsert) -> returns id 33
    mockInsert.mockReturnValueOnce(buildInsertChain([{ id: 33 }]));

    // Check existing matchReferee for slot 1: exists with different refereeId
    mockSelect.mockReturnValueOnce(buildChain([{ id: 99, refereeId: 50, roleId: 33 }]));

    // Update matchReferee (refereeId changed from 50 to 77)
    mockUpdate.mockReturnValueOnce(buildUpdateChain());

    // assignment check for our referee (refereeId=42): not assigned
    mockSelect.mockReturnValueOnce(buildChain([]));

    // assigned refs query
    mockSelect.mockReturnValueOnce(buildChain([
      { slotNumber: 1, firstName: "Anna", lastName: "Schmidt" },
    ]));

    const result = await verifyMatchAssignment(1, 42);

    expect(result).toEqual({
      confirmed: false,
      sr1Open: false,
      sr2Open: false,
      sr1Referee: { firstName: "Anna", lastName: "Schmidt" },
      sr2Referee: null,
    });

    // match update + matchReferee update = 2 updates
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("skips assignment update when existing referee and role match", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-08-01T12:00:00Z"));

    mockSelect.mockReturnValueOnce(buildChain([{ id: 1, apiMatchId: 100 }]));

    mockGetGameDetails.mockResolvedValueOnce({
      sr1: {
        offenAngeboten: false,
        spielleitung: {
          schiedsrichter: {
            schiedsrichterId: 500,
            personVO: { vorname: "Anna", nachname: "Schmidt" },
            lizenznummer: "LIC-001",
          },
          schirirolle: {
            schirirolleId: 10,
            schirirollename: "Schiedsrichter",
            schirirollekurzname: "SR",
          },
        },
      },
      sr2: { offenAngeboten: true },
    });

    // update matches
    mockUpdate.mockReturnValueOnce(buildUpdateChain());

    // referee upsert returns id 77
    mockInsert.mockReturnValueOnce(buildInsertChain([{ id: 77 }]));
    // role upsert returns id 33
    mockInsert.mockReturnValueOnce(buildInsertChain([{ id: 33 }]));

    // Existing matchReferee already matches (same refereeId and roleId)
    mockSelect.mockReturnValueOnce(buildChain([{ id: 99, refereeId: 77, roleId: 33 }]));

    // No insert or update for matchReferee needed

    // assignment check: not assigned
    mockSelect.mockReturnValueOnce(buildChain([]));

    // assigned refs
    mockSelect.mockReturnValueOnce(buildChain([
      { slotNumber: 1, firstName: "Anna", lastName: "Schmidt" },
    ]));

    const result = await verifyMatchAssignment(1, 42);

    expect(result).toEqual({
      confirmed: false,
      sr1Open: false,
      sr2Open: true,
      sr1Referee: { firstName: "Anna", lastName: "Schmidt" },
      sr2Referee: null,
    });

    // Only the match update, no matchReferee update
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    // Only referee + role upserts, no matchReferee insert
    expect(mockInsert).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("processes both sr1 and sr2 slots with spielleitung data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-08-01T12:00:00Z"));

    mockSelect.mockReturnValueOnce(buildChain([{ id: 1, apiMatchId: 100 }]));

    mockGetGameDetails.mockResolvedValueOnce({
      sr1: {
        offenAngeboten: false,
        spielleitung: {
          schiedsrichter: {
            schiedsrichterId: 500,
            personVO: { vorname: "Anna", nachname: "Schmidt" },
            lizenznummer: "LIC-001",
          },
          schirirolle: {
            schirirolleId: 10,
            schirirollename: "Schiedsrichter",
            schirirollekurzname: "SR",
          },
        },
      },
      sr2: {
        offenAngeboten: false,
        spielleitung: {
          schiedsrichter: {
            schiedsrichterId: 600,
            personVO: { vorname: "Tom", nachname: "Weber" },
            lizenznummer: "LIC-002",
          },
          schirirolle: {
            schirirolleId: 11,
            schirirollename: "Zeitnehmer",
            schirirollekurzname: "ZN",
          },
        },
      },
    });

    // update matches
    mockUpdate.mockReturnValueOnce(buildUpdateChain());

    // SR1: referee upsert, role upsert, check existing, insert new
    mockInsert.mockReturnValueOnce(buildInsertChain([{ id: 77 }]));
    mockInsert.mockReturnValueOnce(buildInsertChain([{ id: 33 }]));
    mockSelect.mockReturnValueOnce(buildChain([])); // no existing for slot 1
    mockInsert.mockReturnValueOnce(buildInsertChain(undefined));

    // SR2: referee upsert, role upsert, check existing, insert new
    mockInsert.mockReturnValueOnce(buildInsertChain([{ id: 78 }]));
    mockInsert.mockReturnValueOnce(buildInsertChain([{ id: 34 }]));
    mockSelect.mockReturnValueOnce(buildChain([])); // no existing for slot 2
    mockInsert.mockReturnValueOnce(buildInsertChain(undefined));

    // assignment check for referee 42: found (assigned)
    mockSelect.mockReturnValueOnce(buildChain([{ id: 5 }]));

    // update intent confirmation
    mockUpdate.mockReturnValueOnce(buildUpdateChain());

    // assigned refs
    mockSelect.mockReturnValueOnce(buildChain([
      { slotNumber: 1, firstName: "Anna", lastName: "Schmidt" },
      { slotNumber: 2, firstName: "Tom", lastName: "Weber" },
    ]));

    const result = await verifyMatchAssignment(1, 42);

    expect(result).toEqual({
      confirmed: true,
      sr1Open: false,
      sr2Open: false,
      sr1Referee: { firstName: "Anna", lastName: "Schmidt" },
      sr2Referee: { firstName: "Tom", lastName: "Weber" },
    });

    // 2 referee upserts + 2 role upserts + 2 matchReferee inserts = 6
    expect(mockInsert).toHaveBeenCalledTimes(6);

    vi.useRealTimers();
  });

  it("defaults sr1Open/sr2Open to false when offenAngeboten is undefined", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-08-01T12:00:00Z"));

    mockSelect.mockReturnValueOnce(buildChain([{ id: 1, apiMatchId: 100 }]));

    // SDK returns details with no offenAngeboten fields
    mockGetGameDetails.mockResolvedValueOnce({
      sr1: {},
      sr2: {},
    });

    mockUpdate.mockReturnValueOnce(buildUpdateChain());

    // assignment check: not assigned
    mockSelect.mockReturnValueOnce(buildChain([]));

    // assigned refs: none
    mockSelect.mockReturnValueOnce(buildChain([]));

    const result = await verifyMatchAssignment(1, 42);

    expect(result).toEqual({
      confirmed: false,
      sr1Open: false,
      sr2Open: false,
      sr1Referee: null,
      sr2Referee: null,
    });

    vi.useRealTimers();
  });
});

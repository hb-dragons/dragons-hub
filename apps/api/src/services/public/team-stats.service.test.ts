import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  // Chainable query builder returned by db.select()
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  innerJoin: vi.fn(),
  orderBy: vi.fn(),
}));

// db.select() → { from() → { where() → { limit() } } }
// The actual query chains vary per query in the service, so we make each
// intermediate step return the same mock object to keep it simple.
const chainable = {
  from: mocks.from,
  where: mocks.where,
  limit: mocks.limit,
  innerJoin: mocks.innerJoin,
  orderBy: mocks.orderBy,
};

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => {
      mocks.select(...args);
      return chainable;
    },
  },
}));

vi.mock("@dragons/db/schema", () => ({
  teams: { id: "teams.id", apiTeamPermanentId: "teams.api_team_permanent_id" },
  standings: {
    teamApiId: "standings.team_api_id",
    leagueId: "standings.league_id",
  },
  leagues: { id: "leagues.id", name: "leagues.name" },
  matches: {
    homeTeamApiId: "matches.home_team_api_id",
    guestTeamApiId: "matches.guest_team_api_id",
    homeScore: "matches.home_score",
    guestScore: "matches.guest_score",
    kickoffDate: "matches.kickoff_date",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  desc: vi.fn(),
  isNotNull: vi.fn(),
}));

// --- Imports (after mocks) ---

import { getTeamStats } from "./team-stats.service";

// --- Helpers ---

function setupTeamQuery(result: { apiTeamPermanentId: number }[] | []) {
  // 1st select: teams lookup → select().from().where().limit()
  chainable.from.mockReturnValueOnce(chainable);
  chainable.where.mockReturnValueOnce(chainable);
  chainable.limit.mockResolvedValueOnce(result);
}

function setupStandingQuery(result: unknown[]) {
  // 2nd select: standings + innerJoin → select().from().innerJoin().where().limit()
  chainable.from.mockReturnValueOnce(chainable);
  chainable.innerJoin.mockReturnValueOnce(chainable);
  chainable.where.mockReturnValueOnce(chainable);
  chainable.limit.mockResolvedValueOnce(result);
}

function setupMatchQuery(result: unknown[]) {
  // 3rd select: matches → select().from().where().orderBy().limit()
  chainable.from.mockReturnValueOnce(chainable);
  chainable.where.mockReturnValueOnce(chainable);
  chainable.orderBy.mockReturnValueOnce(chainable);
  chainable.limit.mockResolvedValueOnce(result);
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  // Reset all chainable methods to return chainable by default so unexpected
  // calls don't throw.
  Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));
});

describe("getTeamStats", () => {
  it("returns null when team is not found", async () => {
    setupTeamQuery([]);

    const result = await getTeamStats(999);

    expect(result).toBeNull();
  });

  it("returns stats with standing and form when all data present", async () => {
    setupTeamQuery([{ apiTeamPermanentId: 42 }]);
    setupStandingQuery([
      {
        position: 2,
        played: 8,
        won: 6,
        lost: 2,
        pointsFor: 700,
        pointsAgainst: 600,
        pointsDiff: 100,
        leagueName: "Kreisliga A",
      },
    ]);
    setupMatchQuery([
      { id: 10, homeTeamApiId: 42, guestTeamApiId: 99, homeScore: 80, guestScore: 70 },
      { id: 9, homeTeamApiId: 55, guestTeamApiId: 42, homeScore: 65, guestScore: 72 },
      { id: 8, homeTeamApiId: 42, guestTeamApiId: 77, homeScore: 60, guestScore: 75 },
    ]);

    const result = await getTeamStats(1);

    expect(result).toEqual({
      teamId: 1,
      leagueName: "Kreisliga A",
      position: 2,
      played: 8,
      wins: 6,
      losses: 2,
      pointsFor: 700,
      pointsAgainst: 600,
      pointsDiff: 100,
      form: [
        { result: "W", matchId: 10 }, // home, 80 > 70
        { result: "W", matchId: 9 },  // guest, 72 > 65
        { result: "L", matchId: 8 },  // home, 60 < 75
      ],
    });
  });

  it("returns stats with null position and zero counters when no standing exists", async () => {
    setupTeamQuery([{ apiTeamPermanentId: 42 }]);
    setupStandingQuery([]);
    setupMatchQuery([]);

    const result = await getTeamStats(5);

    expect(result).toEqual({
      teamId: 5,
      leagueName: "",
      position: null,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointsDiff: 0,
      form: [],
    });
  });

  it("marks guest-side win correctly", async () => {
    setupTeamQuery([{ apiTeamPermanentId: 7 }]);
    setupStandingQuery([]);
    setupMatchQuery([
      { id: 1, homeTeamApiId: 50, guestTeamApiId: 7, homeScore: 55, guestScore: 80 },
    ]);

    const result = await getTeamStats(2);

    expect(result?.form).toEqual([{ result: "W", matchId: 1 }]);
  });

  it("marks guest-side loss correctly", async () => {
    setupTeamQuery([{ apiTeamPermanentId: 7 }]);
    setupStandingQuery([]);
    setupMatchQuery([
      { id: 2, homeTeamApiId: 50, guestTeamApiId: 7, homeScore: 90, guestScore: 70 },
    ]);

    const result = await getTeamStats(3);

    expect(result?.form).toEqual([{ result: "L", matchId: 2 }]);
  });

  it("marks home-side loss correctly", async () => {
    setupTeamQuery([{ apiTeamPermanentId: 7 }]);
    setupStandingQuery([]);
    setupMatchQuery([
      { id: 3, homeTeamApiId: 7, guestTeamApiId: 50, homeScore: 60, guestScore: 88 },
    ]);

    const result = await getTeamStats(4);

    expect(result?.form).toEqual([{ result: "L", matchId: 3 }]);
  });
});

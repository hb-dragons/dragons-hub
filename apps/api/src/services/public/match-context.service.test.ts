import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
}));

const chainable = {
  from: mocks.from,
  where: mocks.where,
  limit: mocks.limit,
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
  matches: {
    id: "matches.id",
    homeTeamApiId: "matches.home_team_api_id",
    guestTeamApiId: "matches.guest_team_api_id",
    homeScore: "matches.home_score",
    guestScore: "matches.guest_score",
    kickoffDate: "matches.kickoff_date",
  },
  teams: {
    apiTeamPermanentId: "teams.api_team_permanent_id",
    isOwnClub: "teams.is_own_club",
    name: "teams.name",
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

import { getMatchContext } from "./match-context.service";

// --- Helpers ---

/**
 * Query 1: match lookup — select().from().where().limit()
 * Terminal: limit
 */
function setupMatchLookup(result: unknown[]) {
  chainable.from.mockReturnValueOnce(chainable);
  chainable.where.mockReturnValueOnce(chainable);
  chainable.limit.mockResolvedValueOnce(result);
}

/**
 * Query 2: h2h matches — select().from().where().orderBy()
 * Terminal: orderBy (no .limit() in service code)
 */
function setupH2HQuery(result: unknown[]) {
  chainable.from.mockReturnValueOnce(chainable);
  chainable.where.mockReturnValueOnce(chainable);
  chainable.orderBy.mockResolvedValueOnce(result);
}

/**
 * Query 3/4: team row lookup — select().from().where().limit()
 * Terminal: limit
 */
function setupTeamRow(result: unknown[]) {
  chainable.from.mockReturnValueOnce(chainable);
  chainable.where.mockReturnValueOnce(chainable);
  chainable.limit.mockResolvedValueOnce(result);
}

/**
 * Query 5/6: getTeamForm — select().from().where().orderBy().limit()
 * Terminal: limit (orderBy is intermediate)
 */
function setupFormQuery(result: unknown[]) {
  chainable.from.mockReturnValueOnce(chainable);
  chainable.where.mockReturnValueOnce(chainable);
  chainable.orderBy.mockReturnValueOnce(chainable);
  chainable.limit.mockResolvedValueOnce(result);
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));
});

describe("getMatchContext", () => {
  it("returns null when match not found", async () => {
    setupMatchLookup([]);

    const result = await getMatchContext(999);

    expect(result).toBeNull();
  });

  it("returns full context with H2H and form", async () => {
    // Query 1: match lookup
    setupMatchLookup([{ homeTeamApiId: 10, guestTeamApiId: 20 }]);

    // Query 2: h2h matches — 3 matches, our team (home=isOwnClub) wins 2, loses 1
    setupH2HQuery([
      { id: 101, kickoffDate: "2026-03-01", homeTeamApiId: 10, guestTeamApiId: 20, homeScore: 80, guestScore: 70 },
      { id: 102, kickoffDate: "2026-02-01", homeTeamApiId: 20, guestTeamApiId: 10, homeScore: 75, guestScore: 85 },
      { id: 103, kickoffDate: "2026-01-01", homeTeamApiId: 10, guestTeamApiId: 20, homeScore: 60, guestScore: 70 },
    ]);

    // Query 3: homeTeam row — own club
    setupTeamRow([{ isOwnClub: true, name: "Dragons" }]);

    // Query 4: guestTeam row
    setupTeamRow([{ isOwnClub: false, name: "Opponents" }]);

    // Query 5: homeForm
    setupFormQuery([
      { id: 201, homeTeamApiId: 10, homeScore: 90, guestScore: 80 },
    ]);

    // Query 6: guestForm
    setupFormQuery([
      { id: 301, homeTeamApiId: 20, homeScore: 50, guestScore: 60 },
    ]);

    const result = await getMatchContext(1);

    expect(result).not.toBeNull();
    // H2H: ourTeam=10 (home is own club)
    // Match 101: home=10, ourScore=80 vs 70 → W
    // Match 102: home=20, ourScore=85(guest) vs 75(home) → W
    // Match 103: home=10, ourScore=60 vs 70 → L
    expect(result!.headToHead.wins).toBe(2);
    expect(result!.headToHead.losses).toBe(1);
    expect(result!.headToHead.pointsFor).toBe(80 + 85 + 60);
    expect(result!.headToHead.pointsAgainst).toBe(70 + 75 + 70);
    expect(result!.headToHead.previousMeetings).toHaveLength(3);

    // Form
    expect(result!.homeForm).toEqual([{ result: "W", matchId: 201 }]);
    expect(result!.guestForm).toEqual([{ result: "L", matchId: 301 }]);
  });

  it("caps previousMeetings at 5", async () => {
    setupMatchLookup([{ homeTeamApiId: 10, guestTeamApiId: 20 }]);

    // 7 h2h matches
    const h2hData = Array.from({ length: 7 }, (_, i) => ({
      id: 100 + i,
      kickoffDate: `2026-0${i + 1}-01`,
      homeTeamApiId: 10,
      guestTeamApiId: 20,
      homeScore: 80,
      guestScore: 70,
    }));
    setupH2HQuery(h2hData);

    setupTeamRow([{ isOwnClub: true, name: "Dragons" }]);
    setupTeamRow([{ isOwnClub: false, name: "Opponents" }]);
    setupFormQuery([]);
    setupFormQuery([]);

    const result = await getMatchContext(1);

    expect(result!.headToHead.previousMeetings).toHaveLength(5);
    // All 7 should still count for stats
    expect(result!.headToHead.wins).toBe(7);
    expect(result!.headToHead.losses).toBe(0);
  });

  it("handles guest being own club", async () => {
    setupMatchLookup([{ homeTeamApiId: 10, guestTeamApiId: 20 }]);

    // h2h: home=10 wins (but our team is guest=20, so we lose)
    setupH2HQuery([
      { id: 101, kickoffDate: "2026-03-01", homeTeamApiId: 10, guestTeamApiId: 20, homeScore: 80, guestScore: 70 },
    ]);

    // homeTeamRow is NOT own club
    setupTeamRow([{ isOwnClub: false, name: "Rivals" }]);
    // guestTeamRow IS own club
    setupTeamRow([{ isOwnClub: true, name: "Dragons" }]);

    setupFormQuery([]);
    setupFormQuery([]);

    const result = await getMatchContext(1);

    // ourTeamApiId = 20 (guest is own club)
    // Match 101: home=10, so ourScore = guestScore=70, theirScore = homeScore=80 → L
    expect(result!.headToHead.wins).toBe(0);
    expect(result!.headToHead.losses).toBe(1);
    expect(result!.headToHead.pointsFor).toBe(70);
    expect(result!.headToHead.pointsAgainst).toBe(80);
    expect(result!.headToHead.previousMeetings[0]!.isWin).toBe(false);
    expect(result!.headToHead.previousMeetings[0]!.homeIsOwnClub).toBe(false);
  });

  it("resolves team names correctly when home/guest are swapped in previous meetings", async () => {
    // Current match: Dragons(10) home vs Rivals(20) guest
    setupMatchLookup([{ homeTeamApiId: 10, guestTeamApiId: 20 }]);

    setupH2HQuery([
      // Same order as current match
      { id: 101, kickoffDate: "2026-03-01", homeTeamApiId: 10, guestTeamApiId: 20, homeScore: 80, guestScore: 70 },
      // Swapped: Rivals at home, Dragons as guest
      { id: 102, kickoffDate: "2026-02-01", homeTeamApiId: 20, guestTeamApiId: 10, homeScore: 75, guestScore: 85 },
    ]);

    setupTeamRow([{ isOwnClub: true, name: "Dragons" }]);
    setupTeamRow([{ isOwnClub: false, name: "Rivals" }]);
    setupFormQuery([]);
    setupFormQuery([]);

    const result = await getMatchContext(1);
    const meetings = result!.headToHead.previousMeetings;

    // Match 101: same order — home=Dragons, guest=Rivals
    expect(meetings[0]!.homeTeamName).toBe("Dragons");
    expect(meetings[0]!.guestTeamName).toBe("Rivals");
    expect(meetings[0]!.homeIsOwnClub).toBe(true);

    // Match 102: swapped — home=Rivals, guest=Dragons
    expect(meetings[1]!.homeTeamName).toBe("Rivals");
    expect(meetings[1]!.guestTeamName).toBe("Dragons");
    expect(meetings[1]!.homeIsOwnClub).toBe(false);
  });
});

describe("getTeamForm (via getMatchContext)", () => {
  function setupForFormTest(formData: unknown[]) {
    setupMatchLookup([{ homeTeamApiId: 10, guestTeamApiId: 20 }]);
    setupH2HQuery([]);
    setupTeamRow([{ isOwnClub: true, name: "Dragons" }]);
    setupTeamRow([{ isOwnClub: false, name: "Opponents" }]);
    // homeForm is the one we're testing
    setupFormQuery(formData);
    // guestForm
    setupFormQuery([]);
  }

  it("computes W correctly for home team", async () => {
    setupForFormTest([
      { id: 1, homeTeamApiId: 10, homeScore: 90, guestScore: 70 },
    ]);

    const result = await getMatchContext(1);

    expect(result!.homeForm).toEqual([{ result: "W", matchId: 1 }]);
  });

  it("computes L correctly for guest team perspective", async () => {
    // Team 10 is guest and loses
    setupForFormTest([
      { id: 2, homeTeamApiId: 50, homeScore: 90, guestScore: 70 },
    ]);

    const result = await getMatchContext(1);

    // homeForm is for teamApiId=10, which is guest here: ourScore=70, theirScore=90 → L
    expect(result!.homeForm).toEqual([{ result: "L", matchId: 2 }]);
  });
});

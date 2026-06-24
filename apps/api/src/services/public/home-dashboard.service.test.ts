import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getOwnClubMatches: vi.fn(),
  dbSelect: vi.fn(),
  withActiveSeason: vi.fn(),
}));

vi.mock("../admin/match-query.service", () => ({
  getOwnClubMatches: mocks.getOwnClubMatches,
}));

vi.mock("../season-scope", () => ({
  withActiveSeason: mocks.withActiveSeason,
}));

// Mock drizzle db with chainable query builder
let _teamCountResult: unknown[] = [{ count: 3 }];
let _statsResult: unknown[] = [{ totalWins: 6, totalLosses: 4 }];
let _selectCallCount = 0;

vi.mock("../../config/database", () => ({
  getDb: () => ({
    select: vi.fn(() => {
      _selectCallCount++;
      // First call: team count query (outside withActiveSeason)
      // Second call: standings aggregate (inside withActiveSeason)
      const result = _selectCallCount % 2 === 1 ? _teamCountResult : _statsResult;
      const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => {
          resolve(result);
          return Promise.resolve(result);
        },
      };
      return chain;
    }),
  }),
}));

vi.mock("@dragons/db/schema", () => ({
  standings: { won: "won", lost: "lost", teamApiId: "team_api_id", leagueId: "league_id" },
  teams: { isOwnClub: "is_own_club", apiTeamPermanentId: "api_team_permanent_id" },
  leagues: { id: "leagues.id", seasonRefId: "leagues.season_ref_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray) => strings[0]),
}));

// --- Imports (after mocks) ---

import { getHomeDashboard } from "./home-dashboard.service";

// --- Helpers ---

const ACTIVE_SEASON_ID = 5;

function setupWithActiveSeason() {
  mocks.withActiveSeason.mockImplementation(
    async (fn: (id: number) => Promise<unknown>, _empty: unknown) => fn(ACTIVE_SEASON_ID),
  );
}

function setupWithActiveSeasonEmpty(empty: unknown) {
  mocks.withActiveSeason.mockImplementation(
    async (_fn: unknown, emptyVal: unknown) => {
      void empty;
      return emptyVal;
    },
  );
}

function makeMatch(id: number) {
  return {
    id,
    homeTeamName: `Home ${id}`,
    guestTeamName: `Guest ${id}`,
    kickoffDate: "2026-05-01",
    kickoffTime: "18:00",
  };
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  _teamCountResult = [{ count: 3 }];
  _statsResult = [{ totalWins: 6, totalLosses: 4 }];
  _selectCallCount = 0;
});

describe("getHomeDashboard", () => {
  it("returns correct shape with all fields", async () => {
    const nextMatch = makeMatch(10);
    const recentMatches = [makeMatch(9), makeMatch(8)];
    const upcomingMatches = [makeMatch(10), makeMatch(11), makeMatch(12)];

    setupWithActiveSeason();
    mocks.getOwnClubMatches
      .mockResolvedValueOnce({ items: [nextMatch], total: 1 })
      .mockResolvedValueOnce({ items: recentMatches, total: 2 })
      .mockResolvedValueOnce({ items: upcomingMatches, total: 3 });

    const result = await getHomeDashboard();

    expect(result).toMatchObject({
      nextGame: nextMatch,
      recentResults: recentMatches,
      upcomingGames: upcomingMatches,
      clubStats: {
        teamCount: 3,
        totalWins: 6,
        totalLosses: 4,
        winPercentage: 60,
      },
    });
  });

  it("returns empty dashboard when there is no active season", async () => {
    setupWithActiveSeasonEmpty(null);

    const result = await getHomeDashboard();

    expect(result.nextGame).toBeNull();
    expect(result.recentResults).toEqual([]);
    expect(result.upcomingGames).toEqual([]);
    expect(result.clubStats.totalWins).toBe(0);
    expect(result.clubStats.totalLosses).toBe(0);
    // teamCount still comes from real query even with no season
    expect(result.clubStats.teamCount).toBe(3);
  });

  it("sets nextGame to null when no upcoming games", async () => {
    setupWithActiveSeason();
    mocks.getOwnClubMatches
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 });

    const result = await getHomeDashboard();

    expect(result.nextGame).toBeNull();
  });

  it("sets winPercentage to 0 when no games played", async () => {
    _statsResult = [{ totalWins: 0, totalLosses: 0 }];

    setupWithActiveSeason();
    mocks.getOwnClubMatches
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 });

    const result = await getHomeDashboard();

    expect(result.clubStats.winPercentage).toBe(0);
  });

  it("computes winPercentage correctly when all wins", async () => {
    _statsResult = [{ totalWins: 10, totalLosses: 0 }];

    setupWithActiveSeason();
    mocks.getOwnClubMatches
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 });

    const result = await getHomeDashboard();

    expect(result.clubStats.winPercentage).toBe(100);
  });

  it("rounds winPercentage to nearest integer", async () => {
    _statsResult = [{ totalWins: 1, totalLosses: 2 }];

    setupWithActiveSeason();
    mocks.getOwnClubMatches
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 });

    const result = await getHomeDashboard();

    // 1/3 = 33.33... → rounds to 33
    expect(result.clubStats.winPercentage).toBe(33);
  });

  it("calls getOwnClubMatches with correct params for nextGame", async () => {
    setupWithActiveSeason();
    mocks.getOwnClubMatches
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 });

    await getHomeDashboard();

    const today = new Date().toISOString().split("T")[0]!;

    // First call: nextGame
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 1,
        offset: 0,
        dateFrom: today,
        hasScore: false,
        sort: "asc",
        excludeInactive: true,
        seasonId: ACTIVE_SEASON_ID,
      }),
    );
  });

  it("calls getOwnClubMatches with correct params for recentResults", async () => {
    setupWithActiveSeason();
    mocks.getOwnClubMatches
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 });

    await getHomeDashboard();

    const today = new Date().toISOString().split("T")[0]!;

    // Second call: recentResults
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 5,
        offset: 0,
        dateTo: today,
        hasScore: true,
        sort: "desc",
        excludeInactive: true,
        seasonId: ACTIVE_SEASON_ID,
      }),
    );
  });

  it("calls getOwnClubMatches with correct params for upcomingGames", async () => {
    setupWithActiveSeason();
    mocks.getOwnClubMatches
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 });

    await getHomeDashboard();

    const today = new Date().toISOString().split("T")[0]!;

    // Third call: upcomingGames
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 3,
        offset: 0,
        dateFrom: today,
        hasScore: false,
        sort: "asc",
        excludeInactive: true,
        seasonId: ACTIVE_SEASON_ID,
      }),
    );
  });

  it("uses 0 as fallback when stats row is missing", async () => {
    _statsResult = [];
    _teamCountResult = [];

    setupWithActiveSeason();
    mocks.getOwnClubMatches
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 });

    const result = await getHomeDashboard();

    expect(result.clubStats.totalWins).toBe(0);
    expect(result.clubStats.totalLosses).toBe(0);
    expect(result.clubStats.winPercentage).toBe(0);
  });
});

import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

// --- Mocks (hoisted before imports) ---
//
// Deliberately NOT mocking drizzle-orm or @dragons/db/schema. The club-stats
// half of this service is two aggregates over `teams` joined to `standings`,
// both filtered on `is_own_club = true`; the old suite replaced the query
// builder with a counter that returned a canned array on every odd call, so
// flipping that filter to `false` — which would publish the opposition's record
// on the public home page — left all nine tests green.
//
// `getOwnClubMatches` stays stubbed: it is a separate service with its own
// PGlite integration suite (match-query.service.integration.test.ts), and what
// matters here is the exact request this service makes of it.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({ getOwnClubMatches: vi.fn() }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../admin/match-query.service", () => ({
  getOwnClubMatches: mocks.getOwnClubMatches,
}));

// --- Imports (after mocks) ---

import { getHomeDashboard } from "./home-dashboard.service";
import { leagues, standings, teams } from "@dragons/db/schema";

let ctx: TestDbContext;
let leagueId: number;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  const [league] = await ctx.db
    .insert(leagues)
    .values({
      apiLigaId: 500,
      ligaNr: 500,
      name: "Kreisliga A",
      seasonId: 2026,
      seasonName: "2025/26",
    })
    .returning({ id: leagues.id });
  leagueId = league!.id;
  mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0 });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function seedTeam(
  apiTeamPermanentId: number,
  name: string,
  isOwnClub: boolean,
): Promise<void> {
  await ctx.db.insert(teams).values({
    apiTeamPermanentId,
    seasonTeamId: apiTeamPermanentId * 10,
    teamCompetitionId: apiTeamPermanentId,
    name,
    clubId: isOwnClub ? 1 : 2,
    isOwnClub,
  });
}

async function seedStanding(teamApiId: number, won: number, lost: number): Promise<void> {
  await ctx.db.insert(standings).values({
    leagueId,
    teamApiId,
    position: 1,
    played: won + lost,
    won,
    lost,
  });
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

describe("getHomeDashboard — match sections", () => {
  it("returns nextGame, recentResults and upcomingGames from getOwnClubMatches", async () => {
    const nextMatch = makeMatch(10);
    const recent = [makeMatch(9), makeMatch(8)];
    const upcoming = [makeMatch(10), makeMatch(11), makeMatch(12)];
    mocks.getOwnClubMatches
      .mockResolvedValueOnce({ items: [nextMatch], total: 1 })
      .mockResolvedValueOnce({ items: recent, total: 2 })
      .mockResolvedValueOnce({ items: upcoming, total: 3 });

    const result = await getHomeDashboard();

    expect(result.nextGame).toEqual(nextMatch);
    expect(result.recentResults).toEqual(recent);
    expect(result.upcomingGames).toEqual(upcoming);
  });

  it("sets nextGame to null when there are no upcoming games", async () => {
    expect((await getHomeDashboard()).nextGame).toBeNull();
  });

  it("asks for the next game, the last five results and three upcoming games", async () => {
    await getHomeDashboard();

    const today = new Date().toISOString().split("T")[0]!;
    expect(mocks.getOwnClubMatches.mock.calls.map((c) => c[0])).toEqual([
      { limit: 1, offset: 0, dateFrom: today, hasScore: false, sort: "asc", excludeInactive: true },
      { limit: 5, offset: 0, dateTo: today, hasScore: true, sort: "desc", excludeInactive: true },
      { limit: 3, offset: 0, dateFrom: today, hasScore: false, sort: "asc", excludeInactive: true },
    ]);
  });
});

describe("getHomeDashboard — club stats", () => {
  it("counts only own-club teams and their standings", async () => {
    await seedTeam(10, "Dragons 1", true);
    await seedTeam(20, "Dragons 2", true);
    await seedTeam(99, "Rivals", false);
    await seedStanding(10, 4, 1);
    await seedStanding(20, 2, 3);
    await seedStanding(99, 50, 0);

    const result = await getHomeDashboard();

    // Inverting `is_own_club` would publish the opposition's 50-0 record here.
    expect(result.clubStats).toEqual({
      teamCount: 2,
      totalWins: 6,
      totalLosses: 4,
      winPercentage: 60,
    });
  });

  it("returns zeroes when the club has no teams at all", async () => {
    await seedTeam(99, "Rivals", false);
    await seedStanding(99, 7, 3);

    expect((await getHomeDashboard()).clubStats).toEqual({
      teamCount: 0,
      totalWins: 0,
      totalLosses: 0,
      winPercentage: 0,
    });
  });

  it("counts an own-club team that has no standing row yet", async () => {
    await seedTeam(10, "Dragons 1", true);

    expect((await getHomeDashboard()).clubStats).toEqual({
      teamCount: 1,
      totalWins: 0,
      totalLosses: 0,
      winPercentage: 0,
    });
  });

  it("reports 0% rather than dividing by zero when nothing has been played", async () => {
    await seedTeam(10, "Dragons 1", true);
    await seedStanding(10, 0, 0);

    expect((await getHomeDashboard()).clubStats.winPercentage).toBe(0);
  });

  it("reports 100% when every game was won", async () => {
    await seedTeam(10, "Dragons 1", true);
    await seedStanding(10, 10, 0);

    expect((await getHomeDashboard()).clubStats.winPercentage).toBe(100);
  });

  it("rounds winPercentage to the nearest integer", async () => {
    await seedTeam(10, "Dragons 1", true);
    await seedStanding(10, 1, 2);

    // 1/3 = 33.33… → 33
    expect((await getHomeDashboard()).clubStats.winPercentage).toBe(33);
  });

  it("returns numbers, not the strings Postgres sums to by default", async () => {
    await seedTeam(10, "Dragons 1", true);
    await seedStanding(10, 3, 1);

    const { clubStats } = await getHomeDashboard();

    expect(typeof clubStats.teamCount).toBe("number");
    expect(typeof clubStats.totalWins).toBe("number");
    expect(typeof clubStats.totalLosses).toBe("number");
  });
});

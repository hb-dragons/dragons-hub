import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

// --- Mocks (hoisted before imports) ---
//
// Deliberately NOT mocking drizzle-orm or @dragons/db/schema. The form query is
// `WHERE (home = team OR guest = team) AND home_score IS NOT NULL AND
// guest_score IS NOT NULL ORDER BY kickoff_date DESC LIMIT 5`; under the old
// identity stubs the chain simply returned whatever array the test had queued,
// so swapping that `or` for an `and` (which empties the form for every team)
// left all six tests green, and the ordering and the LIMIT 5 were never
// exercised at all.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

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

// --- Imports (after mocks) ---

import { getTeamStats } from "./team-stats.service";
import { invalidateActiveSeasonCache } from "../admin/season.service";
import { leagues, matches, seasons, standings, teams } from "@dragons/db/schema";

let ctx: TestDbContext;
let activeSeasonId: number;
/**
 * League every seeded match belongs to unless a test says otherwise. The form
 * query joins `matches -> leagues` to reach the season, so a match with a null
 * `league_id` has no season and is deliberately not part of a season-scoped
 * form — see the "ignores a match that belongs to no league" case below.
 */
let defaultLeagueId: number;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  const [season] = await ctx.db
    .insert(seasons)
    .values({ name: "2025/26", status: "active" })
    .returning({ id: seasons.id });
  activeSeasonId = season!.id;
  // Season ids change every test and the active-season id is cached for 60s.
  invalidateActiveSeasonCache();
  defaultLeagueId = await seedLeague(900, "Default League");
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

/** Insert a team and return its internal (serial) id. */
async function seedTeam(apiTeamPermanentId: number, name: string): Promise<number> {
  const [row] = await ctx.db
    .insert(teams)
    .values({
      apiTeamPermanentId,
      seasonTeamId: apiTeamPermanentId * 10,
      teamCompetitionId: apiTeamPermanentId,
      name,
      clubId: 1,
    })
    .returning({ id: teams.id });
  return row!.id;
}

async function seedLeague(apiLigaId: number, name: string, seasonRefId?: number): Promise<number> {
  const [row] = await ctx.db
    .insert(leagues)
    .values({
      apiLigaId,
      ligaNr: apiLigaId,
      name,
      seasonId: 2026,
      seasonName: "2025/26",
      seasonRefId: seasonRefId ?? activeSeasonId,
    })
    .returning({ id: leagues.id });
  return row!.id;
}

interface MatchSpec {
  apiMatchId: number;
  home: number;
  guest: number;
  kickoffDate: string;
  homeScore?: number | null;
  guestScore?: number | null;
  /** `null` puts the match in no league at all, and so in no season. */
  leagueId?: number | null;
}

async function seedMatch(spec: MatchSpec): Promise<number> {
  const [row] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: spec.apiMatchId,
      matchNo: spec.apiMatchId,
      matchDay: 1,
      kickoffDate: spec.kickoffDate,
      kickoffTime: "18:00:00",
      homeTeamApiId: spec.home,
      guestTeamApiId: spec.guest,
      homeScore: spec.homeScore ?? null,
      guestScore: spec.guestScore ?? null,
      leagueId: spec.leagueId === undefined ? defaultLeagueId : spec.leagueId,
    })
    .returning({ id: matches.id });
  return row!.id;
}

describe("getTeamStats — team lookup", () => {
  it("returns null when the team is not found", async () => {
    expect(await getTeamStats(999)).toBeNull();
  });

  it("resolves the team by internal id, not by api id", async () => {
    // internal id 1, api id 42 — a lookup on the wrong column would miss.
    const teamId = await seedTeam(42, "Dragons");

    const result = await getTeamStats(teamId);

    expect(result).not.toBeNull();
    expect(result!.teamId).toBe(teamId);
    expect(await getTeamStats(42)).toBeNull();
  });
});

describe("getTeamStats — standing", () => {
  it("returns the standing joined with its league name", async () => {
    const teamId = await seedTeam(42, "Dragons");
    const leagueId = await seedLeague(500, "Kreisliga A");
    await ctx.db.insert(standings).values({
      leagueId,
      teamApiId: 42,
      position: 2,
      played: 8,
      won: 6,
      lost: 2,
      pointsFor: 700,
      pointsAgainst: 600,
      pointsDiff: 100,
    });

    expect(await getTeamStats(teamId)).toEqual({
      teamId,
      leagueName: "Kreisliga A",
      position: 2,
      played: 8,
      wins: 6,
      losses: 2,
      pointsFor: 700,
      pointsAgainst: 600,
      pointsDiff: 100,
      form: [],
    });
  });

  it("does not pick up another team's standing", async () => {
    const teamId = await seedTeam(42, "Dragons");
    await seedTeam(99, "Rivals");
    const leagueId = await seedLeague(500, "Kreisliga A");
    await ctx.db
      .insert(standings)
      .values({ leagueId, teamApiId: 99, position: 1, played: 8, won: 8 });

    const result = await getTeamStats(teamId);

    expect(result).toMatchObject({ leagueName: "", position: null, played: 0, wins: 0 });
  });

  it("falls back to zeroes and a null position when no standing exists", async () => {
    const teamId = await seedTeam(42, "Dragons");

    expect(await getTeamStats(teamId)).toEqual({
      teamId,
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
});

describe("getTeamStats — form", () => {
  it("counts both home and away matches", async () => {
    const teamId = await seedTeam(42, "Dragons");
    await seedTeam(99, "Rivals");
    const home = await seedMatch({
      apiMatchId: 1,
      home: 42,
      guest: 99,
      kickoffDate: "2026-03-01",
      homeScore: 80,
      guestScore: 70,
    });
    const away = await seedMatch({
      apiMatchId: 2,
      home: 99,
      guest: 42,
      kickoffDate: "2026-02-01",
      homeScore: 65,
      guestScore: 72,
    });

    const result = await getTeamStats(teamId);

    // An `and` where the service means `or` would demand the team be *both*
    // sides of the same match, producing an empty form for everyone.
    expect(result!.form).toEqual([
      { result: "W", matchId: home },
      { result: "W", matchId: away },
    ]);
  });

  it("marks a home loss and an away loss as L", async () => {
    const teamId = await seedTeam(42, "Dragons");
    await seedTeam(99, "Rivals");
    const homeLoss = await seedMatch({
      apiMatchId: 1,
      home: 42,
      guest: 99,
      kickoffDate: "2026-03-01",
      homeScore: 60,
      guestScore: 88,
    });
    const awayLoss = await seedMatch({
      apiMatchId: 2,
      home: 99,
      guest: 42,
      kickoffDate: "2026-02-01",
      homeScore: 90,
      guestScore: 70,
    });

    const result = await getTeamStats(teamId);

    expect(result!.form).toEqual([
      { result: "L", matchId: homeLoss },
      { result: "L", matchId: awayLoss },
    ]);
  });

  it("excludes matches belonging to other teams", async () => {
    const teamId = await seedTeam(42, "Dragons");
    await seedTeam(99, "Rivals");
    await seedTeam(77, "Others");
    await seedMatch({
      apiMatchId: 1,
      home: 99,
      guest: 77,
      kickoffDate: "2026-03-01",
      homeScore: 80,
      guestScore: 70,
    });

    expect((await getTeamStats(teamId))!.form).toEqual([]);
  });

  it("excludes matches that are missing either score", async () => {
    const teamId = await seedTeam(42, "Dragons");
    await seedTeam(99, "Rivals");
    await seedMatch({ apiMatchId: 1, home: 42, guest: 99, kickoffDate: "2026-03-01" });
    await seedMatch({
      apiMatchId: 2,
      home: 42,
      guest: 99,
      kickoffDate: "2026-02-01",
      homeScore: 80,
    });
    await seedMatch({
      apiMatchId: 3,
      home: 42,
      guest: 99,
      kickoffDate: "2026-01-01",
      guestScore: 70,
    });

    expect((await getTeamStats(teamId))!.form).toEqual([]);
  });

  it("returns the five most recent matches, newest first", async () => {
    const teamId = await seedTeam(42, "Dragons");
    await seedTeam(99, "Rivals");
    const ids: number[] = [];
    for (let i = 1; i <= 7; i++) {
      ids.push(
        await seedMatch({
          apiMatchId: i,
          home: 42,
          guest: 99,
          kickoffDate: `2026-0${i}-01`,
          homeScore: 80,
          guestScore: 70,
        }),
      );
    }

    const result = await getTeamStats(teamId);

    // Neither the DESC ordering nor the LIMIT 5 was observable before.
    expect(result!.form.map((f) => f.matchId)).toEqual(
      [...ids].reverse().slice(0, 5),
    );
  });
});

describe("getTeamStats — team entry", () => {
  it("names the entry's league even before any standings row exists", async () => {
    const league = await seedLeague(60, "U10 Kreisliga", activeSeasonId);
    const squad = await seedTeam(7100, "Dragons U10");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id) VALUES ($1, $2, $3)`,
      [squad, activeSeasonId, league],
    );

    const stats = await getTeamStats(squad);

    expect(stats?.leagueName).toBe("U10 Kreisliga");
    expect(stats?.position).toBeNull();
    expect(stats?.played).toBe(0);
  });
});

describe("getTeamStats — season scope", () => {
  it("returns null when no season is active", async () => {
    const teamId = await seedTeam(100, "Dragons 1");
    await ctx.db.update(seasons).set({ status: "archived" });
    invalidateActiveSeasonCache();

    expect(await getTeamStats(teamId)).toBeNull();
  });
});

describe("getTeamStats — form season scope", () => {
  it("ignores a match that belongs to no league, and so to no season", async () => {
    const teamId = await seedTeam(100, "Dragons 1");
    await seedTeam(200, "Rivals");
    await seedMatch({
      apiMatchId: 1,
      home: 100,
      guest: 200,
      kickoffDate: "2026-01-10",
      homeScore: 80,
      guestScore: 70,
      leagueId: null,
    });

    expect((await getTeamStats(teamId))!.form).toEqual([]);
  });

  it("ignores a match played in another season", async () => {
    const teamId = await seedTeam(100, "Dragons 1");
    await seedTeam(200, "Rivals");
    const [old] = await ctx.db
      .insert(seasons)
      .values({ name: "2024/25", status: "archived" })
      .returning({ id: seasons.id });
    const oldLeagueId = await seedLeague(901, "Last Season", old!.id);
    await seedMatch({
      apiMatchId: 1,
      home: 100,
      guest: 200,
      kickoffDate: "2025-01-10",
      homeScore: 80,
      guestScore: 70,
      leagueId: oldLeagueId,
    });

    expect((await getTeamStats(teamId))!.form).toEqual([]);
  });
});

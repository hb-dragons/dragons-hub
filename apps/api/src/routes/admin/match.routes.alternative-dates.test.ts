import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import type { AlternativeDatesResponse } from "@dragons/shared";

// --- Mocks (hoisted before imports) ---
//
// The database is real (in-process PGlite): the finder is a query plus a walk
// over the calendar, and mocking either would assert nothing. Only better-auth
// is mocked — the route's permission gate runs for real against it, so a test
// can both deny the caller and assert which permission was asked for.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  userHasPermission: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../config/auth", () => ({
  auth: {
    api: {
      userHasPermission: mocks.userHasPermission,
      getSession: mocks.getSession,
    },
  },
}));

// --- Subject (imported after mocks) ---

import { matchRoutes } from "./match.routes";
import { errorHandler } from "../../middleware/error";
import { seasons, leagues, teams, matches } from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

const app = new Hono<AppEnv>();
app.use("/*", async (c, next) => {
  c.set("user", { id: "user-1" } as AppEnv["Variables"]["user"]);
  await next();
});
app.onError(errorHandler);
app.route("/", matchRoutes);

let ctx: TestDbContext;

/** 2026-03-01 is a Sunday; 09:00 UTC is safely inside the same club day. */
const NOW = new Date("2026-03-01T09:00:00Z");

const OWN_SQUAD = 100;
const OPPONENT_SQUAD = 200;
const THIRD_SQUAD = 300;
const FOURTH_SQUAD = 400;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mocks.userHasPermission.mockResolvedValue({ success: true });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Seed helpers ---

async function seedSquad(apiTeamPermanentId: number, isOwnClub: boolean): Promise<void> {
  await ctx.db.insert(teams).values({
    apiTeamPermanentId,
    seasonTeamId: apiTeamPermanentId * 10,
    teamCompetitionId: apiTeamPermanentId,
    name: `Squad ${apiTeamPermanentId}`,
    clubId: isOwnClub ? 1 : 2,
    isOwnClub,
  });
}

async function seedLeague(): Promise<number> {
  const [season] = await ctx.db
    .insert(seasons)
    .values({ name: "2025/26", status: "active" })
    .returning({ id: seasons.id });
  const [league] = await ctx.db
    .insert(leagues)
    .values({
      apiLigaId: 9001,
      ligaNr: 1,
      name: "Kreisliga Nord",
      seasonId: 2025,
      seasonName: "2025/26",
      seasonRefId: season!.id,
    })
    .returning({ id: leagues.id });
  return league!.id;
}

let matchNoSeq = 0;

async function seedMatch(seed: {
  homeTeamApiId: number;
  guestTeamApiId: number;
  kickoffDate: string;
  leagueId?: number | null;
  matchDay?: number;
  isCancelled?: boolean;
  isForfeited?: boolean;
}): Promise<number> {
  matchNoSeq += 1;
  const [row] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: 10_000 + matchNoSeq,
      matchNo: matchNoSeq,
      matchDay: seed.matchDay ?? 5,
      kickoffDate: seed.kickoffDate,
      kickoffTime: "18:00:00",
      leagueId: seed.leagueId ?? null,
      homeTeamApiId: seed.homeTeamApiId,
      guestTeamApiId: seed.guestTeamApiId,
      isCancelled: seed.isCancelled ?? false,
      isForfeited: seed.isForfeited ?? false,
    })
    .returning({ id: matches.id });
  return row!.id;
}

/**
 * The standard fixture: an own-club home game on Sat 2026-03-07 against a
 * foreign squad, in a league whose last fixture is Sat 2026-03-28.
 */
async function seedStandardFixture(): Promise<{ matchId: number; leagueId: number }> {
  await seedSquad(OWN_SQUAD, true);
  await seedSquad(OPPONENT_SQUAD, false);
  await seedSquad(THIRD_SQUAD, false);
  await seedSquad(FOURTH_SQUAD, false);
  const leagueId = await seedLeague();
  const matchId = await seedMatch({
    homeTeamApiId: OWN_SQUAD,
    guestTeamApiId: OPPONENT_SQUAD,
    kickoffDate: "2026-03-07",
    leagueId,
  });
  // Last fixture of the league, between two squads that are not ours.
  await seedMatch({
    homeTeamApiId: THIRD_SQUAD,
    guestTeamApiId: FOURTH_SQUAD,
    kickoffDate: "2026-03-28",
    leagueId,
  });
  return { matchId, leagueId };
}

async function get(matchId: number, query = ""): Promise<Response> {
  return app.request(`/matches/${matchId}/alternative-dates${query}`);
}

async function candidateDates(matchId: number, query = ""): Promise<string[]> {
  const res = await get(matchId, query);
  expect(res.status).toBe(200);
  const body = (await res.json()) as AlternativeDatesResponse;
  return body.candidates.map((c) => c.date);
}

// --- Tests ---

describe("GET /matches/:id/alternative-dates", () => {
  it("proposes every Saturday and Sunday of the default range and nothing else", async () => {
    const { matchId } = await seedStandardFixture();

    const res = await get(matchId);

    expect(res.status).toBe(200);
    const body = (await res.json()) as AlternativeDatesResponse;
    expect(body.range).toEqual({ from: "2026-03-01", to: "2026-03-28" });
    expect(body.candidates).toEqual([
      { date: "2026-03-01", weekday: "sunday" },
      { date: "2026-03-07", weekday: "saturday" },
      { date: "2026-03-08", weekday: "sunday" },
      { date: "2026-03-14", weekday: "saturday" },
      { date: "2026-03-15", weekday: "sunday" },
      { date: "2026-03-21", weekday: "saturday" },
      { date: "2026-03-22", weekday: "sunday" },
      { date: "2026-03-28", weekday: "saturday" },
    ]);
  });

  it("reports the home game and the untracked-league caveat", async () => {
    const { matchId } = await seedStandardFixture();

    const body = (await (await get(matchId)).json()) as AlternativeDatesResponse;

    expect(body.isHomeGame).toBe(true);
    expect(body.caveats).toEqual(["opponentGamesOutsideTrackedLeagues"]);
  });

  it("reports an away game when the club is the guest", async () => {
    await seedSquad(OWN_SQUAD, true);
    await seedSquad(OPPONENT_SQUAD, false);
    const leagueId = await seedLeague();
    const matchId = await seedMatch({
      homeTeamApiId: OPPONENT_SQUAD,
      guestTeamApiId: OWN_SQUAD,
      kickoffDate: "2026-03-07",
      leagueId,
    });

    const body = (await (await get(matchId)).json()) as AlternativeDatesResponse;

    expect(body.isHomeGame).toBe(false);
  });

  it("excludes a day on which our own squad already plays", async () => {
    const { matchId, leagueId } = await seedStandardFixture();
    await seedMatch({
      homeTeamApiId: THIRD_SQUAD,
      guestTeamApiId: OWN_SQUAD,
      kickoffDate: "2026-03-14",
      leagueId,
    });

    expect(await candidateDates(matchId)).not.toContain("2026-03-14");
  });

  it("excludes a day on which the opposing squad already plays", async () => {
    const { matchId } = await seedStandardFixture();
    // Another league entirely — the opponent's other games count wherever we
    // track them.
    await seedMatch({
      homeTeamApiId: OPPONENT_SQUAD,
      guestTeamApiId: FOURTH_SQUAD,
      kickoffDate: "2026-03-15",
      leagueId: null,
    });

    expect(await candidateDates(matchId)).not.toContain("2026-03-15");
  });

  it("ignores cancelled and forfeited games when deciding a squad is busy", async () => {
    const { matchId, leagueId } = await seedStandardFixture();
    await seedMatch({
      homeTeamApiId: OWN_SQUAD,
      guestTeamApiId: THIRD_SQUAD,
      kickoffDate: "2026-03-14",
      leagueId,
      isCancelled: true,
    });
    await seedMatch({
      homeTeamApiId: OPPONENT_SQUAD,
      guestTeamApiId: FOURTH_SQUAD,
      kickoffDate: "2026-03-15",
      leagueId,
      isForfeited: true,
    });

    const dates = await candidateDates(matchId);

    expect(dates).toContain("2026-03-14");
    expect(dates).toContain("2026-03-15");
  });

  it("ignores the game being moved, so its own day stays a candidate", async () => {
    const { matchId } = await seedStandardFixture();

    expect(await candidateDates(matchId)).toContain("2026-03-07");
  });

  it("defaults the range to today through the league's last fixture", async () => {
    const { matchId, leagueId } = await seedStandardFixture();
    await seedMatch({
      homeTeamApiId: THIRD_SQUAD,
      guestTeamApiId: FOURTH_SQUAD,
      kickoffDate: "2026-04-11",
      leagueId,
    });

    const body = (await (await get(matchId)).json()) as AlternativeDatesResponse;

    expect(body.range).toEqual({ from: "2026-03-01", to: "2026-04-11" });
    expect(body.candidates.at(-1)?.date).toBe("2026-04-11");
  });

  it("collapses the range to today when the league has no later fixture", async () => {
    await seedSquad(OWN_SQUAD, true);
    await seedSquad(OPPONENT_SQUAD, false);
    const leagueId = await seedLeague();
    const matchId = await seedMatch({
      homeTeamApiId: OWN_SQUAD,
      guestTeamApiId: OPPONENT_SQUAD,
      kickoffDate: "2026-02-07",
      leagueId,
    });

    const body = (await (await get(matchId)).json()) as AlternativeDatesResponse;

    expect(body.range).toEqual({ from: "2026-03-01", to: "2026-03-01" });
    // 2026-03-01 is itself a Sunday, so the collapsed range still yields it.
    expect(body.candidates).toEqual([{ date: "2026-03-01", weekday: "sunday" }]);
  });

  it("collapses the range to today for a game with no league", async () => {
    await seedSquad(OWN_SQUAD, true);
    await seedSquad(OPPONENT_SQUAD, false);
    const matchId = await seedMatch({
      homeTeamApiId: OWN_SQUAD,
      guestTeamApiId: OPPONENT_SQUAD,
      kickoffDate: "2026-03-07",
      leagueId: null,
    });

    const body = (await (await get(matchId)).json()) as AlternativeDatesResponse;

    expect(body.range).toEqual({ from: "2026-03-01", to: "2026-03-01" });
  });

  it("keeps the horizon at the last fixture that will actually be played", async () => {
    const { matchId, leagueId } = await seedStandardFixture();
    await seedMatch({
      homeTeamApiId: THIRD_SQUAD,
      guestTeamApiId: FOURTH_SQUAD,
      kickoffDate: "2026-04-11",
      leagueId,
      isCancelled: true,
    });

    const body = (await (await get(matchId)).json()) as AlternativeDatesResponse;

    expect(body.range.to).toBe("2026-03-28");
  });

  it("collapses a defaulted start onto an end the client put in the past", async () => {
    const { matchId } = await seedStandardFixture();

    const body = (await (
      await get(matchId, "?to=2026-02-14")
    ).json()) as AlternativeDatesResponse;

    expect(body.range).toEqual({ from: "2026-02-14", to: "2026-02-14" });
    expect(body.candidates).toEqual([{ date: "2026-02-14", weekday: "saturday" }]);
  });

  it("honours an explicit range", async () => {
    const { matchId } = await seedStandardFixture();

    const body = (await (
      await get(matchId, "?from=2026-03-14&to=2026-03-22")
    ).json()) as AlternativeDatesResponse;

    expect(body.range).toEqual({ from: "2026-03-14", to: "2026-03-22" });
    expect(body.candidates.map((c) => c.date)).toEqual([
      "2026-03-14",
      "2026-03-15",
      "2026-03-21",
      "2026-03-22",
    ]);
  });

  it("fills in only the end the client left out", async () => {
    const { matchId } = await seedStandardFixture();

    const body = (await (
      await get(matchId, "?from=2026-03-21")
    ).json()) as AlternativeDatesResponse;

    expect(body.range).toEqual({ from: "2026-03-21", to: "2026-03-28" });
  });

  it("returns 400 for a malformed date", async () => {
    const { matchId } = await seedStandardFixture();

    const res = await get(matchId, "?from=01.03.2026");

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for a range that runs backwards", async () => {
    const { matchId } = await seedStandardFixture();

    const res = await get(matchId, "?from=2026-03-28&to=2026-03-01");

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 404 for an unknown match", async () => {
    await seedStandardFixture();

    const res = await get(999_999);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("requires the match view permission", async () => {
    const { matchId } = await seedStandardFixture();
    mocks.userHasPermission.mockResolvedValue({ success: false });

    const res = await get(matchId);

    expect(res.status).toBe(403);
    expect(mocks.userHasPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ permissions: { match: ["view"] } }),
      }),
    );
  });
});

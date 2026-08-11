import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { traceQueries, type QueryTrace } from "../../test/trace-queries";

// --- Mocks (hoisted before imports) ---
//
// Deliberately NOT mocking drizzle-orm or @dragons/db/schema. The head-to-head
// query is the whole service: `WHERE both scores present AND ((home=A AND
// guest=B) OR (home=B AND guest=A))`. Under the old identity stubs that nested
// predicate was inert — swapping the outer `or` for an `and`, which makes every
// H2H record permanently empty, left all nine tests green — and the six query
// results were hand-fed in a fixed order, so a change of query order alone
// would have silently rewired the assertions.

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

import { getMatchContext } from "./match-context.service";
import { matches, teams } from "@dragons/db/schema";

const DRAGONS = 10;
const RIVALS = 20;
const THIRD = 30;

let ctx: TestDbContext;
let trace: QueryTrace;

beforeAll(async () => {
  ctx = await setupTestDb();
  trace = traceQueries(ctx.db as object);
  dbHolder.ref = trace.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  trace.reset();
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

interface MatchSpec {
  apiMatchId: number;
  home: number;
  guest: number;
  kickoffDate: string;
  homeScore?: number | null;
  guestScore?: number | null;
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
    })
    .returning({ id: matches.id });
  return row!.id;
}

/** Dragons (own club) at home vs Rivals — the fixture the context is asked about. */
async function seedUpcomingFixture(): Promise<number> {
  await seedTeam(DRAGONS, "Dragons", true);
  await seedTeam(RIVALS, "Rivals", false);
  return seedMatch({
    apiMatchId: 1,
    home: DRAGONS,
    guest: RIVALS,
    kickoffDate: "2026-04-01",
  });
}

describe("getMatchContext — guards", () => {
  it("returns null when the match does not exist", async () => {
    expect(await getMatchContext(999)).toBeNull();
  });

  it("returns null when neither team is own club (#82)", async () => {
    await seedTeam(DRAGONS, "Foreign A", false);
    await seedTeam(RIVALS, "Foreign B", false);
    const id = await seedMatch({
      apiMatchId: 1,
      home: DRAGONS,
      guest: RIVALS,
      kickoffDate: "2026-04-01",
    });

    expect(await getMatchContext(id)).toBeNull();
  });

  it("returns null when both teams are own club (#82)", async () => {
    await seedTeam(DRAGONS, "Dragons A", true);
    await seedTeam(RIVALS, "Dragons B", true);
    const id = await seedMatch({
      apiMatchId: 1,
      home: DRAGONS,
      guest: RIVALS,
      kickoffDate: "2026-04-01",
    });

    expect(await getMatchContext(id)).toBeNull();
  });
});

describe("getMatchContext — head to head", () => {
  it("aggregates wins, losses and points from the own-club perspective", async () => {
    const matchId = await seedUpcomingFixture();
    await seedMatch({ apiMatchId: 101, home: DRAGONS, guest: RIVALS, kickoffDate: "2026-03-01", homeScore: 80, guestScore: 70 });
    await seedMatch({ apiMatchId: 102, home: RIVALS, guest: DRAGONS, kickoffDate: "2026-02-01", homeScore: 75, guestScore: 85 });
    await seedMatch({ apiMatchId: 103, home: DRAGONS, guest: RIVALS, kickoffDate: "2026-01-01", homeScore: 60, guestScore: 70 });

    const result = await getMatchContext(matchId);

    expect(result!.headToHead).toMatchObject({
      wins: 2,
      losses: 1,
      pointsFor: 80 + 85 + 60,
      pointsAgainst: 70 + 75 + 70,
    });
    expect(result!.headToHead.previousMeetings).toHaveLength(3);
  });

  it("includes the reverse fixture, not just the same-order one", async () => {
    const matchId = await seedUpcomingFixture();
    await seedMatch({ apiMatchId: 102, home: RIVALS, guest: DRAGONS, kickoffDate: "2026-02-01", homeScore: 75, guestScore: 85 });

    const result = await getMatchContext(matchId);

    // An `and` in place of the outer `or` demands both orderings of the same
    // row at once, which empties every head-to-head record.
    expect(result!.headToHead.previousMeetings.map((m) => m.matchId)).toHaveLength(1);
    expect(result!.headToHead.wins).toBe(1);
  });

  it("excludes matches against a third team", async () => {
    const matchId = await seedUpcomingFixture();
    await seedTeam(THIRD, "Others", false);
    await seedMatch({ apiMatchId: 104, home: DRAGONS, guest: THIRD, kickoffDate: "2026-03-01", homeScore: 99, guestScore: 10 });
    await seedMatch({ apiMatchId: 105, home: THIRD, guest: RIVALS, kickoffDate: "2026-03-02", homeScore: 99, guestScore: 10 });

    const result = await getMatchContext(matchId);

    expect(result!.headToHead.previousMeetings).toEqual([]);
    expect(result!.headToHead.wins).toBe(0);
  });

  it("excludes meetings that are missing either score", async () => {
    const matchId = await seedUpcomingFixture();
    await seedMatch({ apiMatchId: 106, home: DRAGONS, guest: RIVALS, kickoffDate: "2026-03-01" });
    await seedMatch({ apiMatchId: 107, home: DRAGONS, guest: RIVALS, kickoffDate: "2026-03-02", homeScore: 80 });

    expect((await getMatchContext(matchId))!.headToHead.previousMeetings).toEqual([]);
  });

  it("caps previousMeetings at 5 but counts every meeting in the totals", async () => {
    const matchId = await seedUpcomingFixture();
    for (let i = 1; i <= 7; i++) {
      await seedMatch({
        apiMatchId: 100 + i,
        home: DRAGONS,
        guest: RIVALS,
        kickoffDate: `2026-0${i}-01`,
        homeScore: 80,
        guestScore: 70,
      });
    }

    const result = await getMatchContext(matchId);

    expect(result!.headToHead.previousMeetings).toHaveLength(5);
    expect(result!.headToHead.wins).toBe(7);
    expect(result!.headToHead.losses).toBe(0);
  });

  it("lists previousMeetings newest first", async () => {
    const matchId = await seedUpcomingFixture();
    const oldest = await seedMatch({ apiMatchId: 101, home: DRAGONS, guest: RIVALS, kickoffDate: "2026-01-01", homeScore: 80, guestScore: 70 });
    const newest = await seedMatch({ apiMatchId: 102, home: DRAGONS, guest: RIVALS, kickoffDate: "2026-03-01", homeScore: 80, guestScore: 70 });

    const result = await getMatchContext(matchId);

    expect(result!.headToHead.previousMeetings.map((m) => m.matchId)).toEqual([
      newest,
      oldest,
    ]);
  });

  it("inverts the perspective when the own-club team is the guest", async () => {
    await seedTeam(DRAGONS, "Rivals", false);
    await seedTeam(RIVALS, "Dragons", true);
    const matchId = await seedMatch({
      apiMatchId: 1,
      home: DRAGONS,
      guest: RIVALS,
      kickoffDate: "2026-04-01",
    });
    await seedMatch({ apiMatchId: 101, home: DRAGONS, guest: RIVALS, kickoffDate: "2026-03-01", homeScore: 80, guestScore: 70 });

    const result = await getMatchContext(matchId);

    expect(result!.headToHead).toMatchObject({
      wins: 0,
      losses: 1,
      pointsFor: 70,
      pointsAgainst: 80,
    });
    expect(result!.headToHead.previousMeetings[0]).toMatchObject({
      isWin: false,
      homeIsOwnClub: false,
    });
  });

  it("names each side by its position in that meeting, not in the current match", async () => {
    const matchId = await seedUpcomingFixture();
    const sameOrder = await seedMatch({ apiMatchId: 101, home: DRAGONS, guest: RIVALS, kickoffDate: "2026-03-01", homeScore: 80, guestScore: 70 });
    const swapped = await seedMatch({ apiMatchId: 102, home: RIVALS, guest: DRAGONS, kickoffDate: "2026-02-01", homeScore: 75, guestScore: 85 });

    const meetings = (await getMatchContext(matchId))!.headToHead.previousMeetings;

    expect(meetings).toMatchObject([
      {
        matchId: sameOrder,
        date: "2026-03-01",
        homeTeamName: "Dragons",
        guestTeamName: "Rivals",
        homeScore: 80,
        guestScore: 70,
        homeIsOwnClub: true,
      },
      {
        matchId: swapped,
        date: "2026-02-01",
        homeTeamName: "Rivals",
        guestTeamName: "Dragons",
        homeScore: 75,
        guestScore: 85,
        homeIsOwnClub: false,
      },
    ]);
  });
});

describe("getMatchContext — per-team form", () => {
  it("computes each side's form from its own recent matches", async () => {
    const matchId = await seedUpcomingFixture();
    await seedTeam(THIRD, "Others", false);
    const dragonsWin = await seedMatch({ apiMatchId: 201, home: DRAGONS, guest: THIRD, kickoffDate: "2026-03-10", homeScore: 90, guestScore: 80 });
    const rivalsLoss = await seedMatch({ apiMatchId: 301, home: RIVALS, guest: THIRD, kickoffDate: "2026-03-11", homeScore: 50, guestScore: 60 });

    const result = await getMatchContext(matchId);

    expect(result!.homeForm).toEqual([{ result: "W", matchId: dragonsWin }]);
    expect(result!.guestForm).toEqual([{ result: "L", matchId: rivalsLoss }]);
  });

  it("scores a form entry from the guest side when the team played away", async () => {
    const matchId = await seedUpcomingFixture();
    await seedTeam(THIRD, "Others", false);
    const away = await seedMatch({ apiMatchId: 202, home: THIRD, guest: DRAGONS, kickoffDate: "2026-03-10", homeScore: 90, guestScore: 70 });

    const result = await getMatchContext(matchId);

    expect(result!.homeForm).toEqual([{ result: "L", matchId: away }]);
  });

  it("keeps only the five most recent form entries, newest first", async () => {
    const matchId = await seedUpcomingFixture();
    await seedTeam(THIRD, "Others", false);
    const ids: number[] = [];
    for (let i = 1; i <= 7; i++) {
      ids.push(
        await seedMatch({
          apiMatchId: 200 + i,
          home: DRAGONS,
          guest: THIRD,
          kickoffDate: `2026-0${i}-15`,
          homeScore: 90,
          guestScore: 80,
        }),
      );
    }

    const result = await getMatchContext(matchId);

    expect(result!.homeForm.map((f) => f.matchId)).toEqual(
      [...ids].reverse().slice(0, 5),
    );
  });

  it("ignores unfinished matches in form", async () => {
    const matchId = await seedUpcomingFixture();
    await seedTeam(THIRD, "Others", false);
    await seedMatch({ apiMatchId: 203, home: DRAGONS, guest: THIRD, kickoffDate: "2026-03-10" });

    expect((await getMatchContext(matchId))!.homeForm).toEqual([]);
  });
});

describe("getMatchContext — query fan-out", () => {
  it("pairs the two team lookups and the two form queries instead of awaiting them one by one", async () => {
    const matchId = await seedUpcomingFixture();
    trace.reset();

    await getMatchContext(matchId);

    // 0 match, 1 head-to-head, 2 home team, 3 guest team, 4 home form, 5 guest form.
    expect(trace.startCount()).toBe(6);
    expect(trace.overlaps(3)).toBe(true);
    expect(trace.overlaps(5)).toBe(true);
  });
});

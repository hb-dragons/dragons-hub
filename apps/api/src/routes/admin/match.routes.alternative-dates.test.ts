import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import type {
  AlternativeDateCandidate,
  AlternativeDateFlag,
  AlternativeDatesResponse,
  BookingStatus,
} from "@dragons/shared";

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

import { eq } from "drizzle-orm";
import { matchRoutes } from "./match.routes";
import { errorHandler } from "../../middleware/error";
import { invalidateActiveSeasonCache } from "../../services/admin/season.service";
import {
  appSettings,
  seasons,
  leagues,
  teams,
  teamEntries,
  teamStaff,
  staffPeople,
  matches,
  venues,
  venueBookings,
  venueBookingMatches,
} from "@dragons/db/schema";
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
/** Two more squads of our own club: the coach a shared person collides with, and the ones whose games fill the hall. */
const OWN_SECOND_SQUAD = 500;
const OWN_THIRD_SQUAD = 600;

// Deliberately not the fallbacks (60 / 90): a suggested kickoff computed from
// the defaults instead of these rows would still land on a plausible time.
const BUFFER_AFTER_MINUTES = 45;
const DEFAULT_GAME_DURATION_MINUTES = 100;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  // A non-Berlin zone on purpose (see kickoff.test.ts): the finder must name
  // the club day, not the runtime day. Kiritimati is UTC+14, so 09:00Z is
  // already the next calendar day there.
  vi.stubEnv("TZ", "Pacific/Kiritimati");
  // The active season is memoised for a minute, and the clock below never
  // moves — without this every test after the first would see the first one's
  // season (or its absence).
  invalidateActiveSeasonCache();
  mocks.userHasPermission.mockResolvedValue({ success: true });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
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

/**
 * An active season with one league in it. Both ids matter: the league connects
 * the game, the season owns the team entries the coach flag walks.
 */
async function seedSeasonAndLeague(): Promise<{ seasonId: number; leagueId: number }> {
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
  return { seasonId: season!.id, leagueId: league!.id };
}

/** A Team entry for an already-seeded squad, in the given season. */
async function seedTeamEntry(
  seasonId: number,
  squadApiId: number,
  fields: { customName?: string; estimatedGameDuration?: number | null } = {},
): Promise<number> {
  const [team] = await ctx.db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, squadApiId));
  const [entry] = await ctx.db
    .insert(teamEntries)
    .values({
      teamId: team!.id,
      seasonId,
      customName: fields.customName ?? null,
      estimatedGameDuration: fields.estimatedGameDuration ?? null,
    })
    .returning({ id: teamEntries.id });
  return entry!.id;
}

/** One human, attached as trainer to every entry given. */
async function seedStaffPerson(entryIds: number[], lastName = "Meier"): Promise<void> {
  const [person] = await ctx.db
    .insert(staffPeople)
    .values({ firstName: "Ada", lastName })
    .returning({ id: staffPeople.id });
  for (const teamEntryId of entryIds) {
    await ctx.db
      .insert(teamStaff)
      .values({ teamEntryId, personId: person!.id, role: "trainer" });
  }
}

let matchNoSeq = 0;

async function seedMatch(seed: {
  homeTeamApiId: number;
  guestTeamApiId: number;
  kickoffDate: string;
  kickoffTime?: string;
  venueId?: number | null;
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
      kickoffTime: seed.kickoffTime ?? "18:00:00",
      venueId: seed.venueId ?? null,
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
 *
 * Its two sibling fixtures share match day 5 and sit at either end of the
 * default range, so the round window spans the whole range and no candidate
 * carries a flag unless a test seeds one. Flag cases narrow the window with
 * their own match days.
 */
async function seedStandardFixture(): Promise<{
  matchId: number;
  leagueId: number;
  seasonId: number;
}> {
  await seedSquad(OWN_SQUAD, true);
  await seedSquad(OPPONENT_SQUAD, false);
  await seedSquad(THIRD_SQUAD, false);
  await seedSquad(FOURTH_SQUAD, false);
  await seedSquad(OWN_SECOND_SQUAD, true);
  const { seasonId, leagueId } = await seedSeasonAndLeague();
  const matchId = await seedMatch({
    homeTeamApiId: OWN_SQUAD,
    guestTeamApiId: OPPONENT_SQUAD,
    kickoffDate: "2026-03-07",
    leagueId,
  });
  // Same round, opening the window at the first day of the default range.
  await seedMatch({
    homeTeamApiId: FOURTH_SQUAD,
    guestTeamApiId: THIRD_SQUAD,
    kickoffDate: "2026-03-01",
    leagueId,
  });
  // Last fixture of the league, between two squads that are not ours.
  await seedMatch({
    homeTeamApiId: THIRD_SQUAD,
    guestTeamApiId: FOURTH_SQUAD,
    kickoffDate: "2026-03-28",
    leagueId,
  });
  return { matchId, leagueId, seasonId };
}

/**
 * A league whose round 9 is played over Sat 2026-03-07 and Sun 2026-03-08 and
 * whose round 10 follows on Sat 2026-03-21 — so the round window is narrower
 * than the range, and days outside it are flagged.
 */
async function seedRoundFixture(): Promise<number> {
  await seedSquad(OWN_SQUAD, true);
  await seedSquad(OPPONENT_SQUAD, false);
  await seedSquad(THIRD_SQUAD, false);
  await seedSquad(FOURTH_SQUAD, false);
  const { leagueId } = await seedSeasonAndLeague();
  const matchId = await seedMatch({
    homeTeamApiId: OWN_SQUAD,
    guestTeamApiId: OPPONENT_SQUAD,
    kickoffDate: "2026-03-07",
    leagueId,
    matchDay: 9,
  });
  await seedMatch({
    homeTeamApiId: THIRD_SQUAD,
    guestTeamApiId: FOURTH_SQUAD,
    kickoffDate: "2026-03-08",
    leagueId,
    matchDay: 9,
  });
  await seedMatch({
    homeTeamApiId: THIRD_SQUAD,
    guestTeamApiId: FOURTH_SQUAD,
    kickoffDate: "2026-03-21",
    leagueId,
    matchDay: 10,
  });
  return matchId;
}

let venueApiIdSeq = 0;

async function seedVenue(name: string): Promise<number> {
  venueApiIdSeq += 1;
  const [row] = await ctx.db
    .insert(venues)
    .values({ apiId: 7000 + venueApiIdSeq, name })
    .returning({ id: venues.id });
  return row!.id;
}

/** The club's buffers and default duration, as the settings screen stores them. */
async function seedBookingConfig(): Promise<void> {
  await ctx.db.insert(appSettings).values([
    { key: "venue_booking_buffer_before", value: "30" },
    { key: "venue_booking_buffer_after", value: String(BUFFER_AFTER_MINUTES) },
    { key: "venue_booking_game_duration", value: String(DEFAULT_GAME_DURATION_MINUTES) },
  ]);
}

async function seedBooking(seed: {
  venueId: number;
  date: string;
  calculatedStartTime?: string;
  calculatedEndTime?: string;
  overrideStartTime?: string | null;
  overrideEndTime?: string | null;
  status?: BookingStatus;
  needsReconfirmation?: boolean;
  matchIds?: number[];
}): Promise<number> {
  const [row] = await ctx.db
    .insert(venueBookings)
    .values({
      venueId: seed.venueId,
      date: seed.date,
      calculatedStartTime: seed.calculatedStartTime ?? "11:30:00",
      calculatedEndTime: seed.calculatedEndTime ?? "16:00:00",
      overrideStartTime: seed.overrideStartTime ?? null,
      overrideEndTime: seed.overrideEndTime ?? null,
      status: seed.status ?? "pending",
      needsReconfirmation: seed.needsReconfirmation ?? false,
    })
    .returning({ id: venueBookings.id });
  for (const matchId of seed.matchIds ?? []) {
    await ctx.db
      .insert(venueBookingMatches)
      .values({ venueBookingId: row!.id, matchId });
  }
  return row!.id;
}

/**
 * The standard fixture plus a hall: our home game is played at "Drachenhalle",
 * and our second team is the one whose games fill it on other weekends.
 */
async function seedHomeFixtureWithVenue(): Promise<{
  matchId: number;
  leagueId: number;
  seasonId: number;
  venueId: number;
}> {
  await seedSquad(OWN_SQUAD, true);
  await seedSquad(OPPONENT_SQUAD, false);
  await seedSquad(THIRD_SQUAD, false);
  await seedSquad(FOURTH_SQUAD, false);
  await seedSquad(OWN_SECOND_SQUAD, true);
  await seedSquad(OWN_THIRD_SQUAD, true);
  const { seasonId, leagueId } = await seedSeasonAndLeague();
  const venueId = await seedVenue("Drachenhalle");
  await seedBookingConfig();
  const matchId = await seedMatch({
    homeTeamApiId: OWN_SQUAD,
    guestTeamApiId: OPPONENT_SQUAD,
    kickoffDate: "2026-03-07",
    venueId,
    leagueId,
  });
  await seedMatch({
    homeTeamApiId: THIRD_SQUAD,
    guestTeamApiId: FOURTH_SQUAD,
    kickoffDate: "2026-03-28",
    leagueId,
  });
  return { matchId, leagueId, seasonId, venueId };
}

/** A game of our second team in the hall — what a booking is made of. */
async function seedHallGame(seed: {
  venueId: number;
  leagueId: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeamApiId?: number;
  isCancelled?: boolean;
}): Promise<number> {
  return seedMatch({
    homeTeamApiId: OWN_SECOND_SQUAD,
    guestTeamApiId: THIRD_SQUAD,
    ...seed,
  });
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

async function candidateOn(
  matchId: number,
  date: string,
  query = "",
): Promise<AlternativeDateCandidate> {
  const body = (await (await get(matchId, query)).json()) as AlternativeDatesResponse;
  const found = body.candidates.find((c) => c.date === date);
  expect(found, `no candidate for ${date}`).toBeDefined();
  return found!;
}

/** A day nothing is booked on: what most candidates look like. */
function unbooked(
  date: string,
  weekday: AlternativeDateCandidate["weekday"],
  flags: AlternativeDateFlag[] = [],
): AlternativeDateCandidate {
  return { date, weekday, group: "unbooked", bookings: [], suggestedKickoffTime: null, flags };
}

async function flagsOn(
  matchId: number,
  date: string,
  query = "",
): Promise<AlternativeDateFlag[]> {
  const res = await get(matchId, query);
  expect(res.status).toBe(200);
  const body = (await res.json()) as AlternativeDatesResponse;
  return body.candidates.find((c) => c.date === date)?.flags ?? [];
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
      unbooked("2026-03-01", "sunday"),
      unbooked("2026-03-07", "saturday"),
      unbooked("2026-03-08", "sunday"),
      unbooked("2026-03-14", "saturday"),
      unbooked("2026-03-15", "sunday"),
      unbooked("2026-03-21", "saturday"),
      unbooked("2026-03-22", "sunday"),
      unbooked("2026-03-28", "saturday"),
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
    const { leagueId } = await seedSeasonAndLeague();
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
    const { leagueId } = await seedSeasonAndLeague();
    const matchId = await seedMatch({
      homeTeamApiId: OWN_SQUAD,
      guestTeamApiId: OPPONENT_SQUAD,
      kickoffDate: "2026-02-07",
      leagueId,
    });

    const body = (await (await get(matchId)).json()) as AlternativeDatesResponse;

    expect(body.range).toEqual({ from: "2026-03-01", to: "2026-03-01" });
    // 2026-03-01 is itself a Sunday, so the collapsed range still yields it —
    // outside the round window of the only fixture the league has.
    expect(body.candidates).toEqual([
      unbooked("2026-03-01", "sunday", [{ type: "outsideRoundWindow" }]),
    ]);
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
    expect(body.candidates).toEqual([
      unbooked("2026-02-14", "saturday", [{ type: "outsideRoundWindow" }]),
    ]);
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

  it("flags a day outside the round window and leaves the round's own days clean", async () => {
    const matchId = await seedRoundFixture();

    expect(await flagsOn(matchId, "2026-03-07")).toEqual([]);
    expect(await flagsOn(matchId, "2026-03-08")).toEqual([]);
    expect(await flagsOn(matchId, "2026-03-14")).toEqual([{ type: "outsideRoundWindow" }]);
  });

  it("carries no round flag for a game with no league", async () => {
    await seedSquad(OWN_SQUAD, true);
    await seedSquad(OPPONENT_SQUAD, false);
    const matchId = await seedMatch({
      homeTeamApiId: OWN_SQUAD,
      guestTeamApiId: OPPONENT_SQUAD,
      kickoffDate: "2026-03-07",
      leagueId: null,
    });

    const res = await get(matchId);

    expect(res.status).toBe(200);
    const body = (await res.json()) as AlternativeDatesResponse;
    expect(body.candidates).toEqual([unbooked("2026-03-01", "sunday")]);
  });

  it("flags a day on which a shared staff person's other team entry plays", async () => {
    const { matchId, leagueId, seasonId } = await seedStandardFixture();
    const moving = await seedTeamEntry(seasonId, OWN_SQUAD, { customName: "Herren 1" });
    const other = await seedTeamEntry(seasonId, OWN_SECOND_SQUAD, { customName: "Damen 1" });
    await seedStaffPerson([moving, other]);
    await seedMatch({
      homeTeamApiId: OWN_SECOND_SQUAD,
      guestTeamApiId: THIRD_SQUAD,
      kickoffDate: "2026-03-14",
      leagueId,
    });

    expect(await flagsOn(matchId, "2026-03-14")).toEqual([
      { type: "coachCollision", teamEntryName: "Damen 1" },
    ]);
    expect(await flagsOn(matchId, "2026-03-15")).toEqual([]);
  });

  it("does not flag a day when our staff person is on no other team entry", async () => {
    const { matchId, leagueId, seasonId } = await seedStandardFixture();
    const moving = await seedTeamEntry(seasonId, OWN_SQUAD, { customName: "Herren 1" });
    await seedTeamEntry(seasonId, OWN_SECOND_SQUAD, { customName: "Damen 1" });
    await seedStaffPerson([moving]);
    await seedMatch({
      homeTeamApiId: OWN_SECOND_SQUAD,
      guestTeamApiId: THIRD_SQUAD,
      kickoffDate: "2026-03-14",
      leagueId,
    });

    expect(await flagsOn(matchId, "2026-03-14")).toEqual([]);
  });

  it("still finds a coach collision for a game with no league", async () => {
    const { seasonId, leagueId } = await seedSeasonAndLeague();
    await seedSquad(OWN_SQUAD, true);
    await seedSquad(OPPONENT_SQUAD, false);
    await seedSquad(THIRD_SQUAD, false);
    await seedSquad(OWN_SECOND_SQUAD, true);
    // A friendly: no league, so the season comes from the active one instead.
    const matchId = await seedMatch({
      homeTeamApiId: OWN_SQUAD,
      guestTeamApiId: OPPONENT_SQUAD,
      kickoffDate: "2026-03-07",
      leagueId: null,
    });
    const moving = await seedTeamEntry(seasonId, OWN_SQUAD, { customName: "Herren 1" });
    const other = await seedTeamEntry(seasonId, OWN_SECOND_SQUAD, { customName: "Damen 1" });
    await seedStaffPerson([moving, other]);
    await seedMatch({
      homeTeamApiId: OWN_SECOND_SQUAD,
      guestTeamApiId: THIRD_SQUAD,
      kickoffDate: "2026-03-01",
      leagueId,
    });

    expect(await flagsOn(matchId, "2026-03-01")).toEqual([
      { type: "coachCollision", teamEntryName: "Damen 1" },
    ]);
  });

  it("does not flag a day whose colliding game is cancelled", async () => {
    const { matchId, leagueId, seasonId } = await seedStandardFixture();
    const moving = await seedTeamEntry(seasonId, OWN_SQUAD, { customName: "Herren 1" });
    const other = await seedTeamEntry(seasonId, OWN_SECOND_SQUAD, { customName: "Damen 1" });
    await seedStaffPerson([moving, other]);
    await seedMatch({
      homeTeamApiId: OWN_SECOND_SQUAD,
      guestTeamApiId: THIRD_SQUAD,
      kickoffDate: "2026-03-14",
      leagueId,
      isCancelled: true,
    });

    expect(await flagsOn(matchId, "2026-03-14")).toEqual([]);
  });

  it("ranks flagged days after unflagged ones, chronological inside each", async () => {
    const matchId = await seedRoundFixture();

    expect(await candidateDates(matchId)).toEqual([
      "2026-03-07",
      "2026-03-08",
      "2026-03-01",
      "2026-03-14",
      "2026-03-15",
      "2026-03-21",
    ]);
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

describe("GET /matches/:id/alternative-dates — hall bookings", () => {
  it("lists the booking at the game's own venue, override times winning", async () => {
    const { matchId, leagueId, venueId } = await seedHomeFixtureWithVenue();
    const hallGame = await seedHallGame({
      venueId,
      leagueId,
      kickoffDate: "2026-03-14",
      kickoffTime: "12:00:00",
    });
    const bookingId = await seedBooking({
      venueId,
      date: "2026-03-14",
      calculatedStartTime: "11:00:00",
      calculatedEndTime: "15:00:00",
      overrideStartTime: "10:30:00",
      overrideEndTime: "16:30:00",
      status: "confirmed",
      needsReconfirmation: true,
      matchIds: [hallGame],
    });

    const candidate = await candidateOn(matchId, "2026-03-14");

    expect(candidate.group).toBe("booked");
    expect(candidate.bookings).toEqual([
      {
        id: bookingId,
        effectiveStartTime: "10:30:00",
        effectiveEndTime: "16:30:00",
        status: "confirmed",
        needsReconfirmation: true,
      },
    ]);
  });

  it("shows the calculated window when the booking carries no override", async () => {
    const { matchId, venueId } = await seedHomeFixtureWithVenue();
    await seedBooking({
      venueId,
      date: "2026-03-14",
      calculatedStartTime: "09:15:00",
      calculatedEndTime: "13:45:00",
    });

    const candidate = await candidateOn(matchId, "2026-03-14");

    expect(candidate.bookings[0]).toMatchObject({
      effectiveStartTime: "09:15:00",
      effectiveEndTime: "13:45:00",
      status: "pending",
      needsReconfirmation: false,
    });
  });

  it("takes each end of the window on its own when only one is overridden", async () => {
    const { matchId, venueId } = await seedHomeFixtureWithVenue();
    await seedBooking({
      venueId,
      date: "2026-03-14",
      calculatedStartTime: "11:00:00",
      calculatedEndTime: "15:00:00",
      overrideEndTime: "17:00:00",
    });

    const candidate = await candidateOn(matchId, "2026-03-14");

    expect(candidate.bookings[0]).toMatchObject({
      effectiveStartTime: "11:00:00",
      effectiveEndTime: "17:00:00",
    });
  });

  it("treats a home game without a venue as unbooked", async () => {
    const { matchId, venueId } = await seedHomeFixtureWithVenue();
    await ctx.db
      .update(matches)
      .set({ venueId: null })
      .where(eq(matches.id, matchId));
    await seedBooking({ venueId, date: "2026-03-14" });

    const body = (await (await get(matchId)).json()) as AlternativeDatesResponse;

    expect(body.isHomeGame).toBe(true);
    expect(body.candidates.every((c) => c.group === "unbooked")).toBe(true);
  });

  it("suggests a kickoff after the last booked game, using that entry's duration", async () => {
    const { matchId, leagueId, seasonId, venueId } = await seedHomeFixtureWithVenue();
    await seedTeamEntry(seasonId, OWN_SECOND_SQUAD, { estimatedGameDuration: 80 });
    const early = await seedHallGame({
      venueId,
      leagueId,
      kickoffDate: "2026-03-14",
      kickoffTime: "10:00:00",
    });
    const late = await seedHallGame({
      venueId,
      leagueId,
      kickoffDate: "2026-03-14",
      kickoffTime: "12:00:00",
    });
    await seedBooking({ venueId, date: "2026-03-14", matchIds: [early, late] });

    const candidate = await candidateOn(matchId, "2026-03-14");

    // 12:00 + 80 minutes of game + 45 minutes of buffer.
    expect(candidate.suggestedKickoffTime).toBe("14:05:00");
  });

  it("falls back to the configured default duration when the team entry has none", async () => {
    const { matchId, leagueId, seasonId, venueId } = await seedHomeFixtureWithVenue();
    await seedTeamEntry(seasonId, OWN_SECOND_SQUAD);
    const hallGame = await seedHallGame({
      venueId,
      leagueId,
      kickoffDate: "2026-03-14",
      kickoffTime: "12:00:00",
    });
    await seedBooking({ venueId, date: "2026-03-14", matchIds: [hallGame] });

    const candidate = await candidateOn(matchId, "2026-03-14");

    // 12:00 + 100 minutes of default duration + 45 minutes of buffer.
    expect(candidate.suggestedKickoffTime).toBe("14:25:00");
  });

  it("waits for the game that runs longest, not for the one that starts last", async () => {
    const { matchId, leagueId, seasonId, venueId } = await seedHomeFixtureWithVenue();
    await seedTeamEntry(seasonId, OWN_THIRD_SQUAD, { estimatedGameDuration: 240 });
    await seedTeamEntry(seasonId, OWN_SECOND_SQUAD, { estimatedGameDuration: 80 });
    const long = await seedHallGame({
      venueId,
      leagueId,
      kickoffDate: "2026-03-14",
      kickoffTime: "10:00:00",
      homeTeamApiId: OWN_THIRD_SQUAD,
    });
    const late = await seedHallGame({
      venueId,
      leagueId,
      kickoffDate: "2026-03-14",
      kickoffTime: "12:00:00",
    });
    await seedBooking({ venueId, date: "2026-03-14", matchIds: [long, late] });

    const candidate = await candidateOn(matchId, "2026-03-14");

    // The 10:00 game runs to 14:00, past the 12:00 one's 13:20; the hall is
    // busy until the last basket either way.
    expect(candidate.suggestedKickoffTime).toBe("14:45:00");
  });

  it("suggests nothing when the booked programme runs past midnight", async () => {
    const { matchId, leagueId, seasonId, venueId } = await seedHomeFixtureWithVenue();
    await seedTeamEntry(seasonId, OWN_SECOND_SQUAD, { estimatedGameDuration: 200 });
    const lateGame = await seedHallGame({
      venueId,
      leagueId,
      kickoffDate: "2026-03-14",
      kickoffTime: "22:00:00",
    });
    await seedBooking({ venueId, date: "2026-03-14", matchIds: [lateGame] });

    const candidate = await candidateOn(matchId, "2026-03-14");

    expect(candidate.group).toBe("booked");
    expect(candidate.suggestedKickoffTime).toBeNull();
  });

  it("ignores a cancelled game of the booking when suggesting a kickoff", async () => {
    const { matchId, leagueId, seasonId, venueId } = await seedHomeFixtureWithVenue();
    await seedTeamEntry(seasonId, OWN_SECOND_SQUAD, { estimatedGameDuration: 80 });
    const played = await seedHallGame({
      venueId,
      leagueId,
      kickoffDate: "2026-03-14",
      kickoffTime: "12:00:00",
    });
    const dead = await seedHallGame({
      venueId,
      leagueId,
      kickoffDate: "2026-03-14",
      kickoffTime: "15:00:00",
      isCancelled: true,
    });
    await seedBooking({ venueId, date: "2026-03-14", matchIds: [played, dead] });

    const candidate = await candidateOn(matchId, "2026-03-14");

    expect(candidate.suggestedKickoffTime).toBe("14:05:00");
  });

  it("suggests no kickoff for a booking nothing is linked to", async () => {
    const { matchId, venueId } = await seedHomeFixtureWithVenue();
    await seedBooking({ venueId, date: "2026-03-14" });

    const candidate = await candidateOn(matchId, "2026-03-14");

    expect(candidate.group).toBe("booked");
    expect(candidate.suggestedKickoffTime).toBeNull();
  });

  it("says a day is unbooked and suggests nothing for it", async () => {
    const { matchId, venueId } = await seedHomeFixtureWithVenue();
    await seedBooking({ venueId, date: "2026-03-14" });

    const candidate = await candidateOn(matchId, "2026-03-15");

    expect(candidate.group).toBe("unbooked");
    expect(candidate.bookings).toEqual([]);
    expect(candidate.suggestedKickoffTime).toBeNull();
  });

  it("does not show a booking of another hall", async () => {
    const { matchId, venueId } = await seedHomeFixtureWithVenue();
    const otherVenueId = await seedVenue("Turnhalle am Wald");
    await seedBooking({ venueId: otherVenueId, date: "2026-03-14" });
    await seedBooking({ venueId, date: "2026-03-21" });

    const body = (await (await get(matchId)).json()) as AlternativeDatesResponse;

    expect(body.candidates.filter((c) => c.group === "booked").map((c) => c.date)).toEqual([
      "2026-03-21",
    ]);
  });

  it("returns away candidates as dates alone, whatever the hall is booked for", async () => {
    await seedSquad(OWN_SQUAD, true);
    await seedSquad(OPPONENT_SQUAD, false);
    await seedSquad(THIRD_SQUAD, false);
    await seedSquad(FOURTH_SQUAD, false);
    const { leagueId } = await seedSeasonAndLeague();
    const venueId = await seedVenue("Halle des Gegners");
    await seedBookingConfig();
    const matchId = await seedMatch({
      homeTeamApiId: OPPONENT_SQUAD,
      guestTeamApiId: OWN_SQUAD,
      kickoffDate: "2026-03-07",
      venueId,
      leagueId,
    });
    await seedMatch({
      homeTeamApiId: THIRD_SQUAD,
      guestTeamApiId: FOURTH_SQUAD,
      kickoffDate: "2026-03-28",
      leagueId,
    });
    await seedBooking({ venueId, date: "2026-03-14" });

    const body = (await (await get(matchId)).json()) as AlternativeDatesResponse;

    expect(body.isHomeGame).toBe(false);
    expect(body.candidates.every((c) => c.group === "away")).toBe(true);
    expect(body.candidates.every((c) => c.bookings.length === 0)).toBe(true);
    expect(body.candidates.every((c) => c.suggestedKickoffTime === null)).toBe(true);
    // 2026-03-01 lies before the round (all fixtures share a match day), so it
    // carries the round flag and closes the list; the rest reads like a calendar.
    expect(body.candidates.map((c) => c.date)).toEqual([
      "2026-03-07",
      "2026-03-08",
      "2026-03-14",
      "2026-03-15",
      "2026-03-21",
      "2026-03-22",
      "2026-03-28",
      "2026-03-01",
    ]);
  });

  it("ranks booked days before unbooked ones, chronologically inside each group", async () => {
    const { matchId, venueId } = await seedHomeFixtureWithVenue();
    await seedBooking({ venueId, date: "2026-03-21" });
    await seedBooking({ venueId, date: "2026-03-14" });

    const dates = await candidateDates(matchId);

    // Booked days lead; inside the unbooked group 2026-03-01 is flagged (before
    // the round) and therefore closes the list.
    expect(dates).toEqual([
      "2026-03-14",
      "2026-03-21",
      "2026-03-07",
      "2026-03-08",
      "2026-03-15",
      "2026-03-22",
      "2026-03-28",
      "2026-03-01",
    ]);
  });

  it("ignores a booking outside the range", async () => {
    const { matchId, venueId } = await seedHomeFixtureWithVenue();
    await seedBooking({ venueId, date: "2026-03-21" });

    const body = (await (
      await get(matchId, "?from=2026-03-07&to=2026-03-15")
    ).json()) as AlternativeDatesResponse;

    expect(body.candidates.every((c) => c.group === "unbooked")).toBe(true);
  });
});

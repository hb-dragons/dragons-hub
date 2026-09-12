import { and, eq, gte, inArray, lte, max, min, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  leagues,
  matches,
  teamEntries,
  teamStaff,
  teams,
  venueBookingMatches,
  venueBookings,
} from "@dragons/db/schema";
import {
  clubWeekendDay,
  eachClubDay,
  teamDisplayName,
  todayInClubZone,
} from "@dragons/shared";
import type { AlternativeDatesQuery } from "@dragons/contracts";
import type {
  AlternativeDateBooking,
  AlternativeDateCandidate,
  AlternativeDateFlag,
  AlternativeDatesResponse,
  DateRange,
} from "@dragons/shared";
import { getDb } from "../../config/database";
import { queryMatchWithJoins } from "../admin/match-query.service";
import { getActiveSeasonId } from "../admin/season.service";
import {
  calculateTimeWindow,
  type BookingConfig,
  type BookingMatchInput,
} from "../venue-booking/booking-calculator";
import { getBookingConfig } from "../venue-booking/venue-booking.service";

/**
 * A game that will actually be played. Cancelled and forfeited fixtures are
 * dead: they block no day, stretch no horizon, widen no round window, fill no
 * hall and put no coach anywhere. Every read below asks for this and nothing
 * else.
 */
function isLiveFixture() {
  return and(eq(matches.isCancelled, false), eq(matches.isForfeited, false));
}

/** The parts of the game being moved that the collision read needs. */
interface MovingGame {
  id: number;
  leagueId: number | null;
  homeTeamApiId: number;
  guestTeamApiId: number;
  homeIsOwnClub: boolean | null;
  guestIsOwnClub: boolean | null;
}

/**
 * The weekend days in a range on which neither squad of a game already plays —
 * the answer a staff member owes the other club when a game has to move.
 *
 * A fixed handful of queries, whatever the range: the game itself, the league's
 * last fixture when the client left the end open, then — in parallel — every
 * game of either squad inside the range, the round window, the game's season
 * plus the days a staff person of the moving team entry is committed elsewhere,
 * and for a home game the hall's bookings, their games and the booking config.
 * Each is loaded once for the whole request; the weekends are walked in memory,
 * so a six-month range costs the same as a two-week one.
 *
 * Returns `null` when the match does not exist, so the route can answer 404.
 */
export async function findAlternativeDates(
  matchId: number,
  params: AlternativeDatesQuery = {},
): Promise<AlternativeDatesResponse | null> {
  const [match] = await queryMatchWithJoins().where(eq(matches.id, matchId)).limit(1);
  if (!match) return null;

  const isHomeGame = match.homeIsOwnClub === true;
  const range = await resolveRange(match.leagueId, params);
  const [busyDays, roundWindow, collisions, bookedDays] = await Promise.all([
    loadBusyDays(matchId, [match.homeTeamApiId, match.guestTeamApiId], range),
    loadRoundWindow(match.leagueId, match.matchDay),
    loadCoachCollisions(match, range),
    // Only a home game asks after the hall: on an away day the venue belongs to
    // the other club and its booking, if we even have one, means nothing here.
    // A home game the federation has named no venue for reads as unbooked,
    // which is what it is — there is no hall to hold a booking, and the staff
    // member has to settle that before a kickoff can be suggested for it.
    isHomeGame && match.venueId != null
      ? loadBookedDays(match.venueId, range)
      : Promise.resolve(new Map<string, BookedDay>()),
  ]);

  const candidates: AlternativeDateCandidate[] = [];
  for (const day of eachClubDay(range.from, range.to)) {
    const weekday = clubWeekendDay(day);
    if (!weekday || busyDays.has(day)) continue;
    const flags = flagsForDay(day, roundWindow, collisions);
    if (!isHomeGame) {
      candidates.push({
        date: day,
        weekday,
        group: "away",
        bookings: [],
        suggestedKickoffTime: null,
        flags,
      });
      continue;
    }
    const booked = bookedDays.get(day);
    candidates.push({
      date: day,
      weekday,
      group: booked ? "booked" : "unbooked",
      bookings: booked?.bookings ?? [],
      suggestedKickoffTime: booked?.suggestedKickoffTime ?? null,
      flags,
    });
  }

  return {
    isHomeGame,
    // Opponent games are known only for the leagues we sync, and no query can
    // tell the staff member what we never fetched.
    caveats: ["opponentGamesOutsideTrackedLeagues"],
    range,
    candidates: rank(candidates),
  };
}

/**
 * The order the panel and the copy text both use, so the mail to the other club
 * leads with the days nobody will argue about:
 *
 * 1. Days the hall is already ours come first — they need no new request to
 *    the town. An away game has one group and this step leaves it untouched.
 * 2. Inside a group, unflagged days before flagged ones.
 * 3. Inside that, the list reads like a calendar.
 */
function rank(candidates: AlternativeDateCandidate[]): AlternativeDateCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      Number(a.group === "unbooked") - Number(b.group === "unbooked") ||
      Number(a.flags.length > 0) - Number(b.flags.length > 0) ||
      a.date.localeCompare(b.date),
  );
}

/**
 * What the finder has to say about a day without refusing it. Both flags
 * inform: the round window is what the federation is likely to question, the
 * collision is a coach who would have to be in two halls at once.
 */
function flagsForDay(
  day: string,
  roundWindow: DateRange | null,
  collisions: Map<string, string[]>,
): AlternativeDateFlag[] {
  const flags: AlternativeDateFlag[] = [];
  if (roundWindow && (day < roundWindow.from || day > roundWindow.to)) {
    flags.push({ type: "outsideRoundWindow" });
  }
  for (const teamEntryName of collisions.get(day) ?? []) {
    flags.push({ type: "coachCollision", teamEntryName });
  }
  return flags;
}

/**
 * The span the league actually plays this match day over — usually one weekend,
 * sometimes a fortnight. A day outside it is the one the federation may
 * question, so it is flagged rather than dropped.
 *
 * Cancelled and forfeited fixtures are dead and must not stretch the window,
 * the same rule the range horizon follows. A game with no league has no round
 * to compare against and gets no flag at all.
 *
 * The game being moved counts towards its own window: it is part of the round,
 * and a game already standing outside it is not one the finder should start
 * flagging its own current date over.
 */
async function loadRoundWindow(
  leagueId: number | null,
  matchDay: number,
): Promise<DateRange | null> {
  if (leagueId == null) return null;

  const [row] = await getDb()
    .select({ from: min(matches.kickoffDate), to: max(matches.kickoffDate) })
    .from(matches)
    .where(
      and(
        eq(matches.leagueId, leagueId),
        eq(matches.matchDay, matchDay),
        isLiveFixture(),
      ),
    );

  return row?.from != null && row.to != null ? { from: row.from, to: row.to } : null;
}

/**
 * Per day inside the range, the other team entries that play it and share a
 * staff person with the team entry being moved — a trainer cannot coach two
 * games at once, whatever the role they hold on either team (ADR 0008/0009).
 *
 * One query for the whole range once the season is known: from our squad to its
 * entry for that season, across the people on it to their other entries of the
 * same season, and on to those entries' games. Only a game neither squad of
 * which is ours — or a club with no season at all — yields nothing.
 *
 * The games themselves are matched by squad id and date alone, as the busy-day
 * read does: a squad id is stable across seasons, and a range that reaches into
 * the next one is a range the staff member chose to ask about.
 */
async function loadCoachCollisions(
  match: MovingGame,
  range: DateRange,
): Promise<Map<string, string[]>> {
  const ownSquadApiId = match.homeIsOwnClub
    ? match.homeTeamApiId
    : match.guestIsOwnClub
      ? match.guestTeamApiId
      : null;
  if (ownSquadApiId == null) return new Map();

  const seasonId = await seasonOfGame(match.leagueId);
  if (seasonId == null) return new Map();

  const movingEntry = alias(teamEntries, "moving_entry");
  const movingStaff = alias(teamStaff, "moving_staff");
  const otherStaff = alias(teamStaff, "other_staff");
  const otherEntry = alias(teamEntries, "other_entry");
  const otherTeam = alias(teams, "other_team");

  const rows = await getDb()
    .select({
      date: matches.kickoffDate,
      name: otherTeam.name,
      nameShort: otherTeam.nameShort,
      customName: otherEntry.customName,
    })
    .from(teams)
    .innerJoin(
      movingEntry,
      and(eq(movingEntry.teamId, teams.id), eq(movingEntry.seasonId, seasonId)),
    )
    .innerJoin(movingStaff, eq(movingStaff.teamEntryId, movingEntry.id))
    .innerJoin(
      otherStaff,
      and(
        eq(otherStaff.personId, movingStaff.personId),
        ne(otherStaff.teamEntryId, movingEntry.id),
      ),
    )
    .innerJoin(
      otherEntry,
      and(eq(otherEntry.id, otherStaff.teamEntryId), eq(otherEntry.seasonId, seasonId)),
    )
    .innerJoin(otherTeam, eq(otherTeam.id, otherEntry.teamId))
    .innerJoin(
      matches,
      and(
        or(
          eq(matches.homeTeamApiId, otherTeam.apiTeamPermanentId),
          eq(matches.guestTeamApiId, otherTeam.apiTeamPermanentId),
        ),
        gte(matches.kickoffDate, range.from),
        lte(matches.kickoffDate, range.to),
        ne(matches.id, match.id),
        isLiveFixture(),
      ),
    )
    .where(eq(teams.apiTeamPermanentId, ownSquadApiId));

  // Two shared people on the same other entry are one collision, and the order
  // has to be the same on every request for the list not to shuffle.
  const byDay = new Map<string, Set<string>>();
  for (const row of rows) {
    const names = byDay.get(row.date) ?? new Set<string>();
    names.add(teamDisplayName(row));
    byDay.set(row.date, names);
  }
  return new Map([...byDay].map(([day, names]) => [day, [...names].sort()]));
}

/**
 * Which season's team entries the game belongs to. The league carries it
 * (`matches.leagueId` -> `leagues.seasonRefId`, as the booking reads do); a game
 * with no league falls back to the club's active season, so a friendly still
 * finds the people on the moving team entry. A round window has no such
 * fallback — without a league there is no round to compare against at all.
 */
async function seasonOfGame(leagueId: number | null): Promise<number | null> {
  if (leagueId == null) return getActiveSeasonId();

  const [row] = await getDb()
    .select({ seasonId: leagues.seasonRefId })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  return row?.seasonId ?? null;
}

/**
 * Whatever the client left out: today in the club's zone for the start, the
 * league's last fixture for the end. A league whose last fixture is already
 * past — or a game with no league at all — collapses the range onto today
 * rather than inventing a season end.
 *
 * Either end may still be defaulted past the other — a client asking only for
 * a `to` in the past would otherwise get today -> that day, a range that runs
 * backwards. The contract rejects such a range when the client states both
 * ends, so a defaulted end collapses onto the stated one instead.
 */
async function resolveRange(
  leagueId: number | null,
  params: AlternativeDatesQuery,
): Promise<DateRange> {
  const from = params.from ?? todayInClubZone();
  if (params.to) return { from: from > params.to ? params.to : from, to: params.to };

  const lastFixture = leagueId == null ? null : await lastLeagueFixtureDate(leagueId);
  return { from, to: lastFixture != null && lastFixture > from ? lastFixture : from };
}

/**
 * How far into the season the league still runs. Cancelled and forfeited
 * fixtures are dead and must not stretch the horizon past the last game that
 * will actually be played.
 */
async function lastLeagueFixtureDate(leagueId: number): Promise<string | null> {
  const [row] = await getDb()
    .select({ last: max(matches.kickoffDate) })
    .from(matches)
    .where(and(eq(matches.leagueId, leagueId), isLiveFixture()));
  return row?.last ?? null;
}

/** What one candidate day looks like when the hall is already booked. */
interface BookedDay {
  bookings: AlternativeDateBooking[];
  suggestedKickoffTime: string | null;
}

/**
 * The club's bookings at one venue inside the range, keyed by day, each with
 * the kickoff the game to be moved could take.
 *
 * That kickoff is the moment the hall frees up after the programme already
 * booked: the same end the booking calculator computes from the day's games,
 * which is the last game's kickoff plus its team entry's duration (the
 * configured default when the entry names none) plus the buffer after. A
 * booking nobody's game hangs off has nothing to derive it from, so it suggests
 * nothing.
 *
 * The booking's override end is deliberately not consulted: it says how long
 * the club may keep the hall, not when the programme inside it ends, and a
 * negotiated late end would push the suggestion into an empty gym. It is shown
 * beside the suggestion, so the staff member can see both.
 */
async function loadBookedDays(
  venueId: number,
  range: DateRange,
): Promise<Map<string, BookedDay>> {
  const bookings = await getDb()
    .select({
      id: venueBookings.id,
      date: venueBookings.date,
      calculatedStartTime: venueBookings.calculatedStartTime,
      calculatedEndTime: venueBookings.calculatedEndTime,
      overrideStartTime: venueBookings.overrideStartTime,
      overrideEndTime: venueBookings.overrideEndTime,
      status: venueBookings.status,
      needsReconfirmation: venueBookings.needsReconfirmation,
    })
    .from(venueBookings)
    .where(
      and(
        eq(venueBookings.venueId, venueId),
        gte(venueBookings.date, range.from),
        lte(venueBookings.date, range.to),
      ),
    )
    // A day carries one booking per venue today, but nothing in the response
    // shape says so: ordering here keeps two of them from swapping places
    // between two identical requests.
    .orderBy(venueBookings.id);
  if (bookings.length === 0) return new Map();

  const gamesByBooking = await loadBookedGames(bookings.map((b) => b.id));
  const config = await getBookingConfig();

  const days = new Map<string, BookedDay>();
  for (const booking of bookings) {
    const entry = days.get(booking.date) ?? {
      bookings: [],
      suggestedKickoffTime: suggestKickoff(gamesByBooking.get(booking.id) ?? [], config),
    };
    entry.bookings.push({
      id: booking.id,
      // An override end without an override start, or the other way round, is
      // half an agreement: each end stands on its own, as the booking screens
      // already show them.
      effectiveStartTime: booking.overrideStartTime ?? booking.calculatedStartTime,
      effectiveEndTime: booking.overrideEndTime ?? booking.calculatedEndTime,
      status: booking.status,
      needsReconfirmation: booking.needsReconfirmation,
    });
    days.set(booking.date, entry);
  }
  return days;
}

/**
 * When the hall frees up after the games already booked — the kickoff the game
 * being moved could take.
 *
 * This is the booking calculator's own end for those games, so the suggestion
 * and the hall window a reconcile would compute are the same number: the latest
 * game end (kickoff plus that team entry's duration, the configured default
 * when the entry names none) plus the buffer after. When an earlier game runs
 * longer than the last one, that latest end is the earlier game's, not the last
 * kickoff's — the hall is busy until the last basket either way.
 */
function suggestKickoff(games: BookingMatchInput[], config: BookingConfig): string | null {
  const end = calculateTimeWindow(games, config)?.calculatedEndTime;
  // The calculator clamps a window that runs past midnight to 23:59:59. That is
  // a fine end for a hall booking and a nonsense kickoff, so a day whose
  // programme runs that late suggests nothing at all.
  if (!end || end === "23:59:59") return null;
  return end;
}

/**
 * The live games each booking is made of, carrying the game duration of the
 * squad that plays them. Keyed by booking rather than by the games' own day, so
 * a junction row left behind by a game that has since moved cannot quietly
 * withhold the suggestion from the booking it still hangs off.
 */
async function loadBookedGames(
  bookingIds: number[],
): Promise<Map<number, BookingMatchInput[]>> {
  const rows = await getDb()
    .select({
      bookingId: venueBookingMatches.venueBookingId,
      kickoffTime: matches.kickoffTime,
      teamGameDuration: teamEntries.estimatedGameDuration,
    })
    .from(venueBookingMatches)
    .innerJoin(matches, eq(matches.id, venueBookingMatches.matchId))
    .leftJoin(leagues, eq(leagues.id, matches.leagueId))
    .leftJoin(teams, eq(teams.apiTeamPermanentId, matches.homeTeamApiId))
    .leftJoin(
      teamEntries,
      and(eq(teamEntries.teamId, teams.id), eq(teamEntries.seasonId, leagues.seasonRefId)),
    )
    .where(and(inArray(venueBookingMatches.venueBookingId, bookingIds), isLiveFixture()));

  const byBooking = new Map<number, BookingMatchInput[]>();
  for (const row of rows) {
    const games = byBooking.get(row.bookingId);
    const game = { kickoffTime: row.kickoffTime, teamGameDuration: row.teamGameDuration };
    if (games) games.push(game);
    else byBooking.set(row.bookingId, [game]);
  }
  return byBooking;
}

/**
 * The days inside the range on which either squad is already committed.
 * Cancelled and forfeited games are dead fixtures and block nothing, and the
 * game being moved must not block its own day.
 */
async function loadBusyDays(
  matchId: number,
  squadApiIds: number[],
  range: DateRange,
): Promise<Set<string>> {
  const rows = await getDb()
    .selectDistinct({ date: matches.kickoffDate })
    .from(matches)
    .where(
      and(
        gte(matches.kickoffDate, range.from),
        lte(matches.kickoffDate, range.to),
        ne(matches.id, matchId),
        isLiveFixture(),
        or(
          inArray(matches.homeTeamApiId, squadApiIds),
          inArray(matches.guestTeamApiId, squadApiIds),
        ),
      ),
    );
  return new Set(rows.map((r) => r.date));
}

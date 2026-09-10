import { and, eq, gte, inArray, lte, max, ne, or } from "drizzle-orm";
import {
  leagues,
  matches,
  teamEntries,
  teams,
  venueBookingMatches,
  venueBookings,
} from "@dragons/db/schema";
import { clubWeekendDay, eachClubDay, todayInClubZone } from "@dragons/shared";
import type { AlternativeDatesQuery } from "@dragons/contracts";
import type {
  AlternativeDateBooking,
  AlternativeDateCandidate,
  AlternativeDatesResponse,
  DateRange,
} from "@dragons/shared";
import { getDb } from "../../config/database";
import { queryMatchWithJoins } from "../admin/match-query.service";
import { calculateTimeWindow } from "../venue-booking/booking-calculator";
import { getBookingConfig } from "../venue-booking/venue-booking.service";

/**
 * The weekend days in a range on which neither squad of a game already plays —
 * the answer a staff member owes the other club when a game has to move.
 *
 * A fixed handful of queries, whatever the range: the game itself, the league's
 * last fixture when the client left the end open, every game of either squad
 * inside the range, and — for a home game — the hall's bookings, their games
 * and the booking config. The weekends are walked in memory, so a six-month
 * range costs the same as a two-week one.
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
  const busyDays = await loadBusyDays(
    matchId,
    [match.homeTeamApiId, match.guestTeamApiId],
    range,
  );
  // Only a home game asks after the hall: on an away day the venue belongs to
  // the other club and its booking, if we even have one, means nothing here.
  const bookedDays =
    isHomeGame && match.venueId != null
      ? await loadBookedDays(match.venueId, range)
      : new Map<string, BookedDay>();

  const candidates: AlternativeDateCandidate[] = [];
  for (const day of eachClubDay(range.from, range.to)) {
    const weekday = clubWeekendDay(day);
    if (!weekday || busyDays.has(day)) continue;
    if (!isHomeGame) {
      candidates.push({
        date: day,
        weekday,
        group: "away",
        bookings: [],
        suggestedKickoffTime: null,
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
 * Days the hall is already ours come first: they need no new request to the
 * town. Inside a group the list reads like a calendar. Away games are one
 * group, so the sort leaves them in the order the walk produced.
 */
function rank(candidates: AlternativeDateCandidate[]): AlternativeDateCandidate[] {
  const groupRank = { booked: 0, unbooked: 1, away: 0 } as const;
  return candidates.sort(
    (a, b) => groupRank[a.group] - groupRank[b.group] || a.date.localeCompare(b.date),
  );
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
    .where(
      and(
        eq(matches.leagueId, leagueId),
        eq(matches.isCancelled, false),
        eq(matches.isForfeited, false),
      ),
    );
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
    );
  if (bookings.length === 0) return new Map();

  const gamesByDay = await loadBookedGames(bookings.map((b) => b.id));
  const config = await getBookingConfig();

  const days = new Map<string, BookedDay>();
  for (const booking of bookings) {
    const entry = days.get(booking.date) ?? {
      bookings: [],
      suggestedKickoffTime:
        calculateTimeWindow(gamesByDay.get(booking.date) ?? [], config)?.calculatedEndTime ??
        null,
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
 * The live games behind those bookings, grouped by day and carrying the game
 * duration of the squad that plays them. Cancelled and forfeited fixtures are
 * dead: the booking planner does not count them towards the hall window, and
 * neither does the kickoff suggested behind it.
 */
async function loadBookedGames(
  bookingIds: number[],
): Promise<Map<string, { kickoffTime: string; teamGameDuration: number | null }[]>> {
  const rows = await getDb()
    .select({
      date: matches.kickoffDate,
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
    .where(
      and(
        inArray(venueBookingMatches.venueBookingId, bookingIds),
        eq(matches.isCancelled, false),
        eq(matches.isForfeited, false),
      ),
    );

  const byDay = new Map<string, { kickoffTime: string; teamGameDuration: number | null }[]>();
  for (const row of rows) {
    const games = byDay.get(row.date);
    const game = { kickoffTime: row.kickoffTime, teamGameDuration: row.teamGameDuration };
    if (games) games.push(game);
    else byDay.set(row.date, [game]);
  }
  return byDay;
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
        eq(matches.isCancelled, false),
        eq(matches.isForfeited, false),
        or(
          inArray(matches.homeTeamApiId, squadApiIds),
          inArray(matches.guestTeamApiId, squadApiIds),
        ),
      ),
    );
  return new Set(rows.map((r) => r.date));
}

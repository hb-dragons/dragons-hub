import { and, eq, gte, inArray, lte, max, ne, or } from "drizzle-orm";
import { matches } from "@dragons/db/schema";
import { clubWeekendDay, eachClubDay, todayInClubZone } from "@dragons/shared";
import type {
  AlternativeDateCandidate,
  AlternativeDatesResponse,
  DateRange,
} from "@dragons/shared";
import { getDb } from "../../config/database";
import { queryMatchWithJoins } from "../admin/match-query.service";

export type AlternativeDatesParams = Partial<DateRange>;

/**
 * The weekend days in a range on which neither squad of a game already plays —
 * the answer a staff member owes the other club when a game has to move.
 *
 * Two queries, whatever the range: the game itself, then every game of either
 * squad inside the range. The weekends are walked in memory, so a six-month
 * range costs the same as a two-week one.
 *
 * Returns `null` when the match does not exist, so the route can answer 404.
 */
export async function findAlternativeDates(
  matchId: number,
  params: AlternativeDatesParams = {},
): Promise<AlternativeDatesResponse | null> {
  const [match] = await queryMatchWithJoins().where(eq(matches.id, matchId)).limit(1);
  if (!match) return null;

  const range = await resolveRange(match.leagueId, params);
  const busyDays = await loadBusyDays(
    matchId,
    [match.homeTeamApiId, match.guestTeamApiId],
    range,
  );

  const candidates: AlternativeDateCandidate[] = [];
  for (const day of eachClubDay(range.from, range.to)) {
    const weekday = clubWeekendDay(day);
    if (!weekday || busyDays.has(day)) continue;
    candidates.push({ date: day, weekday });
  }

  return {
    isHomeGame: match.homeIsOwnClub === true,
    // Opponent games are known only for the leagues we sync, and no query can
    // tell the staff member what we never fetched.
    caveats: ["opponentGamesOutsideTrackedLeagues"],
    range,
    candidates,
  };
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
  params: AlternativeDatesParams,
): Promise<DateRange> {
  if (params.to) {
    const from = params.from ?? todayInClubZone();
    return { from: from > params.to ? params.to : from, to: params.to };
  }

  const from = params.from ?? todayInClubZone();
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

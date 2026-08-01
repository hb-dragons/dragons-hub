import { todayInClubZone } from "@dragons/shared";

/**
 * Pure reimplementation of the legacy `server/api/games/next.get.ts`
 * (dragons-app) week-window semantics, pinned to Europe/Berlin:
 *
 * 1. Every game whose kickoff date falls within the next seven club-zone
 *    calendar days (both bounds inclusive), capped at six.
 * 2. If that window is empty: the games of the Monday–Sunday week containing
 *    the next upcoming game — also capped at six (the legacy endpoint left
 *    this branch uncapped; plan Task C5 caps the util's result overall).
 * 3. No upcoming games at all: empty.
 *
 * "Today" is resolved in the club zone via the shared kickoff helpers, so a
 * UTC build server and a fan's phone in any timezone agree on the same list.
 * Week arithmetic never touches the runtime zone: `YYYY-MM-DD` strings are
 * mapped onto UTC-midnight `Date`s used purely as civil-day containers.
 */

const MAX_GAMES = 6;
const DAY_MS = 86_400_000;

interface KickoffLike {
  kickoffDate: string;
  kickoffTime: string;
}

function byKickoff(a: KickoffLike, b: KickoffLike): number {
  return (
    a.kickoffDate.localeCompare(b.kickoffDate) ||
    a.kickoffTime.localeCompare(b.kickoffTime)
  );
}

/**
 * Civil-day arithmetic on `YYYY-MM-DD` strings. The intermediate `Date` is a
 * UTC-midnight stand-in for the calendar day — never an instant — so
 * `toISOString` reads the same day back out and no timezone (or DST hour)
 * can shift the result.
 */
function addDays(day: string, days: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  return new Date(at.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Monday of the week containing the given calendar day. */
function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/**
 * The upcoming games the home page and next-game surfaces should show,
 * selected by the legacy week-window rules above. Accepts anything carrying
 * `kickoffDate`/`kickoffTime` (e.g. `MatchListItem`) and returns the caller's
 * own objects, sorted by kickoff.
 */
export function nextGames<T extends KickoffLike>(
  games: readonly T[],
  now: Date = new Date(),
): T[] {
  const today = todayInClubZone(now);
  const windowEnd = addDays(today, 7);

  const upcoming = games.filter((g) => g.kickoffDate >= today).sort(byKickoff);

  const inWindow = upcoming.filter((g) => g.kickoffDate <= windowEnd);
  if (inWindow.length > 0) return inWindow.slice(0, MAX_GAMES);

  const first = upcoming[0];
  if (!first) return [];

  // The fallback week always starts after `windowEnd` (a week overlapping
  // today would have put its games into the window), so filtering `upcoming`
  // is equivalent to the legacy all-games week query.
  const weekStart = mondayOf(first.kickoffDate);
  const weekEnd = addDays(weekStart, 6);
  return upcoming
    .filter((g) => g.kickoffDate >= weekStart && g.kickoffDate <= weekEnd)
    .slice(0, MAX_GAMES);
}

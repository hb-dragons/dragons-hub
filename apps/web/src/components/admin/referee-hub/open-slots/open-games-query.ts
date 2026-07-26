import type { RawRefereeGamesOpts } from "@/lib/referee-games-query";

/** The referee hub asks for one page of 200 games at a time. */
export const OPEN_GAMES_PAGE_SIZE = 200;

/**
 * The exact query `OpenGamesList` issues on first paint, i.e. with the default
 * hub filters (`status: "open"`, no league, no date range, both game types).
 *
 * `admin/referees/page.tsx` primes the SWR cache with the key derived from
 * these options. If the two drift apart the server round trip is written under
 * a key nobody reads and the pane still renders "Loading…", so both sides read
 * this constant instead of restating the query.
 */
export const OPEN_GAMES_PREFETCH_OPTS: RawRefereeGamesOpts = {
  status: "active",
  slotStatus: "open",
  gameType: "both",
  limit: OPEN_GAMES_PAGE_SIZE,
  offset: 0,
};

/** Cache keys of every open-games list page, for bulk revalidation. */
export const OPEN_GAMES_KEY_PREFIX = "/referee/games?";

/** True for any SWR key that holds an open-games list page. */
export function isOpenGamesListKey(key: unknown): boolean {
  return typeof key === "string" && key.startsWith(OPEN_GAMES_KEY_PREFIX);
}

import type { RawRefereeGamesOpts } from "@/lib/referee-games-query";
import type { HubFilters } from "../use-referee-hub-url";

/** The open-games filters a plain `/admin/referees` URL stands for. */
export const DEFAULT_FILTERS: HubFilters = {
  status: "open",
  league: [],
  dateFrom: null,
  dateTo: null,
  gameType: "both",
  search: "",
};

/** The referee hub asks for one page of 200 games at a time. */
export const OPEN_GAMES_PAGE_SIZE = 200;

/** The server ignores shorter search terms, so the query does too. */
const MIN_SEARCH_LENGTH = 3;

/**
 * The query for one page of the open-games list under the given filters.
 *
 * `admin/referees/page.tsx` primes the SWR cache with the first page under the
 * default filters, and `OpenGamesList` requests it on first paint. If the two
 * built the query separately and drifted apart, the server round trip would be
 * written under a key nobody reads and the pane would still render "Loading…",
 * so both go through here.
 *
 * With no start date the list begins at `today` (a Europe/Berlin `YYYY-MM-DD`),
 * not at the start of the season: a past game's open slot can no longer be
 * filled, and sorted oldest first those games sat on top of every list. A past
 * range is still reachable through the custom date filter.
 */
export function openGamesQueryOpts(
  filters: HubFilters,
  today: string,
  page = 0,
): RawRefereeGamesOpts {
  return {
    status: "active",
    // "any" sends no slotStatus: the server then returns everything active.
    slotStatus: filters.status === "any" ? undefined : filters.status,
    league: filters.league,
    dateFrom: filters.dateFrom ?? today,
    dateTo: filters.dateTo ?? undefined,
    gameType: filters.gameType,
    search: filters.search.length >= MIN_SEARCH_LENGTH ? filters.search : undefined,
    limit: OPEN_GAMES_PAGE_SIZE,
    offset: page * OPEN_GAMES_PAGE_SIZE,
  };
}

/** Cache keys of every open-games list page, for bulk revalidation. */
const OPEN_GAMES_KEY_PREFIX = "/referee/games?";

/** True for any SWR key that holds an open-games list page. */
export function isOpenGamesListKey(key: unknown): boolean {
  return typeof key === "string" && key.startsWith(OPEN_GAMES_KEY_PREFIX);
}

/**
 * The cache key for the first `pages` pages of a list whose first page is
 * cached under `firstPageKey`. One page is that key unchanged, so the server
 * prefetch still lands; more pages extend it, which keeps the key under
 * `OPEN_GAMES_KEY_PREFIX` and so inside the bulk revalidation an assignment
 * triggers.
 */
export function openGamesPagesKey(firstPageKey: string, pages: number): string {
  return pages === 1 ? firstPageKey : `${firstPageKey}&pages=${pages}`;
}

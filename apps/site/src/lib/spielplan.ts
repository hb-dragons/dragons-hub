/**
 * Domain logic behind the Spielplan island — the testable half of the port of
 * dragons-app `app/components/spielplan/Table.vue`. The legacy component
 * matched team names against string patterns ("Dragons" + "Hannover"/"HB");
 * the public API already resolves that per side via `homeIsOwnClub`/
 * `guestIsOwnClub`, so ownership flags replace the string sniffing 1:1.
 */

interface SpielplanSide {
  homeTeamName: string;
  guestTeamName: string;
  homeTeamCustomName: string | null;
  guestTeamCustomName: string | null;
  homeIsOwnClub: boolean;
  guestIsOwnClub: boolean;
  homeBadgeColor: string | null;
  guestBadgeColor: string | null;
}

/** The slice of `MatchListItem` the Spielplan filters and cards rely on. */
export interface SpielplanGame extends SpielplanSide {
  kickoffDate: string;
  kickoffTime: string;
}

export type GameLocationFilter = "all" | "home" | "away";

export interface TeamFilterOption {
  name: string;
  badgeColor: string | null;
}

/** A page shape structurally identical to the API's `PaginatedResponse`. */
interface MatchPage<T> {
  items: T[];
  hasMore: boolean;
}

export interface PageParams {
  limit: number;
  offset: number;
  sort: "asc";
}

/** Page size for the full-plan crawl; the API allows up to 1000. */
const PAGE_LIMIT = 500;

/**
 * The dragons team a game belongs to — the legacy `game.teamName` column:
 * the own club side's custom name ("Herren 1"), falling back to its
 * federation name, or empty when neither side is the own club.
 */
export function dragonsTeamName(game: SpielplanSide): string {
  if (game.homeIsOwnClub) return game.homeTeamCustomName ?? game.homeTeamName;
  if (game.guestIsOwnClub) return game.guestTeamCustomName ?? game.guestTeamName;
  return "";
}

export function isDragonsHomeGame(game: SpielplanSide): boolean {
  return game.homeIsOwnClub;
}

export function isDragonsAwayGame(game: SpielplanSide): boolean {
  return game.guestIsOwnClub;
}

/** Legacy `filteredGames`: team multi-select and home/away narrowing. */
export function filterGames<T extends SpielplanGame>(
  games: readonly T[],
  selectedTeams: ReadonlySet<string>,
  location: GameLocationFilter,
): T[] {
  return games.filter((game) => {
    if (!selectedTeams.has(dragonsTeamName(game))) return false;
    if (location === "home") return isDragonsHomeGame(game);
    if (location === "away") return isDragonsAwayGame(game);
    return true;
  });
}

/**
 * Legacy hardcoded its `mannschaften` list as Damen 1..3, Herren 1..2, then
 * U18 down to U12 — alphabetical except the youth teams, which run oldest
 * first. This comparator reproduces that order for whatever teams the data
 * actually contains.
 */
function compareTeamNames(a: string, b: string): number {
  const youthA = /^U(\d+)$/.exec(a);
  const youthB = /^U(\d+)$/.exec(b);
  if (youthA && youthB) return Number(youthB[1]) - Number(youthA[1]);
  if (youthA) return 1;
  if (youthB) return -1;
  return a.localeCompare(b, "de");
}

/**
 * The distinct dragons teams present in the plan, each with the badge color
 * of its first appearance, in the legacy filter order.
 */
export function teamFilterOptions(games: readonly SpielplanGame[]): TeamFilterOption[] {
  const byName = new Map<string, string | null>();
  for (const game of games) {
    const name = dragonsTeamName(game);
    if (!name || byName.has(name)) continue;
    byName.set(name, game.homeIsOwnClub ? game.homeBadgeColor : game.guestBadgeColor);
  }
  return [...byName.entries()]
    .sort(([a], [b]) => compareTeamNames(a, b))
    .map(([name, badgeColor]) => ({ name, badgeColor }));
}

/** Groups an already date-sorted plan into per-day sections for the cards. */
export function groupByDate<T extends SpielplanGame>(
  games: readonly T[],
): Array<{ date: string; games: T[] }> {
  const sections: Array<{ date: string; games: T[] }> = [];
  for (const game of games) {
    const last = sections[sections.length - 1];
    if (last && last.date === game.kickoffDate) {
      last.games.push(game);
    } else {
      sections.push({ date: game.kickoffDate, games: [game] });
    }
  }
  return sections;
}

/**
 * Crawls every page of `/public/matches` (the API caps a page at 1000 rows)
 * into the full season plan. The empty-page guard means a server that keeps
 * claiming `hasMore` can never loop the island forever.
 */
export async function fetchFullPlan<T>(
  getPage: (params: PageParams) => Promise<MatchPage<T>>,
): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await getPage({ limit: PAGE_LIMIT, offset, sort: "asc" });
    items.push(...page.items);
    if (!page.hasMore || page.items.length === 0) return items;
    offset += page.items.length;
  }
}

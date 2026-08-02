import type { MatchQueryParams } from "@dragons/api-client";
import { CLUB_TIME_ZONE, clubDayAnchor } from "@dragons/shared";

/**
 * Domain logic behind the team pages' Spielplan tab and next/previous-game
 * islands — the testable half of the port of dragons-app
 * `app/components/spielplan/Table.vue` in team mode (the games table on
 * `/teams/[slug]`) plus `server/api/games/{next,prev}-team.get.ts`.
 *
 * The legacy endpoints filtered by the CMS team name; the public API filters
 * by `teamApiId` (the CMS team's `apiTeamPermanentId` join key) instead —
 * plan Task C5 Step 4.
 */

/** The slice of `MatchListItem` the team games table renders. */
export interface TeamTableGame {
  kickoffDate: string;
  kickoffTime: string;
  homeTeamName: string;
  guestTeamName: string;
  homeIsOwnClub: boolean;
  guestIsOwnClub: boolean;
  homeScore: number | null;
  guestScore: number | null;
  venueName: string | null;
  venueNameOverride: string | null;
  publicComment: string | null;
}

/**
 * Legacy table label: `new Date(date).toLocaleString("de-DE", { weekday:
 * "short", … })` on a Berlin server — pinned to Europe/Berlin here so every
 * runtime renders the same day (same approach as src/lib/game-format.ts).
 */
const TABLE_DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  timeZone: CLUB_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

/** `2025-09-13` → `Sa., 13.09.25`. */
export function formatTableDate(date: string): string {
  const anchor = clubDayAnchor(date);
  if (Number.isNaN(anchor.getTime())) return date;
  return TABLE_DATE_FMT.format(anchor);
}

/** Legacy team-mode result cell: `72:46`, or a bare `:` while unplayed. */
export function tableResult(game: TeamTableGame): string {
  if (game.homeScore == null || game.guestScore == null) return ":";
  return `${game.homeScore}:${game.guestScore}`;
}

/** Own club sides collapse to "Dragons", opponents keep their name. */
export function tableSideLabel(name: string, isOwnClub: boolean): string {
  if (isOwnClub) return "Dragons";
  return name || "-";
}

/** Halle column: override, synced venue name, dash. */
export function tableVenue(game: TeamTableGame): string {
  return game.venueNameOverride ?? game.venueName ?? "-";
}

/**
 * Legacy hardcoded local rivals whose games render the derby gradient (same
 * list the Excel export's Kommentar column uses).
 */
const DERBY_TEAMS = ["Ahlem", "Linden Dudes"];

function isDerbyGame(game: TeamTableGame): boolean {
  return DERBY_TEAMS.some(
    (team) => game.homeTeamName.includes(team) || game.guestTeamName.includes(team),
  );
}

/**
 * Port of the legacy `tableMeta.class.tr` row styling: own home games get the
 * primary tint, derbies a red gradient, rescheduled games ("verlegt" in the
 * comment) are muted. The legacy `primary-300`/`primary-800` shades were Nuxt
 * UI's green ramp — mapped to Tailwind's green scale, which site.css keeps as
 * the primary hue.
 */
export function teamGameRowClass(game: TeamTableGame): string {
  const classes: string[] = [];
  if (game.homeIsOwnClub) {
    classes.push(
      isDerbyGame(game)
        ? "bg-gradient-to-r dark:from-red-500/25 to-15% dark:to-green-300/10 from-red-800/20 to-green-800/10"
        : "dark:bg-green-300/10 bg-green-800/10",
    );
  } else if (isDerbyGame(game)) {
    classes.push("bg-gradient-to-r dark:from-red-500/25 from-red-800/20 to-15%");
  }
  if (game.publicComment?.includes("verlegt")) classes.push("text-muted-foreground");
  return classes.join(" ");
}

export type KickoffSortDirection = "asc" | "desc";

/** Date-then-time sort behind the legacy table's sortable Datum column. */
export function sortGamesByKickoff<T extends Pick<TeamTableGame, "kickoffDate" | "kickoffTime">>(
  games: readonly T[],
  direction: KickoffSortDirection,
): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...games].sort(
    (a, b) =>
      sign *
      (a.kickoffDate.localeCompare(b.kickoffDate) || a.kickoffTime.localeCompare(b.kickoffTime)),
  );
}

/**
 * Query for the team's next game — first match from today on, ascending
 * (plan Task C5 Step 4: `?teamApiId&dateFrom&sort=asc&limit=1`).
 */
export function nextGameParams(teamApiId: number, today: string): MatchQueryParams {
  return { teamApiId, dateFrom: today, sort: "asc", limit: 1 };
}

/**
 * Query for the team's previous game — latest scored match up to today,
 * descending (`?teamApiId&dateTo&sort=desc&hasScore=true&limit=1`).
 */
export function prevGameParams(teamApiId: number, today: string): MatchQueryParams {
  return { teamApiId, dateTo: today, sort: "desc", hasScore: true, limit: 1 };
}

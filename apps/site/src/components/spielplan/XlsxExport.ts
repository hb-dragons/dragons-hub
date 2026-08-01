import { CLUB_TIME_ZONE, clubDayAnchor, todayInClubZone } from "@dragons/shared";
import { formatGameTime } from "../../lib/game-format";
import { dragonsTeamName, type SpielplanGame } from "../../lib/spielplan";

/**
 * Client-side Excel export — the port of `handleExportToExcel` in dragons-app
 * `app/components/spielplan/Table.vue` (lines 108–140): same `xlsx` library,
 * same columns, same cell values. The library is imported lazily inside the
 * handler so its ~400 KB never load unless someone actually exports.
 */

/** The extra fields the export needs beyond what the filters use. */
export interface SpielplanExportGame extends SpielplanGame {
  matchNo: number;
  leagueName: string | null;
  venueName: string | null;
  venueNameOverride: string | null;
  homeScore: number | null;
  guestScore: number | null;
  publicComment: string | null;
}

interface SpielplanRow {
  "Nr.": number;
  Datum: string;
  Uhrzeit: string;
  Team: string;
  Liga: string;
  Heim: string;
  Gast: string;
  Halle: string;
  Ergebnis: string;
  Kommentar: string;
}

/**
 * Legacy `new Date(date).toLocaleDateString("de-DE", …)` ran on a Berlin
 * server; pinning the zone makes the exported label device-independent.
 */
const EXPORT_DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  timeZone: CLUB_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

function exportDate(date: string): string {
  const anchor = clubDayAnchor(date);
  return Number.isNaN(anchor.getTime()) ? date : EXPORT_DATE_FMT.format(anchor);
}

/** Legacy hardcoded local rivals whose games get the "Derby" comment. */
const DERBY_TEAMS = ["Ahlem", "Linden Dudes"];

function isDerbyGame(game: SpielplanExportGame): boolean {
  return DERBY_TEAMS.some(
    (team) => game.homeTeamName.includes(team) || game.guestTeamName.includes(team),
  );
}

function comment(game: SpielplanExportGame): string {
  const publicComment = game.publicComment ?? "";
  if (!isDerbyGame(game)) return publicComment;
  return publicComment ? `Derby | ${publicComment}` : "Derby";
}

function result(game: SpielplanExportGame): string {
  if (game.homeScore == null || game.guestScore == null) return "-";
  return `${game.homeScore}:${game.guestScore}`;
}

/** The legacy column set, in the legacy order, one row per game. */
export function buildSpielplanRows(games: readonly SpielplanExportGame[]): SpielplanRow[] {
  return games.map((game) => ({
    "Nr.": game.matchNo,
    Datum: exportDate(game.kickoffDate),
    Uhrzeit: formatGameTime(game.kickoffTime),
    Team: dragonsTeamName(game),
    Liga: game.leagueName ?? "",
    Heim: game.homeIsOwnClub ? "Dragons" : game.homeTeamName || "-",
    Gast: game.guestIsOwnClub ? "Dragons" : game.guestTeamName || "-",
    Halle: game.venueNameOverride ?? game.venueName ?? "",
    Ergebnis: result(game),
    Kommentar: comment(game),
  }));
}

/**
 * Builds and downloads `spielplan_<club day>.xlsx`. No-op on an empty plan,
 * exactly like the legacy guard on the export button handler.
 */
export async function exportSpielplanXlsx(
  games: readonly SpielplanExportGame[],
  now: Date = new Date(),
): Promise<void> {
  if (games.length === 0) return;

  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(buildSpielplanRows(games));
  // Legacy sized one column per ColumnTranslationMapping entry — 11 entries,
  // including the admin-only "actions" column — kept for identical output.
  worksheet["!cols"] = Array.from({ length: 11 }, () => ({ width: 15 }));
  XLSX.utils.book_append_sheet(workbook, worksheet, "Spielplan");
  XLSX.writeFile(workbook, `spielplan_${todayInClubZone(now)}.xlsx`);
}

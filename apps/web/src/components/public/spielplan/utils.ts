import type { MatchListItem } from "@dragons/shared";
import { CLUB_TIME_ZONE, clubDayAnchor } from "@dragons/shared";
import { cn } from "@dragons/ui/lib/utils";
import {
  formatMatchTime,
  formatScore,
  getOwnTeamLabel,
} from "@/components/admin/matches/utils";

/**
 * Local rival clubs whose games the legacy spielplan highlighted. Matched by
 * substring against the federation team names, same as the legacy app.
 */
const DERBY_TEAMS = ["Ahlem", "Linden Dudes"];

type DerbySides = Pick<MatchListItem, "homeTeamName" | "guestTeamName">;

export function isDerbyGame(match: DerbySides): boolean {
  return DERBY_TEAMS.some(
    (team) => match.homeTeamName.includes(team) || match.guestTeamName.includes(team),
  );
}

export function withDerbyPrefix(comment: string | null, derby: boolean): string {
  if (!derby) return comment ?? "";
  return comment ? `Derby | ${comment}` : "Derby";
}

type RowClassMatch = DerbySides &
  Pick<MatchListItem, "homeIsOwnClub" | "isCancelled" | "isForfeited" | "publicComment">;

export function spielplanRowClass(match: RowClassMatch): string {
  return cn(
    match.homeIsOwnClub && "border-l-2 border-l-primary/50 bg-primary/5",
    isDerbyGame(match) && "bg-heat/10",
    match.publicComment?.includes("verlegt") && "text-muted-foreground",
    match.isCancelled && "line-through text-muted-foreground opacity-60",
    match.isForfeited && "line-through text-muted-foreground opacity-40",
  );
}

export interface SpielplanExportRow {
  "Nr.": number;
  Datum: string;
  Uhrzeit: string;
  Team: string;
  Liga: string;
  Heim: string;
  Gast: string;
  Halle: string;
  Ergebnis: string;
  Anschreiber: string;
  Zeitnehmer: string;
  Shotclock: string;
  Kommentar: string;
}

/**
 * Pinned to the club zone so the exported label is device-independent —
 * `toLocaleDateString` without a zone renders the day the *coach's* machine
 * is in, which is off by one east of the date line.
 */
const EXPORT_DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  timeZone: CLUB_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

function exportDate(kickoffDate: string): string {
  const anchor = clubDayAnchor(kickoffDate);
  return Number.isNaN(anchor.getTime()) ? kickoffDate : EXPORT_DATE_FMT.format(anchor);
}

export function buildSpielplanExportRows(
  games: readonly MatchListItem[],
): SpielplanExportRow[] {
  return games.map((game) => ({
    "Nr.": game.matchNo,
    Datum: exportDate(game.kickoffDate),
    Uhrzeit: formatMatchTime(game.kickoffTime),
    Team: getOwnTeamLabel(game),
    Liga: game.leagueName ?? "",
    Heim: game.homeIsOwnClub ? "Dragons" : game.homeTeamName,
    Gast: game.homeIsOwnClub ? game.guestTeamName : "Dragons",
    Halle: game.venueNameOverride ?? game.venueName ?? "",
    Ergebnis: formatScore(game.homeScore, game.guestScore),
    Anschreiber: game.anschreiber ?? "",
    Zeitnehmer: game.zeitnehmer ?? "",
    Shotclock: game.shotclock ?? "",
    Kommentar: withDerbyPrefix(game.publicComment, isDerbyGame(game)),
  }));
}

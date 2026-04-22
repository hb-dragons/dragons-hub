import type {
  HistoryGameItem,
  HistoryLeaderboardEntry,
} from "@dragons/shared";

const NEEDS_QUOTES = /[",\r\n]/;

function escape(field: string): string {
  if (!NEEDS_QUOTES.test(field)) return field;
  return `"${field.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escape).join(",")];
  for (const r of rows) lines.push(r.map(escape).join(","));
  return lines.join("\r\n") + "\r\n";
}

export const GAMES_CSV_HEADERS = [
  "id", "matchId", "matchNo",
  "kickoffDate", "kickoffTime",
  "homeTeamName", "guestTeamName",
  "leagueShort", "leagueName",
  "venueName", "venueCity",
  "sr1OurClub", "sr2OurClub",
  "sr1Name", "sr2Name",
  "sr1Status", "sr2Status",
  "isCancelled", "isForfeited", "isHomeGame",
];

function str(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function gamesToCsvRows(items: HistoryGameItem[]): string[][] {
  return items.map((g) => [
    str(g.id), str(g.matchId), str(g.matchNo),
    str(g.kickoffDate), str(g.kickoffTime),
    str(g.homeTeamName), str(g.guestTeamName),
    str(g.leagueShort), str(g.leagueName),
    str(g.venueName), str(g.venueCity),
    str(g.sr1OurClub), str(g.sr2OurClub),
    str(g.sr1Name), str(g.sr2Name),
    str(g.sr1Status), str(g.sr2Status),
    str(g.isCancelled), str(g.isForfeited), str(g.isHomeGame),
  ]);
}

export const LEADERBOARD_CSV_HEADERS = [
  "rank", "displayName", "isOwnClub",
  "refereeApiId", "refereeId",
  "sr1Count", "sr2Count", "total",
  "lastRefereedDate",
];

export function leaderboardToCsvRows(
  entries: HistoryLeaderboardEntry[],
): string[][] {
  return entries.map((e, i) => [
    String(i + 1),
    e.displayName,
    String(e.isOwnClub),
    str(e.refereeApiId),
    str(e.refereeId),
    String(e.sr1Count),
    String(e.sr2Count),
    String(e.total),
    str(e.lastRefereedDate),
  ]);
}

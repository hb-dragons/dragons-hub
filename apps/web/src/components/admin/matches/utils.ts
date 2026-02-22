import type { MatchDetail, MatchListItem } from "./types";

export function formatMatchDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function formatMatchTime(timeStr: string): string {
  // timeStr is "HH:MM:SS" or "HH:MM"
  return timeStr.slice(0, 5);
}

export function formatScore(
  homeScore: number | null,
  guestScore: number | null,
): string {
  if (homeScore == null || guestScore == null) return "—";
  return `${homeScore}:${guestScore}`;
}

/** Format period scores as an array of [home, guest] pairs for display */
export function formatPeriodScores(match: MatchDetail): { label: string; home: number | null; guest: number | null }[] {
  // Detect achtel from actual data even if periodFormat says "quarters":
  // 1. Q5-Q8 have values → definitely achtel
  // 2. OT deltas are negative → bogus OT from achtel misdetection (scores can't be negative)
  const hasQ5to8 = match.homeQ5 != null || match.guestQ5 != null
    || match.homeQ6 != null || match.guestQ6 != null
    || match.homeQ7 != null || match.guestQ7 != null
    || match.homeQ8 != null || match.guestQ8 != null;
  const hasNegativeOt =
    (match.homeOt1 != null && match.homeOt1 < 0)
    || (match.guestOt1 != null && match.guestOt1 < 0)
    || (match.homeOt2 != null && match.homeOt2 < 0)
    || (match.guestOt2 != null && match.guestOt2 < 0);
  const isAchtel = match.periodFormat === "achtel" || hasQ5to8 || hasNegativeOt;
  const effectiveFormat = isAchtel ? "achtel" : match.periodFormat;

  if (!effectiveFormat) return [];

  const periods: { label: string; home: number | null; guest: number | null }[] = [];

  const periodCount = isAchtel ? 8 : 4;
  const periodKeys = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8"] as const;

  for (let i = 0; i < periodCount; i++) {
    const key = periodKeys[i]!;
    const homeKey = `home${key}` as keyof MatchDetail;
    const guestKey = `guest${key}` as keyof MatchDetail;
    periods.push({
      label: isAchtel ? `A${i + 1}` : `Q${i + 1}`,
      home: match[homeKey] as number | null,
      guest: match[guestKey] as number | null,
    });
  }

  // Only add overtime if values are non-negative (negative deltas indicate
  // achtel misdetection where OT fields contain garbage data)
  const ot1Valid = (match.homeOt1 != null || match.guestOt1 != null)
    && (match.homeOt1 == null || match.homeOt1 >= 0)
    && (match.guestOt1 == null || match.guestOt1 >= 0);
  const ot2Valid = (match.homeOt2 != null || match.guestOt2 != null)
    && (match.homeOt2 == null || match.homeOt2 >= 0)
    && (match.guestOt2 == null || match.guestOt2 >= 0);
  if (ot1Valid) {
    periods.push({ label: "OT1", home: match.homeOt1, guest: match.guestOt1 });
  }
  if (ot2Valid) {
    periods.push({ label: "OT2", home: match.homeOt2, guest: match.guestOt2 });
  }

  return periods;
}

export function getOwnTeamLabel(match: MatchListItem): string {
  if (match.homeIsOwnClub) {
    return match.homeTeamCustomName ?? match.homeTeamNameShort ?? match.homeTeamName;
  }
  return match.guestTeamCustomName ?? match.guestTeamNameShort ?? match.guestTeamName;
}

export function getOpponentName(match: MatchListItem): string {
  if (match.homeIsOwnClub) {
    return match.guestTeamName;
  }
  return match.homeTeamName;
}

// Deterministic color palette for team badges
const TEAM_COLORS = [
  { bg: "bg-blue-800", border: "border-blue-600", text: "text-blue-100" },
  { bg: "bg-teal-700", border: "border-teal-500", text: "text-teal-100" },
  { bg: "bg-green-700", border: "border-green-500", text: "text-green-100" },
  { bg: "bg-orange-700", border: "border-orange-500", text: "text-orange-100" },
  { bg: "bg-rose-800", border: "border-rose-600", text: "text-rose-100" },
  { bg: "bg-pink-700", border: "border-pink-500", text: "text-pink-100" },
  { bg: "bg-cyan-700", border: "border-cyan-500", text: "text-cyan-100" },
  { bg: "bg-indigo-700", border: "border-indigo-500", text: "text-indigo-100" },
  { bg: "bg-emerald-800", border: "border-emerald-600", text: "text-emerald-100" },
  { bg: "bg-violet-700", border: "border-violet-500", text: "text-violet-100" },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getTeamColor(teamName: string) {
  const index = hashString(teamName) % TEAM_COLORS.length;
  return TEAM_COLORS[index]!;
}

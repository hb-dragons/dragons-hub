import type { MatchDetail, MatchListItem } from "./types";

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
  if (!match.periodFormat) return [];

  const periods: { label: string; home: number | null; guest: number | null }[] = [];

  const periodKeys = ["Q1", "Q2", "Q3", "Q4"] as const;
  for (const key of periodKeys) {
    const homeKey = `home${key}` as keyof MatchDetail;
    const guestKey = `guest${key}` as keyof MatchDetail;
    periods.push({
      label: key,
      home: match[homeKey] as number | null,
      guest: match[guestKey] as number | null,
    });
  }

  if (match.homeOt1 != null || match.guestOt1 != null) {
    periods.push({ label: "OT1", home: match.homeOt1, guest: match.guestOt1 });
  }
  if (match.homeOt2 != null || match.guestOt2 != null) {
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

import { getColorPreset } from "@dragons/shared";
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

// Re-export for admin badge usage: returns { bg, border, text } for current color scheme
export function getTeamColor(teamName: string, badgeColor?: string | null) {
  const preset = getColorPreset(badgeColor, teamName);
  // Admin always uses dark mode style (dark bg, light text) for badge contrast
  return preset.dark;
}

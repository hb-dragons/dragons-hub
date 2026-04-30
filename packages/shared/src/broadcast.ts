import type { PublicLiveSnapshot } from "./scoreboard";

export type BroadcastPhase = "idle" | "pregame" | "live";

export interface BroadcastMatchTeam {
  name: string;       // customName ?? name
  abbr: string;       // homeAbbr / guestAbbr or derived fallback
  color: string;      // homeColorOverride / guestColorOverride or team.badgeColor
  clubId: number;     // for /assets/clubs/<clubId>.webp
}

export interface BroadcastMatch {
  id: number;
  kickoffDate: string;       // ISO date
  kickoffTime: string;       // "HH:MM:SS"
  league: { id: number; name: string } | null;
  home: BroadcastMatchTeam;
  guest: BroadcastMatchTeam;
}

export interface BroadcastState {
  deviceId: string;
  isLive: boolean;
  phase: BroadcastPhase;
  match: BroadcastMatch | null;
  scoreboard: PublicLiveSnapshot | null;
  stale: boolean;            // true when last frame > 30s ago while isLive
  startedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
}

export interface BroadcastConfig {
  deviceId: string;
  matchId: number | null;
  isLive: boolean;
  homeAbbr: string | null;
  guestAbbr: string | null;
  homeColorOverride: string | null;
  guestColorOverride: string | null;
  startedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
}

export interface AdminBroadcastMatchListItem {
  id: number;
  kickoffDate: string;
  kickoffTime: string;
  homeName: string;
  guestName: string;
  leagueName: string | null;
}

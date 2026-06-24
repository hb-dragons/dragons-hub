export type SeasonStatus = "upcoming" | "active" | "archived";

export const SEASON_STATUSES: readonly SeasonStatus[] = [
  "upcoming",
  "active",
  "archived",
] as const;

export interface Season {
  id: number;
  name: string;
  sdkSeasonId: number | null;
  status: SeasonStatus;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeasonWithCounts extends Season {
  leagueCount: number;
}

export interface BrowsableLeague {
  ligaId: number;
  ligaNr: number | null;
  name: string;
  skName: string;
  akName: string;
  geschlecht: string;
  vorabliga: boolean;
  alreadyTracked: boolean;
}

export interface SetSeasonLeaguesResult {
  tracked: number;
  untracked: number;
}

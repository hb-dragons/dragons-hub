// Type exports only — the SettingsProvider has been replaced by SWR.
// Keep this file so existing imports from "./settings-provider" still resolve.

export interface ClubConfig {
  clubId: number;
  clubName: string;
}

export interface TrackedLeague {
  id: number;
  ligaNr: number;
  name: string;
  seasonName: string;
  ownClubRefs: boolean;
}

export interface TrackedLeaguesResponse {
  leagueNumbers: number[];
  leagues: Array<TrackedLeague & { apiLigaId: number }>;
}

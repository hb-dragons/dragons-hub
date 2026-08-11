import type { SdkLigaData } from "./liga";

export interface SdkClubSearchResult {
  vereinId: number;
  vereinsname: string;
  vereinsnummer: number;
  kontaktData: unknown;
}

export interface SdkClubMatch {
  matchId: number;
  // The club-matches endpoint nests the league under `ligaData` (same shape as
  // the spielplan/tabelle responses), not `competition`.
  ligaData: SdkLigaData;
}

export interface SdkClubMatchesResponse {
  club: {
    vereinId: number;
    vereinsname: string;
  };
  matches: SdkClubMatch[];
}

export interface SdkClubSearchResult {
  vereinId: number;
  vereinsname: string;
  vereinsnummer: number;
  kontaktData: unknown;
}

export interface SdkDiscoveredCompetition {
  ligaId: number;
  liganr: number;
  liganame: string;
  seasonId: number;
  seasonName: string;
  akName: string;
  geschlecht: string;
  skName: string;
  verbandId: number;
  verbandName: string;
}

export interface SdkClubMatch {
  matchId: number;
  competition: SdkDiscoveredCompetition;
}

export interface SdkClubMatchesResponse {
  club: {
    vereinId: number;
    vereinsname: string;
  };
  matches: SdkClubMatch[];
}

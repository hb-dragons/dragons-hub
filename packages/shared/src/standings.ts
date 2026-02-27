export interface StandingItem {
  position: number;
  teamName: string;
  teamNameShort: string | null;
  isOwnClub: boolean;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  leaguePoints: number;
}

export interface LeagueStandings {
  leagueId: number;
  leagueName: string;
  seasonName: string;
  standings: StandingItem[];
}

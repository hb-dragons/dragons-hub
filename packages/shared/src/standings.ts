export interface StandingItem {
  position: number;
  teamApiId: number;
  clubId: number;
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
  /** True when the team withdrew from the league (legacy site's "resigned" row state). */
  verzicht: boolean;
}

export interface LeagueStandings {
  leagueId: number;
  leagueName: string;
  seasonName: string;
  standings: StandingItem[];
}

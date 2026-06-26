export interface ResolvedLeague {
  ligaNr: number;
  ligaId: number;
  name: string;
  seasonName: string;
}

export interface ResolveResult {
  resolved: ResolvedLeague[];
  notFound: number[];
  tracked: number;
  untracked: number;
}

export interface TrackedLeague {
  id: number;
  ligaNr: number;
  apiLigaId: number;
  name: string;
  seasonName: string;
  ownClubRefs: boolean;
}

export interface TrackedLeaguesResponse {
  leagueNumbers: number[];
  leagues: TrackedLeague[];
}

export interface LeagueTeam {
  teamPermanentId: number;
  name: string;
  clubId: number | null;
  isOwnClub: boolean;
}

export interface LeagueTeamsResponse {
  teams: LeagueTeam[];
}

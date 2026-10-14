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

interface TrackedLeague {
  id: number;
  ligaNr: number;
  apiLigaId: number;
  name: string;
  seasonName: string;
  ownClubRefs: boolean;
  /** A cup runs beside a squad's regular league and never becomes its team entry's league. */
  isCup: boolean;
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

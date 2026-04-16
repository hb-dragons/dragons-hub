import type { MatchListItem } from "./matches";

export interface PreviousMeeting {
  matchId: number;
  date: string;
  homeTeamName: string;
  guestTeamName: string;
  homeScore: number;
  guestScore: number;
  isWin: boolean;
  homeIsOwnClub: boolean;
}

export interface HeadToHead {
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  previousMeetings: PreviousMeeting[];
}

export interface FormEntry {
  result: "W" | "L";
  matchId: number;
}

export interface MatchContext {
  headToHead: HeadToHead;
  homeForm: FormEntry[];
  guestForm: FormEntry[];
}

export interface TeamStats {
  teamId: number;
  leagueName: string;
  position: number | null;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  form: FormEntry[];
}

export interface ClubStats {
  teamCount: number;
  totalWins: number;
  totalLosses: number;
  winPercentage: number;
}

export interface HomeDashboard {
  nextGame: MatchListItem | null;
  recentResults: MatchListItem[];
  upcomingGames: MatchListItem[];
  clubStats: ClubStats;
}

export interface PublicMatchDetail extends MatchListItem {
  homeHalftimeScore: number | null;
  guestHalftimeScore: number | null;
  periodFormat: string | null;
  homeQ1: number | null; guestQ1: number | null;
  homeQ2: number | null; guestQ2: number | null;
  homeQ3: number | null; guestQ3: number | null;
  homeQ4: number | null; guestQ4: number | null;
  homeQ5: number | null; guestQ5: number | null;
  homeQ6: number | null; guestQ6: number | null;
  homeQ7: number | null; guestQ7: number | null;
  homeQ8: number | null; guestQ8: number | null;
  homeOt1: number | null; guestOt1: number | null;
  homeOt2: number | null; guestOt2: number | null;
}

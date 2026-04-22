export type HistoryMode = "obligation" | "activity";
export type HistoryStatus = "all" | "active" | "cancelled" | "forfeited";

export interface HistoryDateRange {
  from: string;
  to: string;
  source: "user" | "settings" | "default";
}

export interface HistoryKpis {
  games: number;
  obligatedSlots?: number;
  filledSlots?: number;
  unfilledSlots?: number;
  cancelled: number;
  forfeited: number;
  distinctReferees: number;
}

export interface HistoryLeaderboardEntry {
  refereeApiId: number | null;
  refereeId: number | null;
  displayName: string;
  isOwnClub: boolean;
  sr1Count: number;
  sr2Count: number;
  total: number;
  lastRefereedDate: string | null;
}

export interface HistorySummaryResponse {
  range: HistoryDateRange;
  kpis: HistoryKpis;
  leaderboard: HistoryLeaderboardEntry[];
}

export interface HistoryGameItem {
  id: number;
  matchId: number | null;
  matchNo: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeamName: string;
  guestTeamName: string;
  leagueName: string | null;
  leagueShort: string | null;
  venueName: string | null;
  venueCity: string | null;
  sr1OurClub: boolean;
  sr2OurClub: boolean;
  sr1Name: string | null;
  sr2Name: string | null;
  sr1Status: "open" | "offered" | "assigned";
  sr2Status: "open" | "offered" | "assigned";
  isCancelled: boolean;
  isForfeited: boolean;
  isHomeGame: boolean;
}

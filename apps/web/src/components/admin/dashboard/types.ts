import type { MatchListItem, PaginatedResponse, LeagueStandings, RefereeListItem } from "@dragons/shared";

export interface DashboardData {
  referees: PaginatedResponse<RefereeListItem> | null;
  upcomingMatches: PaginatedResponse<MatchListItem> | null;
  todayMatches: PaginatedResponse<MatchListItem> | null;
  standings: LeagueStandings[] | null;
  teams: { id: number; name: string }[] | null;
  syncStatus: SyncStatusData | null;
}

export interface SyncStatusData {
  isRunning: boolean;
  lastRun: {
    status: "completed" | "failed";
    startedAt: string;
    finishedAt: string | null;
    duration: number | null;
    error: string | null;
  } | null;
}

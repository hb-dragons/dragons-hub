import type { NormalizedRefereeGamesQuery } from "./referee-games-query";

export const SWR_KEYS = {
  syncStatus: "/admin/sync/status",
  dashboardTodayMatches: (date: string) =>
    `/admin/matches?dateFrom=${date}&dateTo=${date}&limit=20&offset=0`,
  dashboardUpcomingMatches: `/admin/matches?limit=1&offset=0`,
  syncLogs: (limit: number, offset: number) =>
    `/admin/sync/logs?limit=${limit}&offset=${offset}`,
  syncSchedule: "/admin/sync/schedule",
  matches: "/admin/matches",
  matchDetail: (id: number) => `/admin/matches/${id}`,
  matchHistory: (id: number, limit?: number, offset?: number) =>
    `/admin/matches/${id}/history?limit=${limit ?? 50}&offset=${offset ?? 0}`,
  teams: "/admin/teams",
  refereesPaginated: (opts: {
    scope?: "own" | "all";
    search?: string;
    sort?: "name" | "workloadAsc" | "workloadDesc";
    limit?: number;
    offset?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    qs.set("scope", opts.scope ?? "own");
    qs.set("sort", opts.sort ?? "name");
    qs.set("limit", String(opts.limit ?? 50));
    qs.set("offset", String(opts.offset ?? 0));
    if (opts.search) qs.set("search", opts.search);
    return `/admin/referees?${qs.toString()}`;
  },
  refereeCounts: "/admin/referees/counts",
  referee: (id: number) => `/admin/referees/${id}`,
  refereeEligibleGames: (refereeId: number) =>
    `/admin/referees/${refereeId}/eligible-open-games`,
  refereeRules: (refereeId: number) => `/admin/referees/${refereeId}/rules`,
  standings: "/admin/standings",
  venues: "/admin/venues",
  settingsClub: "/admin/settings/club",
  settingsLeagues: "/admin/settings/leagues",
  users: "admin-users",
  boards: "/admin/boards",
  boardDetail: (id: number) => `/admin/boards/${id}`,
  boardTasks: (
    boardId: number,
    filters?: { assigneeId?: string; priority?: string; columnId?: number },
  ) => {
    const qs = new URLSearchParams();
    if (filters?.assigneeId) qs.set("assigneeId", filters.assigneeId);
    if (filters?.priority) qs.set("priority", filters.priority);
    if (filters?.columnId) qs.set("columnId", String(filters.columnId));
    const suffix = qs.toString();
    return suffix
      ? `/admin/boards/${boardId}/tasks?${suffix}`
      : `/admin/boards/${boardId}/tasks`;
  },
  taskDetail: (id: number) => `/admin/tasks/${id}`,
  bookings: "/admin/bookings",
  bookingDetail: (id: number) => `/admin/bookings/${id}`,
  settingsBooking: "/admin/settings/booking",
  notifications: (limit?: number, offset?: number) =>
    `/admin/notifications?limit=${limit ?? 20}&offset=${offset ?? 0}`,
  notificationsUnread: "/admin/notifications/unread-count",
  domainEvents: (params?: string) =>
    `/admin/events${params ? `?${params}` : ""}`,
  domainEventsFailed: (page?: number, limit?: number) =>
    `/admin/events/failed?page=${page ?? 1}&limit=${limit ?? 20}`,
  watchRules: "/admin/watch-rules",
  channelConfigs: "/admin/channel-configs",
  channelConfigProviders: "/admin/channel-configs/providers",
  refereeGamesFiltered: (q: NormalizedRefereeGamesQuery) => {
    const qs = new URLSearchParams();
    qs.set("status", q.status);
    qs.set("limit", String(q.limit));
    qs.set("offset", String(q.offset));
    if (q.slotStatus) qs.set("slotStatus", q.slotStatus);
    if (q.gameType) qs.set("gameType", q.gameType);
    if (q.dateFrom) qs.set("dateFrom", q.dateFrom);
    if (q.dateTo) qs.set("dateTo", q.dateTo);
    if (q.league) qs.set("league", q.league);
    if (q.search) qs.set("search", q.search);
    if (q.assignedRefereeApiId != null)
      qs.set("assignedRefereeApiId", String(q.assignedRefereeApiId));
    return `/referee/games?${qs.toString()}`;
  },
  refereeMatches: "/referee/matches?limit=500&offset=0",
  refereeSyncStatus: "/admin/sync/status?syncType=referee-games",
  refereeSyncLogs: (limit: number, offset: number) =>
    `/admin/sync/logs?limit=${limit}&offset=${offset}&syncType=referee-games`,
  refereeSyncSchedule: "/admin/sync/schedule?syncType=referee-games",
  socialPlayerPhotos: "/admin/social/player-photos",
  socialBackgrounds: "/admin/social/backgrounds",
  socialMatches: (type: string, week: number, year: number) =>
    `/admin/social/matches?type=${type}&week=${week}&year=${year}`,
  refereeHistorySummary: (qs: string) =>
    `/admin/referee/history/summary${qs ? `?${qs}` : ""}`,
  refereeHistoryGames: (qs: string) =>
    `/admin/referee/history/games${qs ? `?${qs}` : ""}`,
  refereeHistoryGamesCsv: (qs: string) =>
    `/admin/referee/history/games.csv${qs ? `?${qs}` : ""}`,
  refereeHistoryLeaderboardCsv: (qs: string) =>
    `/admin/referee/history/leaderboard.csv${qs ? `?${qs}` : ""}`,
  refereeCandidates: (spielplanId: number, search: string, pageFrom: number, slot?: 1 | 2) =>
    `/admin/referee/games/${spielplanId}/candidates?search=${encodeURIComponent(search)}&pageFrom=${pageFrom}&pageSize=15${slot != null ? `&slot=${slot}` : ""}`,
  testPushRecent: "/admin/notifications/test-push/recent",
  refereeGameByApiMatch: (apiMatchId: number) =>
    `/referee/games/by-api-match/${apiMatchId}`,
} as const;

export const SWR_KEYS = {
  syncStatus: "/admin/sync/status",
  syncLogs: (limit: number, offset: number) =>
    `/admin/sync/logs?limit=${limit}&offset=${offset}`,
  syncSchedule: "/admin/sync/schedule",
  matches: "/admin/matches",
  matchDetail: (id: number) => `/admin/matches/${id}`,
  teams: "/admin/teams",
  referees: "/admin/referees",
  refereeRules: (refereeId: number) => `/admin/referees/${refereeId}/rules`,
  standings: "/admin/standings",
  venues: "/admin/venues",
  settingsClub: "/admin/settings/club",
  settingsLeagues: "/admin/settings/leagues",
  users: "admin-users",
  boards: "/admin/boards",
  boardDetail: (id: number) => `/admin/boards/${id}`,
  boardTasks: (boardId: number) => `/admin/boards/${boardId}/tasks`,
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
  refereeMatches: "/referee/matches?limit=500&offset=0",
  socialPlayerPhotos: "/admin/social/player-photos",
  socialBackgrounds: "/admin/social/backgrounds",
  socialMatches: (type: string, week: number, year: number) =>
    `/admin/social/matches?type=${type}&week=${week}&year=${year}`,
} as const;

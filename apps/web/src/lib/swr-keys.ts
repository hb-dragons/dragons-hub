export const SWR_KEYS = {
  syncStatus: "/admin/sync/status",
  syncLogs: (limit: number, offset: number) =>
    `/admin/sync/logs?limit=${limit}&offset=${offset}`,
  syncSchedule: "/admin/sync/schedule",
  matches: "/admin/matches",
  matchDetail: (id: number) => `/admin/matches/${id}`,
  teams: "/admin/teams",
  referees: "/admin/referees",
  standings: "/admin/standings",
  venues: "/admin/venues",
  settingsClub: "/admin/settings/club",
  settingsLeagues: "/admin/settings/leagues",
  users: "admin-users",
} as const;

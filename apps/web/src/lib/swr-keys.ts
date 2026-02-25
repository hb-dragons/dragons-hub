export const SWR_KEYS = {
  syncStatus: "/admin/sync/status",
  syncLogs: (limit: number, offset: number) =>
    `/admin/sync/logs?limit=${limit}&offset=${offset}`,
  syncSchedule: "/admin/sync/schedule",
  matches: "/admin/matches",
  matchDetail: (id: number) => `/admin/matches/${id}`,
  teams: "/admin/teams",
  settingsClub: "/admin/settings/club",
  settingsLeagues: "/admin/settings/leagues",
} as const;

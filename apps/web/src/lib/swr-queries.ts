import type { Api } from "@dragons/api-client";
import { SWR_KEYS } from "./swr-keys";
import { api } from "./api";

/**
 * Binds each SWR cache key to a typed fetcher that calls the real factory
 * method. Parameterized by an `Api` instance so the browser client and the
 * server client produce identical keys while binding their own client. The key
 * strings (from SWR_KEYS) remain the cache identity shared with mutate() sites
 * and SSR fallback hydration; the fetcher determines the actual request.
 */

function normReferees(opts: {
  scope?: "own" | "all";
  search?: string;
  sort?: "name" | "workloadAsc" | "workloadDesc";
  limit?: number;
  offset?: number;
} = {}) {
  return {
    scope: opts.scope ?? "own",
    sort: opts.sort ?? "name",
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
    ...(opts.search ? { search: opts.search } : {}),
  };
}

// The SWR_KEYS builder accepts `league?: string[]` but the factory method
// accepts `league?: string` (comma-joined). normRefereeGames joins the array
// before passing to the factory so key + request derive from the same input.
function normRefereeGames(opts: Parameters<typeof SWR_KEYS.refereeGamesFiltered>[0] = {}) {
  return {
    status: opts.status ?? "active",
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
    ...(opts.slotStatus ? { slotStatus: opts.slotStatus } : {}),
    ...(opts.gameType ? { gameType: opts.gameType } : {}),
    ...(opts.dateFrom ? { dateFrom: opts.dateFrom } : {}),
    ...(opts.dateTo ? { dateTo: opts.dateTo } : {}),
    ...(opts.league?.length ? { league: opts.league.join(",") } : {}),
    ...(opts.search ? { search: opts.search } : {}),
    ...(opts.assignedRefereeApiId != null ? { assignedRefereeApiId: opts.assignedRefereeApiId } : {}),
  };
}

export function makeQueries(api: Api) {
  return {
    // sync
    syncStatus: () => ({ key: SWR_KEYS.syncStatus, fetcher: () => api.sync.status() }),
    syncLogs: (limit: number, offset: number) => ({
      key: SWR_KEYS.syncLogs(limit, offset),
      fetcher: () => api.sync.logs({ limit, offset }),
    }),
    syncSchedule: () => ({ key: SWR_KEYS.syncSchedule, fetcher: () => api.sync.schedule() }),
    refereeSyncStatus: () => ({
      key: SWR_KEYS.refereeSyncStatus,
      fetcher: () => api.sync.status("referee-games"),
    }),
    refereeSyncLogs: (limit: number, offset: number) => ({
      key: SWR_KEYS.refereeSyncLogs(limit, offset),
      fetcher: () => api.sync.logs({ limit, offset, syncType: "referee-games" }),
    }),
    refereeSyncSchedule: () => ({
      key: SWR_KEYS.refereeSyncSchedule,
      fetcher: () => api.sync.schedule("referee-games"),
    }),
    // matches
    matches: () => ({ key: SWR_KEYS.matches, fetcher: () => api.matches.list() }),
    dashboardTodayMatches: (date: string) => ({
      key: SWR_KEYS.dashboardTodayMatches(date),
      fetcher: () => api.matches.list({ dateFrom: date, dateTo: date, limit: 20, offset: 0 }),
    }),
    dashboardUpcomingMatches: () => ({
      key: SWR_KEYS.dashboardUpcomingMatches,
      fetcher: () => api.matches.list({ limit: 1, offset: 0 }),
    }),
    matchDetail: (id: number) => ({
      key: SWR_KEYS.matchDetail(id),
      fetcher: () => api.matches.get(id),
    }),
    matchHistory: (id: number, limit?: number, offset?: number) => ({
      key: SWR_KEYS.matchHistory(id, limit, offset),
      fetcher: () => api.matches.history(id, { limit: limit ?? 50, offset: offset ?? 0 }),
    }),
    // teams / standings / venues
    teams: () => ({ key: SWR_KEYS.teams, fetcher: () => api.teams.list() }),
    standings: () => ({ key: SWR_KEYS.standings, fetcher: () => api.standings.list() }),
    venues: () => ({ key: SWR_KEYS.venues, fetcher: () => api.venues.list() }),
    // referee-admin
    refereesPaginated: (opts: Parameters<typeof normReferees>[0] = {}) => {
      const norm = normReferees(opts);
      return {
        key: SWR_KEYS.refereesPaginated(norm),
        fetcher: () => api.refereeAdmin.listReferees(norm),
      };
    },
    refereeCounts: () => ({
      key: SWR_KEYS.refereeCounts,
      fetcher: () => api.refereeAdmin.refereeCounts(),
    }),
    referee: (id: number) => ({
      key: SWR_KEYS.referee(id),
      fetcher: () => api.refereeAdmin.getReferee(id),
    }),
    refereeRules: (id: number) => ({
      key: SWR_KEYS.refereeRules(id),
      fetcher: () => api.refereeAdmin.getRules(id),
    }),
    refereeEligibleGames: (id: number) => ({
      key: SWR_KEYS.refereeEligibleGames(id),
      fetcher: () => api.refereeAdmin.eligibleOpenGames(id),
    }),
    refereeHistoryGames: (
      query: Parameters<typeof api.refereeAdmin.historyGames>[0],
      qs: string,
    ) => ({
      key: SWR_KEYS.refereeHistoryGames(qs),
      fetcher: () => api.refereeAdmin.historyGames(query),
    }),
    // referee (self-service / assignment)
    refereeGamesFiltered: (opts: Parameters<typeof SWR_KEYS.refereeGamesFiltered>[0] = {}) => {
      const norm = normRefereeGames(opts);
      return {
        key: SWR_KEYS.refereeGamesFiltered(opts),
        fetcher: () => api.referees.getGames(norm),
      };
    },
    refereeCandidates: (
      spielplanId: number,
      search: string,
      pageFrom: number,
      slot?: 1 | 2,
    ) => ({
      key: SWR_KEYS.refereeCandidates(spielplanId, search, pageFrom, slot),
      fetcher: () =>
        api.referees.searchAssignmentCandidates(spielplanId, {
          search,
          pageFrom,
          pageSize: 15,
          slotNumber: slot ?? 1,
        }),
    }),
    // settings
    settingsClub: () => ({ key: SWR_KEYS.settingsClub, fetcher: () => api.settings.getClub() }),
    settingsLeagues: () => ({
      key: SWR_KEYS.settingsLeagues,
      fetcher: () => api.settings.getLeagues(),
    }),
    settingsBooking: () => ({
      key: SWR_KEYS.settingsBooking,
      fetcher: () => api.settings.getBooking(),
    }),
    // bookings
    bookings: () => ({ key: SWR_KEYS.bookings, fetcher: () => api.bookings.list() }),
    // notifications / events
    notifications: (limit?: number, offset?: number) => ({
      key: SWR_KEYS.notifications(limit, offset),
      fetcher: () => api.notifications.list({ limit: limit ?? 20, offset: offset ?? 0 }),
    }),
    domainEvents: (query: Parameters<typeof api.events.list>[0], params?: string) => ({
      key: SWR_KEYS.domainEvents(params),
      fetcher: () => api.events.list(query),
    }),
    domainEventsFailed: (page?: number, limit?: number) => ({
      key: SWR_KEYS.domainEventsFailed(page, limit),
      fetcher: () => api.events.failed({ page: page ?? 1, limit: limit ?? 20 }),
    }),
    // watch rules / channel configs
    watchRules: () => ({ key: SWR_KEYS.watchRules, fetcher: () => api.watchRules.list() }),
    channelConfigs: () => ({
      key: SWR_KEYS.channelConfigs,
      fetcher: () => api.channelConfigs.list(),
    }),
    channelConfigProviders: () => ({
      key: SWR_KEYS.channelConfigProviders,
      fetcher: () => api.channelConfigs.providers(),
    }),
    // boards
    boards: () => ({ key: SWR_KEYS.boards, fetcher: () => api.boards.listBoards() }),
    boardDetail: (id: number) => ({
      key: SWR_KEYS.boardDetail(id),
      fetcher: () => api.boards.getBoard(id),
    }),
    boardTasks: (
      boardId: number,
      filters?: Parameters<typeof api.boards.listTasks>[1],
    ) => ({
      key: SWR_KEYS.boardTasks(boardId, filters),
      fetcher: () => api.boards.listTasks(boardId, filters),
    }),
    taskDetail: (id: number) => ({
      key: SWR_KEYS.taskDetail(id),
      fetcher: () => api.boards.getTask(id),
    }),
  } as const;
}

/** Browser-bound registry for client components. */
export const queries = makeQueries(api);

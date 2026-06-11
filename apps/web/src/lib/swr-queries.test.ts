import { describe, it, expect } from "vitest";
import { makeQueries } from "./swr-queries";
import { SWR_KEYS } from "./swr-keys";
import type { Api } from "@dragons/api-client";

/** A typed-enough mock: every method returns a tagged marker so we can assert dispatch. */
function mockApi() {
  const calls: { method: string; args: unknown[] }[] = [];
  const rec =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve({ method, args });
    };
  const api = {
    sync: { status: rec("sync.status"), logs: rec("sync.logs"), schedule: rec("sync.schedule") },
    matches: { get: rec("matches.get"), list: rec("matches.list"), history: rec("matches.history") },
    teams: { list: rec("teams.list") },
    standings: { list: rec("standings.list") },
    venues: { list: rec("venues.list") },
    refereeAdmin: {
      listReferees: rec("refereeAdmin.listReferees"),
      refereeCounts: rec("refereeAdmin.refereeCounts"),
      getReferee: rec("refereeAdmin.getReferee"),
      getRules: rec("refereeAdmin.getRules"),
      eligibleOpenGames: rec("refereeAdmin.eligibleOpenGames"),
      historyGames: rec("refereeAdmin.historyGames"),
    },
    referees: {
      getGames: rec("referees.getGames"),
      searchAssignmentCandidates: rec("referees.searchAssignmentCandidates"),
    },
    settings: {
      getClub: rec("settings.getClub"),
      getLeagues: rec("settings.getLeagues"),
      getBooking: rec("settings.getBooking"),
    },
    bookings: { list: rec("bookings.list") },
    notifications: { list: rec("notifications.list") },
    events: { list: rec("events.list"), failed: rec("events.failed") },
    watchRules: { list: rec("watchRules.list") },
    channelConfigs: { list: rec("channelConfigs.list"), providers: rec("channelConfigs.providers") },
    boards: {
      listBoards: rec("boards.listBoards"),
      getBoard: rec("boards.getBoard"),
      listTasks: rec("boards.listTasks"),
      getTask: rec("boards.getTask"),
    },
  } as unknown as Api;
  return { api, calls };
}

describe("makeQueries", () => {
  // --- standings (existing) ---
  it("standings(): key + dispatch to standings.list", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).standings();
    expect(q.key).toBe(SWR_KEYS.standings);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "standings.list", args: [] });
  });

  // --- matchDetail (existing) ---
  it("matchDetail(id): key + dispatch to matches.get(id)", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).matchDetail(7);
    expect(q.key).toBe(SWR_KEYS.matchDetail(7));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "matches.get", args: [7] });
  });

  // --- sync ---
  it("syncStatus: key + dispatch to sync.status()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).syncStatus();
    expect(q.key).toBe(SWR_KEYS.syncStatus);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "sync.status", args: [] });
  });

  it("syncLogs(limit, offset): key + dispatch to sync.logs({limit, offset})", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).syncLogs(25, 50);
    expect(q.key).toBe(SWR_KEYS.syncLogs(25, 50));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "sync.logs", args: [{ limit: 25, offset: 50 }] });
  });

  it("syncSchedule: key + dispatch to sync.schedule()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).syncSchedule();
    expect(q.key).toBe(SWR_KEYS.syncSchedule);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "sync.schedule", args: [] });
  });

  it("refereeSyncStatus: passes syncType to sync.status", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).refereeSyncStatus();
    expect(q.key).toBe(SWR_KEYS.refereeSyncStatus);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "sync.status", args: ["referee-games"] });
  });

  it("refereeSyncLogs(limit, offset): key + dispatch to sync.logs with syncType", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).refereeSyncLogs(10, 0);
    expect(q.key).toBe(SWR_KEYS.refereeSyncLogs(10, 0));
    await q.fetcher();
    expect(calls[0]).toEqual({
      method: "sync.logs",
      args: [{ limit: 10, offset: 0, syncType: "referee-games" }],
    });
  });

  it("refereeSyncSchedule: key + dispatch to sync.schedule with syncType", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).refereeSyncSchedule();
    expect(q.key).toBe(SWR_KEYS.refereeSyncSchedule);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "sync.schedule", args: ["referee-games"] });
  });

  // --- matches ---
  it("matches: key + dispatch to matches.list()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).matches();
    expect(q.key).toBe(SWR_KEYS.matches);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "matches.list", args: [] });
  });

  it("dashboardTodayMatches(date): key + dispatch with date filters", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).dashboardTodayMatches("2026-06-11");
    expect(q.key).toBe(SWR_KEYS.dashboardTodayMatches("2026-06-11"));
    await q.fetcher();
    expect(calls[0]).toEqual({
      method: "matches.list",
      args: [{ dateFrom: "2026-06-11", dateTo: "2026-06-11", limit: 20, offset: 0 }],
    });
  });

  it("dashboardUpcomingMatches: key + dispatch with limit 1", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).dashboardUpcomingMatches();
    expect(q.key).toBe(SWR_KEYS.dashboardUpcomingMatches);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "matches.list", args: [{ limit: 1, offset: 0 }] });
  });

  it("matchHistory(id): key + dispatch with defaults", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).matchHistory(42);
    expect(q.key).toBe(SWR_KEYS.matchHistory(42));
    await q.fetcher();
    expect(calls[0]).toEqual({
      method: "matches.history",
      args: [42, { limit: 50, offset: 0 }],
    });
  });

  it("matchHistory(id, limit, offset): key + dispatch with explicit values", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).matchHistory(42, 10, 20);
    expect(q.key).toBe(SWR_KEYS.matchHistory(42, 10, 20));
    await q.fetcher();
    expect(calls[0]).toEqual({
      method: "matches.history",
      args: [42, { limit: 10, offset: 20 }],
    });
  });

  // --- teams / venues ---
  it("teams: key + dispatch to teams.list()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).teams();
    expect(q.key).toBe(SWR_KEYS.teams);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "teams.list", args: [] });
  });

  it("venues: key + dispatch to venues.list()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).venues();
    expect(q.key).toBe(SWR_KEYS.venues);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "venues.list", args: [] });
  });

  // --- referee-admin ---
  it("refereesPaginated: normalizes defaults into key + request", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).refereesPaginated({ scope: "own", limit: 50 });
    const norm = { scope: "own", sort: "name", limit: 50, offset: 0 };
    expect(q.key).toBe(SWR_KEYS.refereesPaginated(norm));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "refereeAdmin.listReferees", args: [norm] });
  });

  it("refereesPaginated: default opts produce default-normalized key", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).refereesPaginated();
    const norm = { scope: "own", sort: "name", limit: 50, offset: 0 };
    expect(q.key).toBe(SWR_KEYS.refereesPaginated(norm));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "refereeAdmin.listReferees", args: [norm] });
  });

  it("refereesPaginated: search is included when provided", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).refereesPaginated({ search: "Max", scope: "all" });
    const norm = { scope: "all", sort: "name", limit: 50, offset: 0, search: "Max" };
    expect(q.key).toBe(SWR_KEYS.refereesPaginated(norm));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "refereeAdmin.listReferees", args: [norm] });
  });

  it("refereeCounts: key + dispatch to refereeAdmin.refereeCounts()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).refereeCounts();
    expect(q.key).toBe(SWR_KEYS.refereeCounts);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "refereeAdmin.refereeCounts", args: [] });
  });

  it("referee(id): key + dispatch to refereeAdmin.getReferee(id)", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).referee(3);
    expect(q.key).toBe(SWR_KEYS.referee(3));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "refereeAdmin.getReferee", args: [3] });
  });

  it("refereeRules(id): key + dispatch to refereeAdmin.getRules(id)", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).refereeRules(5);
    expect(q.key).toBe(SWR_KEYS.refereeRules(5));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "refereeAdmin.getRules", args: [5] });
  });

  it("refereeEligibleGames(id): key + dispatch to refereeAdmin.eligibleOpenGames(id)", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).refereeEligibleGames(8);
    expect(q.key).toBe(SWR_KEYS.refereeEligibleGames(8));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "refereeAdmin.eligibleOpenGames", args: [8] });
  });

  it("refereeHistoryGames(query, qs): key uses qs; fetcher calls historyGames(query)", async () => {
    const { api, calls } = mockApi();
    const query = { season: "2025-26" };
    const qs = "season=2025-26";
    const q = makeQueries(api).refereeHistoryGames(query, qs);
    expect(q.key).toBe(SWR_KEYS.refereeHistoryGames(qs));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "refereeAdmin.historyGames", args: [query] });
  });

  // --- referee self-service ---
  it("refereeGamesFiltered: key from opts; fetcher normalizes defaults", async () => {
    const { api, calls } = mockApi();
    const opts = {};
    const q = makeQueries(api).refereeGamesFiltered(opts);
    // key derives from opts (raw input passed to the SWR_KEYS builder)
    expect(q.key).toBe(SWR_KEYS.refereeGamesFiltered(opts));
    // fetcher uses normalized values (defaults applied)
    await q.fetcher();
    expect(calls[0]).toEqual({
      method: "referees.getGames",
      args: [{ status: "active", limit: 100, offset: 0 }],
    });
  });

  it("refereeGamesFiltered: optional fields are included when provided", async () => {
    const { api, calls } = mockApi();
    const opts = { status: "active" as const, slotStatus: "open" as const, search: "Schmidt" };
    const q = makeQueries(api).refereeGamesFiltered(opts);
    expect(q.key).toBe(SWR_KEYS.refereeGamesFiltered(opts));
    await q.fetcher();
    expect(calls[0]).toEqual({
      method: "referees.getGames",
      args: [{ status: "active", limit: 100, offset: 0, slotStatus: "open", search: "Schmidt" }],
    });
  });

  it("refereeCandidates: key + dispatch with all params", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).refereeCandidates(99, "test", 0, 1);
    expect(q.key).toBe(SWR_KEYS.refereeCandidates(99, "test", 0, 1));
    await q.fetcher();
    expect(calls[0]).toEqual({
      method: "referees.searchAssignmentCandidates",
      args: [99, { search: "test", pageFrom: 0, pageSize: 15, slotNumber: 1 }],
    });
  });

  it("refereeCandidates: defaults slotNumber to 1 when slot is omitted", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).refereeCandidates(99, "test", 0);
    expect(q.key).toBe(SWR_KEYS.refereeCandidates(99, "test", 0));
    await q.fetcher();
    expect(calls[0]).toEqual({
      method: "referees.searchAssignmentCandidates",
      args: [99, { search: "test", pageFrom: 0, pageSize: 15, slotNumber: 1 }],
    });
  });

  // --- settings ---
  it("settingsClub: key + dispatch to settings.getClub()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).settingsClub();
    expect(q.key).toBe(SWR_KEYS.settingsClub);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "settings.getClub", args: [] });
  });

  it("settingsLeagues: key + dispatch to settings.getLeagues()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).settingsLeagues();
    expect(q.key).toBe(SWR_KEYS.settingsLeagues);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "settings.getLeagues", args: [] });
  });

  it("settingsBooking: key + dispatch to settings.getBooking()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).settingsBooking();
    expect(q.key).toBe(SWR_KEYS.settingsBooking);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "settings.getBooking", args: [] });
  });

  // --- bookings ---
  it("bookings: key + dispatch to bookings.list()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).bookings();
    expect(q.key).toBe(SWR_KEYS.bookings);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "bookings.list", args: [] });
  });

  // --- notifications ---
  it("notifications(): key with defaults + dispatch to notifications.list", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).notifications();
    expect(q.key).toBe(SWR_KEYS.notifications());
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "notifications.list", args: [{ limit: 20, offset: 0 }] });
  });

  it("notifications(limit, offset): key + dispatch with explicit values", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).notifications(10, 30);
    expect(q.key).toBe(SWR_KEYS.notifications(10, 30));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "notifications.list", args: [{ limit: 10, offset: 30 }] });
  });

  // --- events ---
  it("domainEvents(query, params): key uses params; fetcher calls events.list(query)", async () => {
    const { api, calls } = mockApi();
    const query = { type: "match.updated" };
    const params = "type=match.updated";
    const q = makeQueries(api).domainEvents(query, params);
    expect(q.key).toBe(SWR_KEYS.domainEvents(params));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "events.list", args: [query] });
  });

  it("domainEvents(query): key without params", async () => {
    const { api } = mockApi();
    const q = makeQueries(api).domainEvents({});
    expect(q.key).toBe(SWR_KEYS.domainEvents(undefined));
  });

  it("domainEventsFailed(): key with defaults + dispatch", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).domainEventsFailed();
    expect(q.key).toBe(SWR_KEYS.domainEventsFailed());
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "events.failed", args: [{ page: 1, limit: 20 }] });
  });

  it("domainEventsFailed(page, limit): key + dispatch with explicit values", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).domainEventsFailed(2, 50);
    expect(q.key).toBe(SWR_KEYS.domainEventsFailed(2, 50));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "events.failed", args: [{ page: 2, limit: 50 }] });
  });

  // --- watch rules ---
  it("watchRules: key + dispatch to watchRules.list()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).watchRules();
    expect(q.key).toBe(SWR_KEYS.watchRules);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "watchRules.list", args: [] });
  });

  // --- channel configs ---
  it("channelConfigs: key + dispatch to channelConfigs.list()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).channelConfigs();
    expect(q.key).toBe(SWR_KEYS.channelConfigs);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "channelConfigs.list", args: [] });
  });

  it("channelConfigProviders: key + dispatch to channelConfigs.providers()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).channelConfigProviders();
    expect(q.key).toBe(SWR_KEYS.channelConfigProviders);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "channelConfigs.providers", args: [] });
  });

  // --- boards ---
  it("boards: key + dispatch to boards.listBoards()", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).boards();
    expect(q.key).toBe(SWR_KEYS.boards);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "boards.listBoards", args: [] });
  });

  it("boardDetail(id): key + dispatch to boards.getBoard(id)", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).boardDetail(2);
    expect(q.key).toBe(SWR_KEYS.boardDetail(2));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "boards.getBoard", args: [2] });
  });

  it("boardTasks(boardId): key + dispatch with no filters", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).boardTasks(1);
    expect(q.key).toBe(SWR_KEYS.boardTasks(1));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "boards.listTasks", args: [1, undefined] });
  });

  it("boardTasks(boardId, filters): key + dispatch with filters", async () => {
    const { api, calls } = mockApi();
    const filters = { priority: "high" as const, columnId: 3 };
    const q = makeQueries(api).boardTasks(1, filters);
    expect(q.key).toBe(SWR_KEYS.boardTasks(1, filters));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "boards.listTasks", args: [1, filters] });
  });

  it("taskDetail(id): key + dispatch to boards.getTask(id)", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).taskDetail(10);
    expect(q.key).toBe(SWR_KEYS.taskDetail(10));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "boards.getTask", args: [10] });
  });
});

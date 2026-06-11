# SWR → Typed-Query-Registry Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every `apps/web` client `useSWR` read off the untyped string-path `apiFetcher` onto a typed query registry, so response types are inferred from `@dragons/api-client` and the key strings can no longer drive a wrong request.

**Architecture:** A new `makeQueries(client)` registry binds each SWR cache key to a typed fetcher that calls the real factory method. It is parameterized by an `Api` instance so the browser client and the server client produce identical keys while binding their own client. Client `useSWR(q.key, q.fetcher)` infers the response type; server `page.tsx` fallback builders source key+data from the same entry. `SWR_KEYS` strings stay as opaque cache identities; `mutate()` sites are untouched.

**Tech Stack:** Next.js (App Router), SWR v2, `@dragons/api-client` typed factory, `@dragons/contracts` (zod request schemas), Vitest v4, ESLint flat config.

**Reference spec:** `docs/superpowers/specs/2026-06-11-swr-typed-query-registry-design.md`

**Branch:** `swr-typed-query-registry` (already created; the spec is committed at `0fd40c2`).

---

## File Structure

**Created:**
- `apps/web/src/lib/swr-queries.ts` — the `makeQueries(client)` registry + browser-bound `queries`. One responsibility: bind cache keys to typed fetchers.
- `apps/web/src/lib/swr-queries.test.ts` — asserts every registry entry's `key` equals the expected `SWR_KEYS` string and its `fetcher()` dispatches to the right factory method with normalized args.
- `packages/api-client/src/endpoints/referee-admin.test.ts` — unit test for the one new factory method.

**Modified:**
- `packages/api-client/src/endpoints/referee-admin.ts` — add `eligibleOpenGames(id)` (the single missing typed method).
- The 28 client files listed in Task 4 — swap `useSWR(SWR_KEYS.x, apiFetcher)` → `useSWR(q.key, q.fetcher)`, drop manual generics.
- The 13 server fallback builders listed in Task 5 — source fallback key+data from `makeQueries(sApi)`.
- `apps/web/src/lib/swr.ts` — delete `apiFetcher`.
- `apps/web/eslint.config.mjs` — update the fetch-guard message and ban re-importing `apiFetcher`/`browserClient` in components.

**Untouched on purpose:**
- `apps/web/src/lib/swr-keys.ts` — stays as the cache-key source of truth (reused by the registry and by `mutate()` sites).
- All `mutate(SWR_KEYS.x)` call sites.
- Out-of-scope keys: `users` (custom `fetchUsers`), `notificationsUnread` (dead), `socialPlayerPhotos/Backgrounds/Matches`, `refereeHistorySummary`, `refereeMatches`, the two `*Csv` download keys.

---

## Authoritative key → method mapping (the 36 in-scope entries)

| Key | Typed method | Notes |
|---|---|---|
| `syncStatus` | `sync.status()` | no syncType |
| `syncLogs(limit,offset)` | `sync.logs({limit,offset})` | |
| `syncSchedule` | `sync.schedule()` | |
| `refereeSyncStatus` | `sync.status("referee-games")` | syncType arg |
| `refereeSyncLogs(limit,offset)` | `sync.logs({limit,offset,syncType:"referee-games"})` | |
| `refereeSyncSchedule` | `sync.schedule("referee-games")` | |
| `matches` | `matches.list()` | |
| `dashboardTodayMatches(date)` | `matches.list({dateFrom:date,dateTo:date,limit:20,offset:0})` | |
| `dashboardUpcomingMatches` | `matches.list({limit:1,offset:0})` | |
| `matchDetail(id)` | `matches.get(id)` | |
| `matchHistory(id,limit,offset)` | `matches.history(id,{limit,offset})` | defaults 50/0 |
| `teams` | `teams.list()` | |
| `standings` | `standings.list()` | |
| `venues` | `venues.list()` | |
| `refereesPaginated(opts)` | `refereeAdmin.listReferees(norm)` | norm defaults scope=own,sort=name,limit=50,offset=0 |
| `refereeCounts` | `refereeAdmin.refereeCounts()` | |
| `referee(id)` | `refereeAdmin.getReferee(id)` | |
| `refereeRules(id)` | `refereeAdmin.getRules(id)` | |
| `refereeEligibleGames(id)` | `refereeAdmin.eligibleOpenGames(id)` | **NEW METHOD (Task 1)** |
| `refereeHistoryGames(qs)` | `refereeAdmin.historyGames(query)` | query object, not raw qs |
| `refereeGamesFiltered(opts)` | `referees.getGames(norm)` | norm defaults status=active,limit=100,offset=0; league comma-joined |
| `refereeCandidates(spielplanId,search,pageFrom,slot)` | `referees.searchAssignmentCandidates(spielplanId,{search,pageFrom,pageSize:15,slotNumber:slot})` | slot→slotNumber |
| `settingsClub` | `settings.getClub()` | |
| `settingsLeagues` | `settings.getLeagues()` | |
| `settingsBooking` | `settings.getBooking()` | |
| `bookings` | `bookings.list()` | |
| `notifications(limit,offset)` | `notifications.list({limit,offset})` | defaults 20/0 |
| `domainEvents(params)` | `events.list(query)` | |
| `domainEventsFailed(page,limit)` | `events.failed({page,limit})` | defaults 1/20 |
| `watchRules` | `watchRules.list()` | |
| `channelConfigs` | `channelConfigs.list()` | |
| `channelConfigProviders` | `channelConfigs.providers()` | |
| `boards` | `boards.listBoards()` | |
| `boardDetail(id)` | `boards.getBoard(id)` | |
| `boardTasks(boardId,filters)` | `boards.listTasks(boardId,filters)` | |
| `taskDetail(id)` | `boards.getTask(id)` | |

The browser group names on `createApi`: `sync`, `matches`, `teams`, `standings`, `venues`, `refereeAdmin`, `referees`, `settings`, `bookings`, `notifications`, `events`, `watchRules`, `channelConfigs`, `boards`.

---

### Task 1: Add the one missing typed method `refereeAdmin.eligibleOpenGames`

**Files:**
- Modify: `packages/api-client/src/endpoints/referee-admin.ts`
- Create: `packages/api-client/src/endpoints/referee-admin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api-client/src/endpoints/referee-admin.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "../client";
import { refereeAdminEndpoints } from "./referee-admin";

describe("refereeAdminEndpoints.eligibleOpenGames", () => {
  it("GETs /admin/referees/:id/eligible-open-games", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const api = refereeAdminEndpoints(client);

    const result = await api.eligibleOpenGames(42);

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toBe("https://example.test/admin/referees/42/eligible-open-games");
    expect(result.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm --filter @dragons/api-client test -- referee-admin.test.ts`
Expected: FAIL — `api.eligibleOpenGames is not a function`.

- [ ] **Step 3: Add the method + its response type import**

In `packages/api-client/src/endpoints/referee-admin.ts`, add `EligibleOpenGamesResponse` to the existing `@dragons/shared` type import block:

```ts
import type {
  PaginatedResponse,
  RefereeListItem,
  RefereeCountsResponse,
  RefereeRulesResponse,
  HistorySummaryResponse,
  HistoryGameItem,
  EligibleOpenGamesResponse,
} from "@dragons/shared";
```

Then add the method right after `getReferee(id)` in the returned object:

```ts
    eligibleOpenGames(id: number): Promise<EligibleOpenGamesResponse> {
      return client.get(`/admin/referees/${id}/eligible-open-games`);
    },
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm --filter @dragons/api-client test -- referee-admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the package**

Run: `pnpm --filter @dragons/api-client typecheck`
Expected: clean (`EligibleOpenGamesResponse` resolves from `@dragons/shared`).

- [ ] **Step 6: Commit**

```bash
git add packages/api-client/src/endpoints/referee-admin.ts packages/api-client/src/endpoints/referee-admin.test.ts
git commit -m "feat(api-client): add refereeAdmin.eligibleOpenGames typed GET"
```

---

### Task 2: Scaffold the query registry + test harness (prove the pattern)

**Files:**
- Create: `apps/web/src/lib/swr-queries.ts`
- Create: `apps/web/src/lib/swr-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/swr-queries.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
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
    standings: { list: rec("standings.list") },
    matches: { get: rec("matches.get") },
  } as unknown as Api;
  return { api, calls };
}

describe("makeQueries", () => {
  it("standings(): key + dispatch to standings.list", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).standings();
    expect(q.key).toBe(SWR_KEYS.standings);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "standings.list", args: [] });
  });

  it("matchDetail(id): key + dispatch to matches.get(id)", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).matchDetail(7);
    expect(q.key).toBe(SWR_KEYS.matchDetail(7));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "matches.get", args: [7] });
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm --filter @dragons/web test -- swr-queries.test.ts`
Expected: FAIL — cannot find module `./swr-queries`.

- [ ] **Step 3: Create the registry scaffold with the two proven entries**

Create `apps/web/src/lib/swr-queries.ts`:

```ts
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
export function makeQueries(api: Api) {
  return {
    standings: () => ({
      key: SWR_KEYS.standings,
      fetcher: () => api.standings.list(),
    }),
    matchDetail: (id: number) => ({
      key: SWR_KEYS.matchDetail(id),
      fetcher: () => api.matches.get(id),
    }),
  } as const;
}

/** Browser-bound registry for client components. */
export const queries = makeQueries(api);
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm --filter @dragons/web test -- swr-queries.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Confirm `Api` is exported from the client root**

Run: `grep -n "export type { Api }\|export type Api\|Api," packages/api-client/src/index.ts`
Expected: `Api` is re-exported (it is defined in `create-api.ts` as `export type Api = ReturnType<typeof createApi>`). If the root `index.ts` does not re-export it, add `export type { Api } from "./create-api";` there and commit that one-line change with this task.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/swr-queries.ts apps/web/src/lib/swr-queries.test.ts packages/api-client/src/index.ts
git commit -m "feat(web): scaffold typed SWR query registry"
```

---

### Task 3: Fill the registry with all remaining in-scope entries

**Files:**
- Modify: `apps/web/src/lib/swr-queries.ts`
- Modify: `apps/web/src/lib/swr-queries.test.ts`

- [ ] **Step 1: Add a dispatch test per entry**

Extend `mockApi()` in `swr-queries.test.ts` so every group/method used below is recorded, then add one `it(...)` per entry asserting `q.key` equals the matching `SWR_KEYS.*` and `q.fetcher()` dispatches to the right method with the normalized args. Pattern (repeat for each entry in the mapping table):

```ts
it("refereesPaginated: normalizes defaults into key + request", async () => {
  const { api, calls } = mockApi();   // add refereeAdmin.listReferees: rec("refereeAdmin.listReferees")
  const q = makeQueries(api).refereesPaginated({ scope: "own", limit: 50 });
  const norm = { scope: "own", sort: "name", limit: 50, offset: 0 };
  expect(q.key).toBe(SWR_KEYS.refereesPaginated(norm));
  await q.fetcher();
  expect(calls[0]).toEqual({ method: "refereeAdmin.listReferees", args: [norm] });
});

it("refereeSyncStatus: passes syncType to sync.status", async () => {
  const { api, calls } = mockApi();   // add sync.status: rec("sync.status")
  const q = makeQueries(api).refereeSyncStatus();
  expect(q.key).toBe(SWR_KEYS.refereeSyncStatus);
  await q.fetcher();
  expect(calls[0]).toEqual({ method: "sync.status", args: ["referee-games"] });
});
```

Cover all 36 entries (the two from Task 2 already exist).

- [ ] **Step 2: Run the tests and verify the new ones fail**

Run: `pnpm --filter @dragons/web test -- swr-queries.test.ts`
Expected: FAIL — the not-yet-added entries are `undefined`.

- [ ] **Step 3: Replace the registry body with the full set**

Replace the returned object in `makeQueries` with the complete registry. Add the two normalizers above the `return`:

```ts
function normReferees(opts: {
  scope?: "own" | "all"; search?: string;
  sort?: "name" | "workloadAsc" | "workloadDesc"; limit?: number; offset?: number;
} = {}) {
  return {
    scope: opts.scope ?? "own",
    sort: opts.sort ?? "name",
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
    ...(opts.search ? { search: opts.search } : {}),
  };
}

function normRefereeGames(opts: Parameters<typeof SWR_KEYS.refereeGamesFiltered>[0] = {}) {
  return {
    status: opts.status ?? "active",
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
    ...(opts.slotStatus ? { slotStatus: opts.slotStatus } : {}),
    ...(opts.gameType ? { gameType: opts.gameType } : {}),
    ...(opts.dateFrom ? { dateFrom: opts.dateFrom } : {}),
    ...(opts.dateTo ? { dateTo: opts.dateTo } : {}),
    ...(opts.league?.length ? { league: opts.league } : {}),
    ...(opts.search ? { search: opts.search } : {}),
    ...(opts.assignedRefereeApiId != null
      ? { assignedRefereeApiId: opts.assignedRefereeApiId }
      : {}),
  };
}
```

Full registry body:

```ts
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
    refereeHistoryGames: (query: Parameters<typeof api.refereeAdmin.historyGames>[0], qs: string) => ({
      key: SWR_KEYS.refereeHistoryGames(qs),
      fetcher: () => api.refereeAdmin.historyGames(query),
    }),

    // referee (self-service / assignment)
    refereeGamesFiltered: (opts: Parameters<typeof normRefereeGames>[0] = {}) => {
      const norm = normRefereeGames(opts);
      return {
        key: SWR_KEYS.refereeGamesFiltered(norm),
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
          slotNumber: slot,
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
      filters?: { assigneeId?: string; priority?: string; columnId?: number },
    ) => ({
      key: SWR_KEYS.boardTasks(boardId, filters),
      fetcher: () => api.boards.listTasks(boardId, filters),
    }),
    taskDetail: (id: number) => ({
      key: SWR_KEYS.taskDetail(id),
      fetcher: () => api.boards.getTask(id),
    }),
  } as const;
```

> **Param-shape note for the executor:** `domainEvents` and `refereeHistoryGames` keys are built from raw query strings today, while the typed methods take a parsed query object. Each call site already has the parsed object on hand (it builds the `qs` string from it). When migrating those two call sites in Task 4, pass both the parsed `query` object (for the fetcher) and the existing `qs` string (for the key). Do not re-parse the string.

- [ ] **Step 4: Run the registry tests and verify they pass**

Run: `pnpm --filter @dragons/web test -- swr-queries.test.ts`
Expected: PASS (all entry tests green).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: clean. If any `SWR_KEYS.*(norm)` rejects the normalized object's shape, align the normalizer's return to the `SWR_KEYS` builder's parameter type (it is the source of truth for the key string).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/swr-queries.ts apps/web/src/lib/swr-queries.test.ts
git commit -m "feat(web): complete typed SWR query registry"
```

---

### Task 4: Migrate the 28 client `useSWR` call sites

**The mechanical transform (apply at every site):**

```ts
// before
import { SWR_KEYS } from "@/lib/swr-keys";
import { apiFetcher } from "@/lib/swr";
const { data } = useSWR<SomeType>(cond ? SWR_KEYS.foo(arg) : null, apiFetcher);

// after
import { queries } from "@/lib/swr-queries";
const q = queries.foo(arg);
const { data } = useSWR(cond ? q.key : null, q.fetcher);   // data inferred — drop <SomeType>
```

Rules:
- Drop the manual `useSWR<T>` generic — the type comes from `q.fetcher`.
- Remove the now-unused `apiFetcher` import and any now-unused response-type imports.
- Keep `SWR_KEYS` imports only where the file still calls `mutate(SWR_KEYS.x)`.
- For multiple hooks in one component, build a `q` per hook (e.g. `const refsQ = queries.refereesPaginated({...})`).

**Worked example A — `apps/web/src/components/admin/dashboard/dashboard-view.tsx` (static + parameterized + conditional, six hooks):**

```ts
const refsQ = queries.refereesPaginated({ scope: "own", limit: 50 });
const { data: referees } = useSWR(canViewReferees ? refsQ.key : null, refsQ.fetcher);
const upcomingQ = queries.dashboardUpcomingMatches();
const { data: upcoming } = useSWR(canViewMatches ? upcomingQ.key : null, upcomingQ.fetcher);
const todayQ = queries.dashboardTodayMatches(today);
const { data: todayMatches } = useSWR(canViewMatches ? todayQ.key : null, todayQ.fetcher);
const standingsQ = queries.standings();
const { data: standings } = useSWR(canViewStandings ? standingsQ.key : null, standingsQ.fetcher);
const teamsQ = queries.teams();
const { data: teams } = useSWR(canViewTeams ? teamsQ.key : null, teamsQ.fetcher);
const statusQ = queries.syncStatus();
const { data: syncStatus } = useSWR(canViewSync ? statusQ.key : null, statusQ.fetcher);
```

Delete the `apiFetcher` import and the now-unused `PaginatedResponse`/`MatchListItem`/`LeagueStandings`/`RefereeListItem`/`SyncStatusData` type imports that were only there for the generics (keep any still referenced elsewhere in the file).

**Worked example B — `apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.tsx` (parameterized + new method):**

```ts
const assignedQ = queries.refereeGamesFiltered({
  assignedRefereeApiId: referee.apiId, status: "active", limit: 100,
});
const { data: assignedData } = useSWR(assignedQ.key, assignedQ.fetcher);
const eligibleQ = queries.refereeEligibleGames(referee.id);
const { data: eligibleData } = useSWR(eligibleQ.key, eligibleQ.fetcher);
```

Delete the local `AssignedResp`/`EligibleResp` interfaces and the `apiFetcher` import; `assignedData`/`eligibleData` are now inferred (`PaginatedResponse<RefereeGameListItem>` and `EligibleOpenGamesResponse`). Their `.items` access keeps working.

**Files to migrate (all 28):**

- [ ] `apps/web/src/components/admin/dashboard/dashboard-view.tsx`
- [ ] `apps/web/src/components/admin/sync/use-sync.ts`
- [ ] `apps/web/src/components/admin/matches/match-list-table.tsx`
- [ ] `apps/web/src/components/admin/matches/match-detail-page.tsx`
- [ ] `apps/web/src/components/admin/matches/match-change-history.tsx`
- [ ] `apps/web/src/app/[locale]/admin/teams/teams-table.tsx`
- [ ] `apps/web/src/components/admin/standings/standings-view.tsx`
- [ ] `apps/web/src/components/admin/venues/venue-list-table.tsx`
- [ ] `apps/web/src/components/admin/bookings/booking-list-table.tsx`
- [ ] `apps/web/src/components/admin/bookings/create-booking-dialog.tsx`
- [ ] `apps/web/src/components/admin/settings/club-config.tsx`
- [ ] `apps/web/src/components/admin/settings/tracked-leagues.tsx`
- [ ] `apps/web/src/components/admin/settings/booking-config.tsx`
- [ ] `apps/web/src/components/admin/notifications/notification-center.tsx`
- [ ] `apps/web/src/components/admin/notifications/event-browser.tsx` (domainEvents — pass parsed query + qs string)
- [ ] `apps/web/src/components/admin/notifications/watch-rules-list.tsx`
- [ ] `apps/web/src/components/admin/notifications/channel-configs-list.tsx`
- [ ] `apps/web/src/components/admin/push-test-card.tsx`
- [ ] `apps/web/src/components/admin/referee-hub/referees/referee-list.tsx`
- [ ] `apps/web/src/components/admin/referee-hub/referees/referee-detail.tsx`
- [ ] `apps/web/src/components/admin/referee-hub/referees/rules-subtab.tsx`
- [ ] `apps/web/src/components/admin/referee-hub/referees/history-subtab.tsx` (refereeHistoryGames — pass parsed query + qs string)
- [ ] `apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.tsx`
- [ ] `apps/web/src/components/admin/referee-hub/open-slots/open-slots-tab.tsx`
- [ ] `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx`
- [ ] `apps/web/src/components/admin/referee-hub/open-slots/open-slot-detail.tsx`
- [ ] `apps/web/src/components/admin/referee-hub/open-slots/candidate-picker.tsx`
- [ ] `apps/web/src/hooks/use-board.ts`

- [ ] **Step: After each file (or small batch), typecheck + test the web package**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web test`
Expected: clean types; existing component tests still pass. Component tests that assert a fetched URL (e.g. `upcoming-subtab.test.tsx` checks `/eligible-open-games`) still hold because the registry hits the same route.

- [ ] **Step: Commit (batch by area is fine, e.g. one commit per feature folder)**

```bash
git add -A
git commit -m "refactor(web): migrate <area> useSWR reads to typed query registry"
```

---

### Task 5: Migrate the 13 server SSR fallback builders

**The transform:** build the fallback key and data from the same `makeQueries(sApi)` entry, replacing the independently-written `sApi.x.method(...)` + `fallback[SWR_KEYS.x]` pair.

```ts
// before
const sApi = await getServerApi();
const standings = await sApi.standings.list();
fallback[SWR_KEYS.standings] = standings;

// after
const sApi = await getServerApi();
const q = makeQueries(sApi);
const r = q.standings();
fallback[r.key] = await r.fetcher();
```

For the existing `Promise.allSettled` pattern (e.g. `app/[locale]/admin/page.tsx`), build the entries first, settle their fetchers, and key the fallback off the same entries:

```ts
const sApi = await getServerApi();
const sq = makeQueries(sApi);
const refsQ = sq.refereesPaginated({ scope: "own", limit: 50 });
const standingsQ = sq.standings();
const todayQ = sq.dashboardTodayMatches(today);

const [referees, standings, todayMatches] = await Promise.allSettled([
  refsQ.fetcher(), standingsQ.fetcher(), todayQ.fetcher(),
]);

const fallback: Record<string, unknown> = {};
if (referees.status === "fulfilled") fallback[refsQ.key] = referees.value;
if (standings.status === "fulfilled") fallback[standingsQ.key] = standings.value;
if (todayMatches.status === "fulfilled") fallback[todayQ.key] = todayMatches.value;
```

**Files to migrate (all 13):**

- [ ] `apps/web/src/app/[locale]/admin/page.tsx`
- [ ] `apps/web/src/app/[locale]/admin/matches/page.tsx`
- [ ] `apps/web/src/app/[locale]/admin/teams/page.tsx`
- [ ] `apps/web/src/app/[locale]/admin/standings/page.tsx`
- [ ] `apps/web/src/app/[locale]/admin/venues/page.tsx`
- [ ] `apps/web/src/app/[locale]/admin/bookings/page.tsx`
- [ ] `apps/web/src/app/[locale]/admin/settings/page.tsx`
- [ ] `apps/web/src/app/[locale]/admin/boards/[boardId]/page.tsx`
- [ ] `apps/web/src/app/[locale]/admin/notifications/page.tsx`
- [ ] `apps/web/src/app/[locale]/admin/notifications/rules/page.tsx`
- [ ] `apps/web/src/app/[locale]/admin/notifications/channels/page.tsx`
- [ ] `apps/web/src/components/admin/sync/referee-sync-tab.tsx`
- [ ] `apps/web/src/components/admin/sync/sync-run-provider.tsx`

Note: `getServerApi()` returns the same `Api` shape as the browser `api`, so `makeQueries(sApi)` type-checks identically. The keys produced are byte-identical to the browser keys (they depend only on `SWR_KEYS`, not the client), so client hydration matches.

- [ ] **Step: Typecheck + test after migration**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web test`
Expected: clean; page/server tests pass.

- [ ] **Step: Commit**

```bash
git add -A
git commit -m "refactor(web): source SSR SWR fallback from the typed query registry"
```

---

### Task 6: Retire `apiFetcher` and guard against reintroduction

**Files:**
- Modify: `apps/web/src/lib/swr.ts`
- Modify: `apps/web/eslint.config.mjs`

- [ ] **Step 1: Confirm no remaining `apiFetcher` consumers**

Run: `grep -rn "apiFetcher" apps/web/src --include="*.ts*" | grep -v "lib/swr.ts"`
Expected: no output. If any remain, finish migrating them (Task 4) before continuing.

- [ ] **Step 2: Delete `apiFetcher`**

Replace the contents of `apps/web/src/lib/swr.ts` with an empty module marker (the file may be re-targeted later), or delete the file and remove its references. Since nothing imports it after Step 1, delete it:

```bash
git rm apps/web/src/lib/swr.ts
```

- [ ] **Step 3: Update the ESLint fetch-guard message and ban re-importing the raw client/fetcher in components**

In `apps/web/eslint.config.mjs`, update the `no-restricted-globals` `fetch` message to drop the `apiFetcher` recommendation:

```ts
          message:
            "Use the typed client: `api`/`getServerApi()` from @/lib/api(.server), or the `queries` registry from @/lib/swr-queries for SWR reads. Raw fetch is only for non-JSON (blob/multipart) and must carry an eslint-disable with a reason.",
```

Add a `no-restricted-imports` rule in the same `src/**` block (which already ignores `src/lib/**` and tests) so components cannot reach past the registry:

```ts
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/api",
              importNames: ["browserClient"],
              message:
                "Components use `api` or the `queries` registry, not the raw browserClient.",
            },
          ],
        },
      ],
```

- [ ] **Step 4: Lint the web package**

Run: `pnpm --filter @dragons/web lint`
Expected: 0 errors. (If a sanctioned blob/multipart call trips a rule, it already carries an inline `eslint-disable` — leave those.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(web): delete apiFetcher; guard SWR reads onto the typed registry"
```

---

### Task 7: Full verification gate

- [ ] **Step 1: Typecheck the monorepo**

Run: `pnpm typecheck`
Expected: 9/9 successful.

- [ ] **Step 2: Lint the monorepo**

Run: `pnpm lint`
Expected: 9/9 successful, 0 errors.

- [ ] **Step 3: Coverage (gated)**

Run: `pnpm coverage`
Expected: all packages pass their thresholds. The new `swr-queries.ts` must be covered by `swr-queries.test.ts`; the new `referee-admin.ts` method by `referee-admin.test.ts`. Never lower a threshold. (If Redis `ECONNREFUSED:6379` noise appears, judge by exit code and re-run once if it flakes.)

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: 2/2 successful.

- [ ] **Step 5: AI-slop + coverage-script checks**

Run: `pnpm check:ai-slop && pnpm check:coverage-scripts`
Expected: both pass.

- [ ] **Step 6: Final commit (if any incidental fixes were needed)**

```bash
git add -A
git commit -m "test(web): close coverage on the typed SWR query registry"
```

---

## Self-Review

**Spec coverage:** §1 registry → Tasks 2-3. §2 client sites → Task 4. §3 server fallback → Task 5. §4 keys-as-identity (SWR_KEYS untouched) → honored throughout; `mutate` sites untouched per §6. §5 retire fetcher + guard → Task 6. §7 testing → Task 1/2/3 tests + Task 7 gate. §8 scope: the one method gap (`eligibleOpenGames`) → Task 1; out-of-scope keys excluded in the mapping and File Structure. All spec sections map to a task.

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". The registry body is given in full; the call-site transform is one uniform mechanical rule with two fully-worked examples plus the complete file list (28 + 13 enumerated). The two non-uniform sites (`domainEvents`, `refereeHistoryGames` — raw-qs-string keys) are called out explicitly with their handling.

**Type consistency:** `makeQueries`/`queries`/`Api`/`normReferees`/`normRefereeGames`/`eligibleOpenGames` are used consistently across tasks. Group names match `create-api.ts` (`refereeAdmin`, `referees`, `channelConfigs`, `watchRules`, `boards`, etc.). Registry method names match the verified factory signatures in the mapping table.

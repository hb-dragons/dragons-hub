# SWR → typed-query-registry migration

Date: 2026-06-11
Status: Approved (design)
Follows: `2026-06-10-phase3-web-contracts-migration-design.md`

## Problem

`apps/web` reads server data through SWR. Every client `useSWR` call routes through one
untyped fetcher:

```ts
// apps/web/src/lib/swr.ts
export const apiFetcher = <T>(endpoint: string): Promise<T> =>
  browserClient.get<T>(endpoint);
```

The endpoint is a hand-built string from `apps/web/src/lib/swr-keys.ts` (~50 keys), and the
response type is supplied by a hand-written `<T>` generic at each of the 45 call sites. Three
consequences:

1. **No inferred read types.** The `<T>` on each `useSWR` is maintained by hand and can drift
   from what the API actually returns. The compiler does not check it against the real route.
2. **The typed factory's GET surface is unused on the client.** `@dragons/api-client` exposes
   typed GET wrappers (`api.refereeAdmin.listReferees`, `api.matches.get`, channel-config
   providers, referee counts/detail/rules/history, etc.). The server path already calls them;
   the client path bypasses them entirely via the string fetcher. Many wrappers therefore have
   no call site and exist only as contract-test surface.
3. **Hand-built key strings can drift from real routes/params.** Because `apiFetcher` does
   `browserClient.get(key)`, a wrong key string produces a wrong request, silently.

The server already calls the typed factory directly (e.g.
`apps/web/src/app/[locale]/admin/page.tsx` calls `sApi.standings.list()`), then stores the
result under a `SWR_KEYS` string for SWR fallback hydration. So the typed path exists — the
client read path just does not use it.

## Goal

One outcome covering all three: client reads get types **inferred** from the api-client factory,
the typed GET surface becomes actually used, and the key strings stop being able to drive a wrong
request. Rollout is a single big-bang change across all `useSWR` sites.

## Constraint: each key plays three roles

A `SWR_KEYS` string is, today, simultaneously:

- the **fetcher input** (`apiFetcher` calls `browserClient.get(key)`),
- the **cache identity** for `mutate(key)` invalidation, and
- the **SSR fallback hydration key** that server components inject as
  `fallback: { [SWR_KEYS.x]: data }`.

The cache identity must stay byte-stable across the server fallback build, the client `useSWR`,
and every `mutate` site, or hydration and invalidation break. The design preserves the key
strings exactly and only changes how data is fetched.

## Approach: bound typed-query registry

Chosen over two alternatives:

- **Structured tuple/object keys + inline per-hook fetchers** — most idiomatic SWR typing, but
  every `mutate` and SSR-fallback site must convert to `unstable_serialize`. Too large a blast
  radius for a big-bang.
- **Dispatch-table fetcher (rewrite only `apiFetcher` to parse+dispatch by path)** — tiny diff,
  but stays stringly-typed and keeps the hand-written generics. Fails goals 1 and 3.

### 1. `makeQueries(client)` — the registry

New file `apps/web/src/lib/swr-queries.ts`:

```ts
import { createApi } from "@dragons/api-client";
import { SWR_KEYS } from "./swr-keys";
import { api } from "./api";

type Api = ReturnType<typeof createApi>;

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
    refereesPaginated: (opts: RefereesOpts = {}) => {
      const norm = normalizeReferees(opts);            // defaults applied once
      return {
        key: SWR_KEYS.refereesPaginated(norm),
        fetcher: () => api.refereeAdmin.listReferees(norm),
      };
    },
    // …one entry per ~37 client-consumed keys
  } as const;
}

export const queries = makeQueries(api);   // browser-bound, for client components
```

Each entry binds one cache key and one typed fetcher that calls the real factory method. The
registry is parameterized by an `Api` instance so the browser client (`api`) and the server
client (`sApi`) produce identical keys while binding their own client.

Where a key takes parameters with defaults (e.g. `refereesPaginated`, `refereeGamesFiltered`),
the entry normalizes its input **once** and derives both the key and the typed request from that
single normalized object. This removes the currently-implicit coupling where `SWR_KEYS` applies
its own defaults and the server independently passes explicit args that must happen to match.

### 2. Client call sites (45 `useSWR` sites)

```ts
// before
const { data } = useSWR<PaginatedResponse<RefereeListItem>>(
  canViewReferees ? SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 }) : null,
  apiFetcher,
);

// after
const q = queries.refereesPaginated({ scope: "own", limit: 50 });
const { data } = useSWR(canViewReferees ? q.key : null, q.fetcher);
```

The manual `<T>` generic is dropped — `data` is inferred as the factory method's return type.
Conditional fetching is unchanged: a `null` key disables the request, and `q.fetcher` is never
called in that case. SWR keys cache identity off the key, not the fetcher reference, so creating
a fresh `q` per render is fine.

### 3. Server fallback builders (`page.tsx` files)

```ts
const q = makeQueries(sApi);
const r = q.standings();
const res = await r.fetcher();
fallback[r.key] = res;
```

This closes a latent bug class. Today the server writes `fallback[SWR_KEYS.x]` and the client
reads `useSWR(SWR_KEYS.x)` from two independently hand-written sites that can diverge (most
sharply in the `refereesPaginated` defaults coupling). Sourcing key and fetcher from the same
registry entry makes them aligned by construction. The existing `Promise.allSettled` +
conditional `fallback[...]` assignment pattern composes with this unchanged.

### 4. What `SWR_KEYS` becomes

`swr-keys.ts` stays as the cache-key source of truth, reused by the registry and by the
unchanged `mutate(SWR_KEYS.x)` sites. The conceptual shift: after this migration the key strings
are **opaque cache identities, not request paths**. The actual HTTP path lives in the typed
factory method. That is what removes the drift class — a wrong key string can no longer cause a
wrong request, because the key is no longer used to build the request. The param-embedding in
keys (e.g. `matchDetail(id)`, the `refereesPaginated` query string) stays, because it is still
needed for per-query cache uniqueness.

### 5. Retire the string fetcher and guard it

Delete `apiFetcher` from `apps/web/src/lib/swr.ts`. Add an ESLint guard against reintroducing
`browserClient.get(<string literal>)` or `apiFetcher` in components, mirroring the Phase 3
`fetchAPI` guard. This keeps the read path on the registry over time.

### 6. `mutate()` sites

Unchanged. They keep passing `SWR_KEYS.x` strings, which remain the cache identity. No churn, no
risk. Optional later symmetry (`queries.x().key`) is out of scope.

## Testing

- `swr-queries.test.ts`: mock an `Api`, call each query builder, assert (a) `key` equals the
  expected `SWR_KEYS` string and (b) `fetcher()` dispatches to the right factory method with the
  normalized arguments. This directly covers the §1 defaults-coupling correctness.
- Type level: dropping the manual generics makes `tsc` enforce response types at every call site,
  so a future drift fails the build.
- The web coverage gate must stay green with the new file fully covered. Do not lower any
  threshold (per-package measured floor + ratchet-up).

## Scope and risk

- Build a per-key mapping table (key → factory method) during planning. Spot-checks needed:
  - `users` — `SWR_KEYS.users` is already the non-path string `"admin-users"`; confirm it maps
    to `api.user.list()`.
  - `refereeSyncStatus` / `refereeSyncLogs` / `refereeSyncSchedule` — these reuse the sync
    endpoints with `syncType=referee-games`; confirm the typed `sync.*` methods accept that
    parameter.
  - Any consumed key lacking a typed method: add the method and its `*.contract.test.ts` as part
    of this work.
- The `.csv` download keys (`refereeHistoryGamesCsv`, `refereeHistoryLeaderboardCsv`) are not in
  the `useSWR` set — they are download links and stay out of scope.
- Big-bang: one change migrating all sites. The blast radius is bounded to the `useSWR` sites
  plus the server fallback builders, because the key strings (§4) and the `mutate` sites (§6) are
  untouched.

## Out of scope

- Converting `mutate` sites to a typed key accessor.
- Touching the `.csv` / blob download paths.
- Any change to the api-client factory beyond adding a missing GET method a consumed key needs.

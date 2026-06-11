# Design — single-source normalization for `refereeGamesFiltered`

Date: 2026-06-11
Status: approved (pending implementation plan)

## Problem

The web client normalizes referee-games query options in **three** places, and the
three copies must agree byte-for-byte or the SWR cache key and the actual request
silently diverge.

Normalization = apply defaults (`status` → `"active"`, `limit` → `100`, `offset` → `0`)
and join `league: string[]` → `league: string` (comma-separated) for the request.

The three copies today:

1. `SWR_KEYS.refereeGamesFiltered` (`apps/web/src/lib/swr-keys.ts`) — builds the cache
   key string from raw opts, applying its own defaults and doing its own
   `league.join(",")`.
2. `normRefereeGames` (`apps/web/src/lib/swr-queries.ts`) — applies the same defaults
   and join to produce the object handed to the fetcher.
3. `apps/web/src/app/[locale]/admin/referees/page.tsx` — the SSR fallback builds the
   key from raw opts via `SWR_KEYS.refereeGamesFiltered(...)` **and** hand-duplicates
   the same opts literal into `serverApi.referees.getGames(...)`.

The post-migration review flagged copy (1)+(2) as a "residual coupling": the two
default sets must stay in sync. Copy (3) is a third, SSR-only duplicate of the same
opts. Nothing enforces agreement except discipline.

## Constraint: byte-identical cache key

SWR keys here are **in-memory per session** — there is no `localStorage` persistence
and no custom SWR cache provider (verified: no `localStorage` usage in
`apps/web/src`, no `provider:`/`cache:` config on `SWRConfig`). So only *internal
consistency within a session* is strictly required, not identity with the old key
scheme.

Even so, the refactor **preserves the exact key string**. It is zero-cost to keep
(the normalized object already has the same field insertion order the serializer
uses) and it removes any need to audit `mutate()` sites or SSR-fallback hydration for
a key change. Byte-identity is therefore a design constraint, not just a nicety.

## Design

### One normalizer, two derivations

Introduce a single canonical normalizer. Both the cache key and the fetcher input
derive from its output, so the defaults and the `league` join exist in exactly one
place. The key serializer can no longer hold a second copy of that logic — agreement
becomes structural rather than conventional.

### New module: `apps/web/src/lib/referee-games-query.ts`

Exports:

- `RawRefereeGamesOpts` — the caller-facing shape: every field optional,
  `league?: string[]`. Becomes the registry entry's public input type.
- `NormalizedRefereeGamesQuery` — defaults applied (`status`, `limit`, `offset`
  always present), `league?: string` (joined, present only when the input array was
  non-empty). Assignable to `@dragons/api-client`'s `RefereeGamesQueryParams`, so it
  is exactly what `api.referees.getGames` accepts.
- `normalizeRefereeGamesQuery(opts: RawRefereeGamesOpts): NormalizedRefereeGamesQuery`
  — the sole normalizer, moved verbatim from the current `normRefereeGames` body.

A dedicated module avoids a circular import: `swr-keys.ts` needs the normalized type
for its serializer signature, and `swr-queries.ts` already imports `SWR_KEYS`. Both
import the normalizer/types from this new leaf module instead.

Rejected alternative: place the normalizer inside `swr-keys.ts`. Fewer files, but it
mixes request-shaping into what is otherwise a pure cache-key string map.

### `SWR_KEYS.refereeGamesFiltered` becomes a pure serializer

Signature changes from raw opts to:

```ts
refereeGamesFiltered: (q: NormalizedRefereeGamesQuery): string
```

It serializes `q` into the query string using the **same fixed parameter order** as
today: `status, limit, offset, slotStatus, gameType, dateFrom, dateTo, league,
search, assignedRefereeApiId`. Because:

- the normalized object is produced with that same field insertion order,
- the same conditional-inclusion rules apply (optional fields included only when
  truthy / array non-empty / `assignedRefereeApiId != null`),
- `URLSearchParams` preserves insertion order,

the resulting string is byte-identical to the current output for every input.

### Call-site changes

- **Registry** (`swr-queries.ts`):

  ```ts
  refereeGamesFiltered: (opts: RawRefereeGamesOpts = {}) => {
    const norm = normalizeRefereeGamesQuery(opts);
    return {
      key: SWR_KEYS.refereeGamesFiltered(norm),
      fetcher: () => api.referees.getGames(norm),
    };
  }
  ```

  The input type is now `RawRefereeGamesOpts`, no longer
  `Parameters<typeof SWR_KEYS.refereeGamesFiltered>[0]` — the registry no longer
  derives its public input type from a cache-key builder's signature.

- **`page.tsx`** (SSR fallback): replace the hand-built `gamesKey` plus the duplicated
  `getGames(...)` literal with one registry call bound to the server client:

  ```ts
  const gamesQ = makeQueries(serverApi).refereeGamesFiltered({
    status: "active", dateFrom: today, dateTo: to, gameType: "both", limit: 200,
  });
  try { fallback[gamesQ.key] = await gamesQ.fetcher(); } catch {}
  ```

  This removes the third copy entirely; key and request now derive from one opts
  object server-side, identical to the client path.

- **`open-games-list.tsx` / `upcoming-subtab.tsx`**: unchanged. They still pass raw
  opts (including `league: string[]`) to `queries.refereeGamesFiltered`.

## Testing

- **Byte-identity regression test** (`swr-keys.test.ts`): pin the literal expected key
  string for representative inputs — a defaults-only opts and a full opts with a
  multi-element `league` array — so the wire key is locked against future drift in
  either the normalizer or the serializer.
- **Update** the existing `swr-queries.test.ts` cases (around lines 264–282): `q.key`
  now equals `SWR_KEYS.refereeGamesFiltered(normalizeRefereeGamesQuery(opts))`; keep
  the assertion that key and fetcher stay derived from the same input.
- Add a focused unit test for `normalizeRefereeGamesQuery` covering: defaults applied
  when fields omitted; `league: string[]` joined; empty `league` array omitted;
  `assignedRefereeApiId: 0` retained (`!= null`, not truthiness).
- Full gate green before finishing: `pnpm typecheck`, `pnpm lint`, `pnpm test`,
  `pnpm coverage`, `pnpm build`. Web coverage stays at or above its current floor
  (never lower a threshold).

## Out of scope

- No change to the API route, the `RefereeGamesQueryParams` contract, or the wire
  format.
- No change to the other registry entries or `SWR_KEYS` members.
- The `status` enum mismatch between `RawRefereeGamesOpts` (`"active" | "all"`) and
  the API's wider `RefereeGamesQueryParams.status` is left as-is; the narrow set is a
  subset and stays assignable.

# Phase 3 — Web → contracts/api-client full migration (design)

Date: 2026-06-10
Workstream: Phase 3 of the architecture-audit remediation (`docs/2026-06-08-architecture-audit.md`).
Branch scope: one workstream, executed as ordered slices that each land green.

## Problem

Web runs three data-layer entry points instead of one:

- `apps/web/src/lib/api.ts` — client-side `fetchAPI` (`credentials: "include"`) plus a duplicate `APIError` class.
- `apps/web/src/lib/api.server.ts` — `fetchAPIServer`, a thin wrapper that forwards cookies via `next/headers` for server components.
- `apps/web/src/lib/api-client.ts` — already wires `publicApi` through the shared `ApiClient` (the partial adoption).

229 `fetchAPI`/`fetchAPIServer` call sites across 68 files hand-build URL strings and cast responses. The shared `@dragons/api-client` exists and native uses it for everything, but it only implements 4 of ~26 endpoint groups (public, devices, referee, board). The result is the cross-client duplication the api-client package was built to remove: two `APIError` classes, two auth/baseURL code paths, request shapes typed once for native and re-stringly-typed for web. Audit findings #1, #2, #5, #6 (HIGH) and #3 (the reorder bug) all trace to this.

## Target end state

- One typed web data layer on `@dragons/api-client` + `@dragons/contracts`. `api.ts` (`fetchAPI` + duplicate `APIError`) and `api.server.ts` (`fetchAPIServer`) are deleted.
- Call sites consume `api` (browser singleton) and `getServerApi()` (async, per-request cookie forwarding).
- api-client covers every web-used endpoint group; request bodies/queries typed from `@dragons/contracts`, responses from `@dragons/shared`; one `.contract.test.ts` per group.
- A single `APIError` (api-client's), with error parsing fixed to the real `{ error, code, details }` envelope.
- An eslint guard prevents reintroducing a bespoke fetch wrapper, closing the audit's "adoption is never enforced" root cause.
- `AGENTS.md` documents the unified data layer.

## Consumption shape (drives every call site)

Aggregated, namespaced client:

```ts
// client component / hook
import { api } from "@/lib/api";
const rows = await api.bookings.list();
await api.boards.reorderColumns(boardId, cols);

// server component
import { getServerApi } from "@/lib/api";
const api = await getServerApi();           // forwards cookies()
const data = await api.matches.list({ page: 1 });
```

`createApi(client)` returns all groups namespaced and lives in `@dragons/api-client`. Native composes factories individually today (with its 401-recovery `onResponse` guard); `createApi` does not disturb that and native may adopt it later.

## Components

### 1. `@dragons/api-client`

- **`createApi(client)`** aggregator → `{ public, devices, referees, boards, bookings, matches, notifications, channelConfigs, events, sync, settings, social, teams, watchRules, league, venues, users, scoreboard, broadcast, refereeHistory, refereeRules, notificationTest }`. Composes existing + new `xEndpoints(client)` factories. Exported from the package index.
- **~22 new `xEndpoints(client)` factories** following the existing `admin-board.ts` convention: request types `import type` from `@dragons/contracts`, response types from `@dragons/shared`, methods delegate to `client.get/post/patch/delete`. One `.contract.test.ts` per factory asserting each request body/query parses against its contract schema.
- **Error-parsing fix (`client.ts`):** the API envelope is `{ error, code, details }` (see `apps/api/src/middleware/validation.ts`), but `client.ts` reads `errorRecord["message"]`, which is almost always absent, so it falls back to `response.statusText`. Read `error` (fallback `message`) for the `APIError` message; keep `code`. Web's `fetchAPI` reads `body.message || body.error` today, so without this fix the migration degrades error messages. Unit-tested.
- **Reorder/position fix:** `reorderColumns` must send `{ columns }` (the API reads `body.columns`), not `{ order }`; add `position` to the column-update body typing so it matches `columnUpdateBodySchema`. (Audit #3, #6.) The new `.contract.test.ts` for boards locks this.
- **`cache` option:** add `cache?: RequestCache` to `ApiClientOptions`, applied to the request init, so the server client can request `no-store`. (Confirm during planning whether Next 16's uncached-by-default fetch makes this a belt-and-braces nicety rather than a behavior change.)

### 2. Web wiring — `apps/web/src/lib/api.ts` rewritten

```ts
import { ApiClient, createApi, APIError } from "@dragons/api-client";

const browserClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  credentials: "include",
});
export const api = createApi(browserClient);
export { APIError };
```

```ts
// apps/web/src/lib/api.server.ts  (server-only)
import "server-only";
import { cookies } from "next/headers";
import { ApiClient, createApi } from "@dragons/api-client";

export async function getServerApi() {
  const cookieHeader = (await cookies()).toString();
  const client = new ApiClient({
    baseUrl: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
    cache: "no-store",
    auth: { getHeaders: () => (cookieHeader ? { Cookie: cookieHeader } : {}) },
  });
  return createApi(client);
}
```

The 11 files importing `APIError` from `@/lib/api` keep working (re-export) or are repointed to `@dragons/api-client`.

### 3. Call-site migration (229 sites / 68 files)

- Client/hooks: `fetchAPI<T>(path, init)` → `api.<group>.<method>(...)`.
- Server components: `fetchAPIServer<T>(path)` → `(await getServerApi()).<group>.<method>(...)`.
- Manual `URLSearchParams` construction → typed query objects passed to the factory method.

### 4. Cleanup + guard

- Delete `api.ts`'s `fetchAPI`/`getBaseURL`/`APIError` and `api.server.ts`'s `fetchAPIServer` once no call sites remain (the rewritten `api.ts` keeps only `api`/`APIError` export).
- eslint `no-restricted-imports`/`no-restricted-syntax` guard forbidding a reintroduced bespoke fetch wrapper.
- Update `AGENTS.md` data-model/data-layer section.

## `@dragons/contracts` in this migration

Contracts is mostly the finished Phase 1 foundation this workstream **consumes**. It holds **request** schemas only (body + query). **Response types stay in `@dragons/shared`** — the "responses are also hand-maintained" issue is audit finding #6, a separate workstream, and is explicitly out of scope here. The `.contract.test.ts` per factory is the binding that makes "migrate onto contracts" real rather than cosmetic.

Two concrete contracts tasks the factories force:

1. **Type-alias export gaps.** Factories import inferred types (`import type { BoardCreateBody } from "@dragons/contracts"`). Some contract files export only the schema, not the `z.infer` alias. Each group's slice ensures the request schemas it consumes also export their inferred-type alias.
2. **Coverage gaps — schema *plus* route validator.** A few web-used endpoints have no contract: `assistant`, `referee-assignment`, `referee-eligible-games`, and the partial groups (`league`, `user`, `venue`) where web sends bodies/queries not yet schema'd. Per `CLAUDE.md`, a request contract is the route's single source of truth, so filling a gap means **add the schema to `@dragons/contracts` AND wire the route's `validator(...)` + `c.req.valid(...)`** — which pulls the **API route** into that slice. Pure GET endpoints with no params (e.g. `standings`, `teams`, `home`) need no contract, only a shared response type.

## Per-group slice checklist

For each group:

1. **Contract:** confirm/add the request schema + exported `z.infer` alias; if absent, also wire the route validator (gap groups only).
2. **api-client:** add `xEndpoints` factory (request from contracts, response from shared) + `.contract.test.ts`; register in `createApi`.
3. **Web:** migrate that group's call sites; drop its `fetchAPI` usages.
4. Green gate passes; slice lands.

## Execution order (grounded in actual web usage)

Usage counts from path-string buckets in `apps/web/src`:

| Group | paths | ~usages | contract | factory today |
|---|---|---|---|---|
| boards + tasks | `/admin/boards`, `/admin/tasks` | 49 | yes | `adminBoardEndpoints` |
| referees | `/admin/referees`, `/admin/referee*` | 32 | yes (self/history/rules) | partial (`refereeEndpoints` = `/referee/games`) |
| matches | `/admin/matches` | 23 | yes | none |
| sync | `/admin/sync` | 22 | yes | none |
| notifications | `/admin/notifications` | 15 | partial | none |
| social | `/admin/social` | 13 | yes | none |
| settings | `/admin/settings` | 13 | yes | none |
| bookings | `/admin/bookings` | 13 | yes | none |
| teams | `/admin/teams` | 8 | yes | none |
| channel-configs | `/admin/channel-configs` | 7 | yes | none |
| broadcast | `/admin/broadcast`, `/public/broadcast` | 8 | yes | none |
| watch-rules | `/admin/watch-rules` | 6 | yes | none |
| events | `/admin/events` | 5 | yes | none |
| venues | `/admin/venues` | 4 | partial (search) | none |
| standings | `/admin/standings` | 4 | GET, likely none needed | none |
| users | `/admin/users` | 3 | partial (referee link) | none |
| scoreboard | `/admin/scoreboard`, `/public/scoreboard` | 3 | yes | none |
| referee/games | `/referee/games` | 2 | yes | `refereeEndpoints` |
| dashboard | `/admin/dashboard` | 1 | gap | none |

- **Slice 0 — foundation:** `createApi` scaffold over the 4 existing groups; rewritten web `api.ts` + `api.server.ts` (`api`, `getServerApi`); error-parsing fix; reorder/position fix; re-export `APIError`. Migrate the already-covered groups' web call sites (boards/tasks, referee/games, public). Lands the plumbing and the highest-traffic group.
- **Slices 1..N — per group/batch:** the remaining groups by the checklist, batched by area to keep diffs reviewable. **Gap-group slices** (`assistant`, `referee-assignment`, `referee-eligible-games`, `users`, `venues`, `league`, `dashboard`) are larger because they also add a contract + wire a route validator — flagged so they are not mistaken for client-only slices.
- **Final slice:** delete `api.ts`/`api.server.ts` fetch wrappers, add the eslint guard, update `AGENTS.md`.

## Testing

- Per factory: `.contract.test.ts` asserting request body/query parses against its contract (the pattern that would have caught the reorder bug).
- Error-parsing fix: unit test asserting `{ error, code, details }` → `APIError.message === error`, `APIError.code === code`.
- Touched web hooks/components keep or gain tests.
- Full green gate per slice: `pnpm typecheck && pnpm lint && pnpm test && pnpm coverage && pnpm build && pnpm check:ai-slop && pnpm check:coverage-scripts`. Both web and api-client coverage ratchets must stay green — never lower a threshold.

## Risks

- **Response-type gaps.** Some web call sites use local/inline response types absent from `@dragons/shared`. Per group: move the type to shared (preferred) or define an api-client-local response type. Resolved during planning per slice.
- **Server cache semantics.** Confirm Next 16's default fetch caching so the `cache: "no-store"` server client preserves current behavior exactly.
- **Large diff.** Mitigated by slicing and a per-slice green gate; the branch stays mergeable throughout.

## Out of scope (other audit findings)

- Response/return-type single source of truth (finding #6's response half) — separate workstream.
- RBAC engine consolidation, `pgEnum` promotion, `@dragons/shared` split — other Phase 3 workstreams.
- Native adopting `createApi` — optional follow-up.

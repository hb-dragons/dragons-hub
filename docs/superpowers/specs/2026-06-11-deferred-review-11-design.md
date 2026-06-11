# Design — Implement the 11 deferred REVIEW.md items

**Date:** 2026-06-11
**Branch:** `review/deferred-11` (off `main` @ `9002e58`)
**Source tracker:** `apps/api/REVIEW.md` — the 11 `[~]` deferred/decided items.

The user has chosen to override every deferral and implement all 11. This spec records the
agreed approach for each, including the four design forks resolved up front:

- **H14** → full: new `partial` status + `failedStep` + per-step counts + migration.
- **L7** → explicit `getDb()` / `getRedis()` getters; update all call sites.
- **H5** → new `superadmin` role gating `/admin/queues/*`.
- **L19** → extract a shared per-device error-mapper; reuse in both paths (no template/dedup coupling).

## Ordering and commits

Branch `review/deferred-11`, one commit per item, schema migration first. Each commit runs the
gates (`pnpm --filter @dragons/api {test,typecheck,lint}` + `pnpm check:ai-slop`). Coverage stays
at or above the `apps/api` bar (90% branches / 95% funcs/lines/stmts).

Order:

1. Schema migration (Group A) — H14 + C5 columns, partial status union.
2. H14 — partial-failure semantics.
3. M1b + M7e — outbox poller to BullMQ repeatable.
4. C5 — multi-instance-safe stale-run reclaim.
5. H11 — coalesce map to Redis.
6. H5 — Bull Board behind superadmin.
7. H6 — explicit wide-view allowlist.
8. M3a — contracts validators.
9. L7 — getDb() / getRedis() codemod.
10. L19 — shared per-device error-mapper.
11. L15 — remove emoji.

## Group A — schema (one migration, first)

`syncRuns` (`packages/db/src/schema/sync-runs.ts`) gains:

- `failedStep varchar(40)` nullable (H14).
- `ownerInstanceId varchar(40)` nullable (C5).

`status` is a TS-typed `varchar(20)` (no Postgres enum), so adding `"partial"` is a constant change
in `packages/shared/src/constants.ts` `SYNC_STATUSES` — no SQL type change. Per-step committed counts
already flow through `syncRunEntries`; no new counter columns needed.

Process: `pnpm --filter @dragons/db db:generate` → review generated SQL → `db:migrate`. Update
`AGENTS.md` data model.

## H14 — partial-failure semantics

`services/sync/index.ts` runs six steps. Track which step is executing. On a fatal error:

- nothing committed yet → `status: "failed"` (unchanged behavior).
- at least one step committed → `status: "partial"` + `failedStep: <step name>`.

Success with `allErrors.length > 0` stays `completed` — those are non-fatal per-item errors already
recorded in `syncRunEntries`. Tests: a simulated mid-step throw yields a `partial` row naming the
failed step; a first-step throw yields `failed`.

## M1b + M7e — outbox poller to BullMQ repeatable

Today `services/events/outbox-poller.ts` runs on a module-level `setInterval(30s)` started from
`workers/index.ts`. Convert to a BullMQ repeatable job (mirrors the existing push-receipt and
task-reminder cron patterns):

- `workers/queues.ts`: add `outboxPollQueue` ("outbox-poll"); register repeatable
  `jobId: "outbox-poll-cron"`, `repeat: { every: 30_000 }`.
- `workers/outbox-poll.worker.ts`: new worker, `concurrency: 1`, handler wraps `pollOutbox()` in
  `runWithTrace(undefined, …)` (cron has no inbound request trace; a fresh context is fine).
- `workers/index.ts`: remove `startOutboxPoller()`; drop the interval plumbing from
  `outbox-poller.ts` (keep the `pollOutbox()` function and `claimBatch()` unchanged).

M7e: the lag metric (`outboxLagSeconds`, 503 at >300s) already exists in `/health/deep` from the
prior M5d work. The only addition is including `outboxPollQueue` in the `/health/deep` queue counts.

Tests: worker handler invokes `pollOutbox`; repeatable registered with the fixed jobId; health
includes the new queue.

## C5 — multi-instance-safe stale-run reclaim

Replace the unconditional startup reclaim (`workers/index.ts:27-43`, marks every `running` row
`failed`) with a heartbeat-gated reclaim:

- Each worker process generates an `ownerInstanceId` (ULID) at startup.
- When a run transitions to `running`, stamp `ownerInstanceId` on the `syncRuns` row.
- Each instance writes a Redis heartbeat `worker:hb:<instanceId>` with `EX 60`, refreshed on a
  ~20s interval.
- Startup reclaim marks a `running` row `failed` only if its `ownerInstanceId` heartbeat key is
  absent (the owner is dead). A live peer's run is left untouched.

The shutdown path (`workers/index.ts:250-261`) only reclaims rows owned by the shutting-down
instance. Tests: peer heartbeat present → row untouched; absent → reclaimed.

## H11 — coalesce map to Redis

Replace the in-process `recentDispatches` Map in `services/notifications/notification-pipeline.ts`
with `redis.set("coalesce:<entityType>:<entityId>", "1", "EX", 60, "NX")`. A `null` reply means a
dispatch already happened in the window → skip. This removes both the unbounded-map cap and the
multi-instance coalescing gap. Tests (mock redis): the second dispatch inside the window is skipped.

## H5 — Bull Board behind `superadmin`

- `packages/shared/src/rbac.ts`: add a `superadmin` role holding all statements; add it to `roles`
  and `ROLE_NAMES`.
- `app.ts`: gate `/admin/queues/*` with `requireAnyRole("superadmin")` (was `"admin"`).

Operational note (documented in AGENTS.md): existing admins must be granted `superadmin` to retain
Bull Board access. Tests: admin-only user → 403 on `/admin/queues`; superadmin → 200.

## H6 — explicit wide-view allowlist

Today `referee/games.routes.ts` uses `requireRefereeSelfOrPermission("assignment", "view")`, which
grants wide (cross-referee) visibility to any holder of `assignment.view` — implicitly `admin` and
`refereeAdmin`. Make the allowlist explicit: a `requireRefereeSelfOrAdminRole(["admin",
"refereeAdmin"])` variant in `middleware/rbac.ts`, consumed by the route. Behavior is preserved.
Tests: per-role matrix on `/referee/games` (linked referee scoped to self; admin and refereeAdmin
wide; neither → 403).

## M3a — contracts validators

Move the manual `Number()` / `parseInt()` param and query parsing to `@dragons/contracts` schemas
and the canonical `validator(...) + c.req.valid(...)` pattern. Affected routes:
`referee/games.routes.ts`, `admin/referee-assignment.routes.ts`, `admin/league.routes.ts`, and the
numeric `last-event-id` handling in `public/scoreboard.routes.ts`. (The `deviceId` string checks are
not numeric coercion and stay as-is unless a `deviceId` schema already covers them.)

- Add param/query schemas to the relevant `packages/contracts/src/*.ts` files using
  `z.coerce.number().int().positive()` (and the page bounds for referee-assignment); re-export from
  `index.ts`.
- Add `*.contract.test.ts` assertions.

Accepted trade-off: the 400 body changes from the routes' current
`{ error, code: "VALIDATION_ERROR" }` to the central `validationHook` shape
`{ error, code, details }`. Any route test asserting the old shape is updated.

## L7 — `getDb()` / `getRedis()`

Replace the Proxy-based lazy singletons in `config/database.ts` and `config/redis.ts` with lazy
getter functions `getDb()` / `getRedis()` (retaining `closeDb()` and `createRedisClient()`). Update
the call sites — **78 `db` imports + 6 `redis` imports** — via a careful codemod
(`import { db }` → `import { getDb }`; `db.` → `getDb().`), then verify with typecheck. This is the
largest and highest-risk item; it lives in its own commit and is verified independently before
moving on.

## L19 — shared per-device error-mapper

Extract a `mapTicketError(ticket)` helper (in `services/notifications/expo-push.client.ts` next to
the ticket type) and use it in both `services/notifications/channels/push.ts` and
`routes/admin/notification-test.routes.ts`. Unify the precedence on
`ticket.message ?? ticket.details?.error ?? "unknown"` (the two call sites currently disagree on
order). Tests: ticket variants map identically through both callers.

## L15 — remove emoji

`routes/admin/notification-test.routes.ts`: `"🏀 Dragons — Test"` → `"Dragons — Test"` (two spots).

## Verification

Per item: `pnpm --filter @dragons/api {test,typecheck,lint}` + `pnpm check:ai-slop`; coverage at or
above 90/95. After the schema item: `pnpm --filter @dragons/db db:generate` + `db:migrate`. Final:
full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.

## Docs to update

- `AGENTS.md`: data model (new `syncRuns` columns + `partial` status), the new outbox-poll queue,
  the C5 heartbeat reclaim, the H5 `superadmin` role and its operational note.
- `apps/api/REVIEW.md`: flip the 11 `[~]` items to `[x]` with the implementing commit, and update
  the tally to 100 done / 0 deferred / 0 open.

# Deferred REVIEW.md (11 items) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 11 `[~]` deferred items from `apps/api/REVIEW.md` on branch `review/deferred-11`.

**Architecture:** One commit per item, schema migration first. Each item is largely independent. The risky mechanical change (L7, 84 call sites) is isolated late. Every task is TDD: failing test → minimal impl → green → commit. Gates per commit: `pnpm --filter @dragons/api {test,typecheck,lint}` + `pnpm check:ai-slop`.

**Tech Stack:** Hono, Drizzle ORM (Postgres), BullMQ + ioredis, Zod (`@dragons/contracts`), Vitest, better-auth RBAC (`@dragons/shared`).

**Conventions (from CLAUDE.md):** No `any`. Tests co-located `*.test.ts`. No AI/Co-Authored-By commit trailers. `Edit`/`Write` require a prior `Read` of the file in-session. Coverage bar for `apps/api`: 90% branches / 95% funcs/lines/stmts.

---

## Task 1: Schema migration — `partial` status + `failedStep` + `ownerInstanceId`

**Files:**
- Modify: `packages/shared/src/constants.ts` (SYNC_STATUSES union)
- Modify: `packages/db/src/schema/sync-runs.ts` (two columns)
- Create: `packages/db/drizzle/00XX_*.sql` (generated)
- Test: `packages/shared/src/constants.test.ts` (if present) — assert `"partial"` is in the union

- [ ] **Step 1: Read the files**

Read `packages/shared/src/constants.ts` (lines ~14-20) and `packages/db/src/schema/sync-runs.ts` (lines ~21-44).

- [ ] **Step 2: Add `"partial"` to SYNC_STATUSES**

In `packages/shared/src/constants.ts`, add `"partial"` to the `SYNC_STATUSES` array:

```ts
export const SYNC_STATUSES = ["pending", "running", "completed", "failed", "partial"] as const;
```

- [ ] **Step 3: Add the two columns to syncRuns**

In `packages/db/src/schema/sync-runs.ts`, inside the `syncRuns` table after `errorStack`:

```ts
  failedStep: varchar("failed_step", { length: 40 }),
  ownerInstanceId: varchar("owner_instance_id", { length: 40 }),
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: a new `packages/db/drizzle/00XX_*.sql` with two `ALTER TABLE "sync_runs" ADD COLUMN`. Review it — it must contain only those two columns, no destructive statements.

- [ ] **Step 5: Apply the migration (requires Postgres up)**

Run: `docker compose -f docker/docker-compose.dev.yml up -d` then `pnpm --filter @dragons/db db:migrate`
Expected: migration applies cleanly.

- [ ] **Step 6: Typecheck + test shared/db**

Run: `pnpm --filter @dragons/shared test && pnpm --filter @dragons/db typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/constants.ts packages/db/src/schema/sync-runs.ts packages/db/drizzle
git commit -m "feat(db): add partial sync status, failedStep and ownerInstanceId columns"
```

---

## Task 2: H14 — partial-failure semantics

**Files:**
- Modify: `apps/api/src/services/sync/index.ts` (status/errorMessage logic, ~50-345)
- Test: `apps/api/src/services/sync/index.test.ts`

- [ ] **Step 1: Read** `apps/api/src/services/sync/index.ts` in full to see the six steps, the `allErrors` accumulation, the success update (~210-228) and the catch/failure update (~322-327).

- [ ] **Step 2: Write the failing test**

Add to `index.test.ts` a test that forces a throw inside a step *after* at least one step has committed, and asserts the run row ends with `status: "partial"` and a non-null `failedStep`. Add a second test: throw in the first step → `status: "failed"`, `failedStep` set to the first step name. Mirror the existing test setup in the file (mock SDK/data-fetcher).

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- index.test.ts`
Expected: FAIL (status is `failed`, not `partial`; `failedStep` undefined).

- [ ] **Step 4: Implement**

Introduce a `let currentStep: string | null = null` and a `let committedAny = false` in the orchestrator. Set `currentStep` before each of the six steps (e.g. `currentStep = "leagues"`, `"fetch"`, `"entities"`, `"matches"`, `"assignments"`, `"finalize"`); set `committedAny = true` after any step that performs a write. In the catch block, set:

```ts
status: committedAny ? "partial" : "failed",
failedStep: currentStep,
```

Keep `errorMessage`/`errorStack` as-is.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test -- index.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/sync/index.ts apps/api/src/services/sync/index.test.ts
git commit -m "feat(sync): partial status + failedStep on mid-run failure (H14)"
```

---

## Task 3: M1b + M7e — outbox poller as BullMQ repeatable job

**Files:**
- Modify: `apps/api/src/workers/queues.ts` (new queue + repeatable registration)
- Create: `apps/api/src/workers/outbox-poll.worker.ts`
- Modify: `apps/api/src/workers/index.ts` (wire worker; remove `startOutboxPoller`)
- Modify: `apps/api/src/services/events/outbox-poller.ts` (drop interval plumbing; keep `pollOutbox`)
- Modify: `apps/api/src/routes/health.routes.ts` (include new queue in counts)
- Test: `apps/api/src/workers/outbox-poll.worker.test.ts`, `apps/api/src/workers/queues.test.ts`

- [ ] **Step 1: Read** `workers/queues.ts` (esp. push-receipt repeatable ~211-218 and task-reminder ~342-351), `workers/index.ts` (~63-77), `services/events/outbox-poller.ts` (~98-120), `routes/health.routes.ts` (~103-115), `workers/push-receipt.worker.ts` (worker shape).

- [ ] **Step 2: Add the queue + repeatable registration**

In `workers/queues.ts`, add:

```ts
export const outboxPollQueue = new Queue("outbox-poll", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
  defaultJobOptions: { removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } },
});
```

In the scheduled-jobs init function (where push-receipt-reconcile-cron is added), add:

```ts
await outboxPollQueue.add(
  "poll",
  {},
  { jobId: "outbox-poll-cron", repeat: { every: 30_000 }, removeOnComplete: true, removeOnFail: 100 },
);
```

- [ ] **Step 3: Create the worker**

`workers/outbox-poll.worker.ts`:

```ts
import { Worker, type Job } from "bullmq";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { runWithTrace } from "../config/log-context";
import { pollOutbox } from "../services/events/outbox-poller";

const log = logger.child({ worker: "outbox-poll" });

export const outboxPollWorker = new Worker<unknown>(
  "outbox-poll",
  (_job: Job<unknown>) =>
    runWithTrace(undefined, async () => {
      const enqueued = await pollOutbox();
      if (enqueued > 0) log.debug({ enqueued }, "outbox poll enqueued events");
      return { enqueued };
    }),
  { prefix: "{bull}", connection: { url: env.REDIS_URL }, concurrency: 1 },
);
```

(Confirm `runWithTrace` accepts `undefined` as first arg by reading `config/log-context.ts`; if it requires a value, pass the no-trace sentinel it uses.)

- [ ] **Step 4: Wire the worker, remove setInterval**

In `workers/index.ts`: import `outboxPollWorker` so it's instantiated; remove the `startOutboxPoller();` call. In `services/events/outbox-poller.ts`: delete `pollerInterval`, `startOutboxPoller`, `stopOutboxPoller`; keep `pollOutbox` and `claimBatch`. Grep for other references to `startOutboxPoller`/`stopOutboxPoller` and remove/adjust them (and their tests).

- [ ] **Step 5: Add the new queue to /health/deep counts**

In `routes/health.routes.ts`, where `domainEventsQueue.getJobCounts(...)` is called, add an `outboxPollQueue.getJobCounts("waiting","active","delayed","failed")` block exposing `checks.outboxPollQueue`.

- [ ] **Step 6: Write tests**

`outbox-poll.worker.test.ts`: mock `pollOutbox` and assert the worker handler calls it and returns `{ enqueued }`. In `queues.test.ts`: assert `outboxPollQueue.add` is called with `jobId: "outbox-poll-cron"` and `repeat: { every: 30000 }` during scheduled-jobs init (mirror the existing push-receipt assertion).

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @dragons/api test -- outbox-poll.worker.test.ts queues.test.ts outbox-poller.test.ts`
Expected: PASS (after updating `outbox-poller.test.ts` to drop interval-based tests).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/workers apps/api/src/services/events/outbox-poller.ts apps/api/src/services/events/outbox-poller.test.ts apps/api/src/routes/health.routes.ts
git commit -m "feat(events): run outbox poller as a BullMQ repeatable job + health counts (M1b, M7e)"
```

---

## Task 4: C5 — multi-instance-safe stale-run reclaim

**Files:**
- Create: `apps/api/src/workers/instance-heartbeat.ts` (instanceId + heartbeat helpers)
- Modify: `apps/api/src/workers/index.ts` (heartbeat start; gated reclaim at ~27-43 and shutdown ~250-261)
- Modify: `apps/api/src/services/sync/index.ts` and/or `workers/sync.worker.ts` (stamp `ownerInstanceId` on run start)
- Test: `apps/api/src/workers/instance-heartbeat.test.ts`, reclaim test in `workers/index.test.ts`

- [ ] **Step 1: Read** `workers/index.ts` (full, esp. 27-43 + 250-261), `workers/sync.worker.ts` (where `syncRuns.status` is set to `"running"`), and confirm how `ulid` is imported elsewhere (`services/events/event-publisher.ts`).

- [ ] **Step 2: Create heartbeat helper**

`workers/instance-heartbeat.ts`:

```ts
import { ulid } from "ulid";
import { redis } from "../config/redis"; // becomes getRedis() after Task 9
import { logger } from "../config/logger";

const log = logger.child({ module: "instance-heartbeat" });
export const INSTANCE_ID = ulid();
const HB_KEY = (id: string) => `worker:hb:${id}`;
const HB_TTL_SEC = 60;
const HB_REFRESH_MS = 20_000;

let timer: ReturnType<typeof setInterval> | null = null;

export async function writeHeartbeat(): Promise<void> {
  await redis.set(HB_KEY(INSTANCE_ID), "1", "EX", HB_TTL_SEC);
}
export function startHeartbeat(): void {
  if (timer) return;
  void writeHeartbeat();
  timer = setInterval(() => void writeHeartbeat().catch((err) => log.error({ err }, "heartbeat write failed")), HB_REFRESH_MS);
}
export function stopHeartbeat(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
export async function isInstanceAlive(instanceId: string | null): Promise<boolean> {
  if (!instanceId) return false;
  return (await redis.exists(HB_KEY(instanceId))) === 1;
}
```

- [ ] **Step 3: Stamp ownerInstanceId on run start**

Where the sync run is set to `status: "running"` (insert at `services/sync/index.ts` ~68/81, and/or `sync.worker.ts`), also set `ownerInstanceId: INSTANCE_ID`.

- [ ] **Step 4: Gate the reclaim**

In `workers/index.ts` startup, replace the unconditional `UPDATE ... WHERE status = 'running'` with: select running rows + their `ownerInstanceId`, then for each, mark `failed` only if `!(await isInstanceAlive(row.ownerInstanceId))`. Call `startHeartbeat()` before the reclaim so this instance's own future runs are protected. In shutdown (~250-261), only reclaim rows `WHERE status='running' AND ownerInstanceId = INSTANCE_ID`, and call `stopHeartbeat()`.

- [ ] **Step 5: Write tests**

`instance-heartbeat.test.ts`: mock redis; assert `writeHeartbeat` SETs with EX 60; `isInstanceAlive` returns false for null and maps `exists` result. Reclaim test: row owned by a *live* instance (exists=1) is NOT marked failed; row owned by a *dead* instance (exists=0) IS marked failed.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @dragons/api test -- instance-heartbeat.test.ts index.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/workers/instance-heartbeat.ts apps/api/src/workers/index.ts apps/api/src/workers/instance-heartbeat.test.ts apps/api/src/services/sync/index.ts apps/api/src/workers/sync.worker.ts
git commit -m "feat(workers): heartbeat-gated stale-run reclaim, multi-instance safe (C5)"
```

---

## Task 5: H11 — coalesce map to Redis

**Files:**
- Modify: `apps/api/src/services/notifications/notification-pipeline.ts` (~30-60, call site ~388/454)
- Test: `apps/api/src/services/notifications/notification-pipeline.test.ts`

- [ ] **Step 1: Read** `notification-pipeline.ts` lines ~28-60, ~380-395, ~450-460, and an existing `redis.set(... "EX" ... "NX")` site (`routes/admin/notification-test.routes.ts:56`).

- [ ] **Step 2: Write the failing test**

Add a test: two dispatches for the same `entityType:entityId` within the window — assert the second is coalesced (skipped). Mock `redis.set` to return `"OK"` on first call, `null` on second.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- notification-pipeline.test.ts`
Expected: FAIL (current code uses the in-memory Map, not redis).

- [ ] **Step 4: Implement**

Remove `recentDispatches` Map, `COALESCE_WINDOW_MS` cleanup branch, and `markDispatched`. Replace the coalesce check with an atomic claim:

```ts
const claim = await redis.set(`coalesce:${entityType}:${entityId}`, "1", "EX", 60, "NX");
const alreadyDispatched = claim !== "OK";
```

Use `alreadyDispatched` where the old `isRecentlyDispatched(...)` boolean was used; delete the separate `markDispatched` call (the SET NX both checks and claims).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test -- notification-pipeline.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/notifications/notification-pipeline.ts apps/api/src/services/notifications/notification-pipeline.test.ts
git commit -m "feat(notifications): Redis SET NX coalesce window, multi-instance safe (H11)"
```

---

## Task 6: H5 — Bull Board behind `superadmin`

**Files:**
- Modify: `packages/shared/src/rbac.ts` (new role)
- Modify: `apps/api/src/app.ts` (~54 gate)
- Test: `packages/shared/src/rbac.test.ts` (if present), `apps/api/src/app.test.ts` or an rbac/permission test

- [ ] **Step 1: Read** `packages/shared/src/rbac.ts` (full), `apps/api/src/app.ts` (~20-56), and `apps/api/src/middleware/rbac.ts` `requireAnyRole`.

- [ ] **Step 2: Add the `superadmin` role**

In `packages/shared/src/rbac.ts`, define `superadmin` mirroring `admin` (inherits `adminAc.statements` + all catalog permissions). Add to `roles` object and to `ROLE_NAMES`:

```ts
export const ROLE_NAMES = ["admin", "superadmin", "refereeAdmin", "venueManager", "teamManager", "coach"] as const;
```

- [ ] **Step 3: Gate the queues route**

In `app.ts`, change the Bull Board gate from `requireAnyRole("admin")` to `requireAnyRole("superadmin")`.

- [ ] **Step 4: Write/extend tests**

Assert: a user with role `admin` (only) → 403 on `GET /admin/queues`; a user with `superadmin` → not 403. Mirror existing `requireAnyRole` tests. If `rbac.test.ts` enumerates roles, update it to include `superadmin`.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dragons/shared test && pnpm --filter @dragons/api test -- app.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/rbac.ts packages/shared/src/rbac.test.ts apps/api/src/app.ts apps/api/src/app.test.ts
git commit -m "feat(rbac): gate Bull Board behind new superadmin role (H5)"
```

---

## Task 7: H6 — explicit wide-view allowlist

**Files:**
- Modify: `apps/api/src/middleware/rbac.ts` (new `requireRefereeSelfOrAdminRole`)
- Modify: `apps/api/src/routes/referee/games.routes.ts` (~20 gate)
- Test: `apps/api/src/middleware/rbac.test.ts`, `apps/api/src/routes/referee/games.routes.test.ts`

- [ ] **Step 1: Read** `middleware/rbac.ts` (~96-118, `requireRefereeSelfOrPermission`), `routes/referee/games.routes.ts` (~12-68), and the existing `rbac.test.ts` referee cases.

- [ ] **Step 2: Write the failing test**

In the route test, assert the per-role matrix on `/referee/games`: linked-referee (no admin role) → scoped (`refereeId` set); `admin` → wide (`refereeId` null); `refereeAdmin` → wide; user with neither role nor referee link → 403.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- games.routes.test.ts`
Expected: FAIL if asserting on the new middleware name; otherwise confirm current behavior baseline.

- [ ] **Step 4: Implement**

Add `requireRefereeSelfOrAdminRole(roleNames: string[])` to `rbac.ts`: if the user has any listed role → wide view (do not set `refereeId`); else if the user is a referee → set `c.set("refereeId", user.refereeId)`; else 403. Switch `games.routes.ts` gate to `requireRefereeSelfOrAdminRole(["admin", "refereeAdmin"])`. Keep `requireRefereeSelfOrPermission` if other routes use it; otherwise remove and update its tests.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test -- games.routes.test.ts rbac.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/rbac.ts apps/api/src/middleware/rbac.test.ts apps/api/src/routes/referee/games.routes.ts apps/api/src/routes/referee/games.routes.test.ts
git commit -m "feat(rbac): explicit referee wide-view role allowlist at route (H6)"
```

---

## Task 8: M3a — contracts validators

**Files:**
- Modify: `packages/contracts/src/referee.ts`, `referee-assignment.ts` (create if absent), `league.ts`, `scoreboard.ts`; `packages/contracts/src/index.ts` re-exports
- Modify routes: `apps/api/src/routes/referee/games.routes.ts`, `admin/referee-assignment.routes.ts`, `admin/league.routes.ts`, `public/scoreboard.routes.ts`
- Test: `packages/contracts/src/*.contract`-style tests + update affected route tests

- [ ] **Step 1: Read** `packages/contracts/src/match.ts` + `match.test.ts` (canonical pattern), `apps/api/src/middleware/validation.ts` (validationHook shape), and each target route's current manual parsing.

- [ ] **Step 2: Add schemas + tests in contracts**

For each route group, add schemas e.g.:

```ts
// referee.ts
export const refereeApiMatchParamSchema = z.object({ apiMatchId: z.coerce.number().int().positive() });
export const refereeMatchIdParamSchema = z.object({ matchId: z.coerce.number().int().positive() });
export const refereeGameIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
// referee-assignment.ts
export const spielplanIdParamSchema = z.object({ spielplanId: z.coerce.number().int().positive() });
export const refAssignmentPageQuerySchema = z.object({
  pageFrom: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});
export const slotNumberParamSchema = z.object({ slotNumber: z.coerce.number().int().refine((n) => n === 1 || n === 2, "slotNumber must be 1 or 2") });
// league.ts
export const leagueIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
```

Re-export each from `index.ts`. Add unit tests asserting coercion + rejection (mirror `match.test.ts`).

- [ ] **Step 3: Run contracts tests to verify they pass**

Run: `pnpm --filter @dragons/contracts test`
Expected: PASS.

- [ ] **Step 4: Switch routes to validators**

In each route, replace the manual `Number()`/guard with `validator("param"|"query", <schema>, validationHook)` middleware and read via `c.req.valid(...)`. Mirror `match.routes.ts`. For `public/scoreboard.routes.ts`, only the numeric `last-event-id` parsing moves; leave the `deviceId` presence check.

- [ ] **Step 5: Update affected route tests**

Any test asserting the old 400 body `{ error, code: "VALIDATION_ERROR" }` for these routes must expect the central shape `{ error: "Invalid request data", code: "VALIDATION_ERROR", details: [...] }`. Run each route's test file and fix assertions.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @dragons/contracts test && pnpm --filter @dragons/api test -- games.routes.test.ts referee-assignment.routes.test.ts league.routes.test.ts scoreboard`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src apps/api/src/routes
git commit -m "refactor(api): numeric route params via @dragons/contracts validators (M3a)"
```

---

## Task 9: L7 — `getDb()` / `getRedis()` (the big codemod)

**Files:**
- Modify: `apps/api/src/config/database.ts`, `apps/api/src/config/redis.ts`
- Modify: ~78 `db` import sites + 6 `redis` import sites under `apps/api/src/`
- Note: `services/events/redis-channel-fanout.ts` uses `createRedisClient` factory (unchanged); `instance-heartbeat.ts` (Task 4) and `notification-pipeline.ts` (Task 5) use `redis` → update here too.

- [ ] **Step 1: Read** `config/database.ts` and `config/redis.ts` (full).

- [ ] **Step 2: Replace the proxies with getters**

`config/database.ts`:

```ts
import { createDb, type Database } from "@dragons/db";
import type { Pool } from "pg";
import { env } from "./env";

let _db: Database | undefined;
let _pool: Pool | undefined;

export function getDb(): Database {
  if (!_db) { const c = createDb(env.DATABASE_URL); _db = c.db; _pool = c.pool; }
  return _db;
}
export async function closeDb(): Promise<void> {
  if (_pool) { await _pool.end(); _pool = undefined; _db = undefined; }
}
```

`config/redis.ts`: keep `createRedisClient()`; replace the `redis` Proxy with:

```ts
let _redis: Redis | undefined;
export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    _redis.on("connect", () => logger.info("Redis connected"));
    _redis.on("error", (err) => logger.error({ err }, "Redis connection error"));
  }
  return _redis;
}
```

- [ ] **Step 3: Codemod the call sites**

Enumerate sites:
```bash
grep -rl "import { db }" apps/api/src --include=*.ts
grep -rln "from \"\\.\\?\\.*config/redis\"" apps/api/src --include=*.ts
```
For each db file: change `import { db }` → `import { getDb }` (preserve other named imports like `closeDb`), and replace usages of the `db` value with `getDb()`. Safest mechanical form: add `const db = getDb();` at the top of each function that uses `db`, OR rename import to `getDb` and do `getDb().` — pick the form that keeps diffs minimal per file and passes typecheck. Do **not** use a blind global `db.`→`getDb().` sed (it will hit substrings and shadowed locals). Work file-by-file (Read before Edit). Same for the 6 redis sites + the two new sites from Tasks 4 and 5.

- [ ] **Step 4: Typecheck (the verifier for this task)**

Run: `pnpm --filter @dragons/api typecheck`
Expected: clean. Fix any missed site until clean.

- [ ] **Step 5: Full API test run**

Run: `pnpm --filter @dragons/api test`
Expected: PASS. Update any test that imported the `db`/`redis` proxy directly (search test files too).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src
git commit -m "refactor(config): explicit getDb()/getRedis() getters, drop Proxy singletons (L7)"
```

---

## Task 10: L19 — shared per-device error-mapper

**Files:**
- Modify: `apps/api/src/services/notifications/expo-push.client.ts` (export `mapTicketError`)
- Modify: `apps/api/src/services/notifications/channels/push.ts` (~157)
- Modify: `apps/api/src/routes/admin/notification-test.routes.ts` (~129-131)
- Test: `apps/api/src/services/notifications/expo-push.client.test.ts`

- [ ] **Step 1: Read** `expo-push.client.ts` (ticket type ~45-50), `channels/push.ts` (~140-178), `notification-test.routes.ts` (~115-133).

- [ ] **Step 2: Write the failing test**

In `expo-push.client.test.ts`, test `mapTicketError`: `{status:"error",message:"X"}` → `"X"`; `{status:"error",details:{error:"Y"}}` → `"Y"`; both present → `"X"` (message wins); `{status:"error"}` → `"unknown"`; `{status:"ok"}` → `null`.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- expo-push.client.test.ts`
Expected: FAIL (`mapTicketError` not defined).

- [ ] **Step 4: Implement**

In `expo-push.client.ts`:

```ts
export function mapTicketError(ticket: ExpoPushTicket | undefined): string | null {
  if (ticket?.status === "ok") return null;
  return ticket?.message ?? ticket?.details?.error ?? "unknown";
}
```

Use it in `channels/push.ts` (replace the inline `error: ok ? null : (...)`) and in `notification-test.routes.ts` (replace `ok ? null : (t?.details?.error ?? t?.message ?? "unknown")` — note this unifies the precedence to message-first).

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dragons/api test -- expo-push.client.test.ts notification-test`
Expected: PASS. Adjust any notification-test assertion that depended on the old details-first precedence.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/notifications apps/api/src/routes/admin/notification-test.routes.ts
git commit -m "refactor(notifications): shared mapTicketError for per-device push errors (L19)"
```

---

## Task 11: L15 — remove emoji

**Files:**
- Modify: `apps/api/src/routes/admin/notification-test.routes.ts` (~94, ~123)
- Test: existing notification-test tests

- [ ] **Step 1: Read** the two lines with `"🏀 Dragons — Test"`.

- [ ] **Step 2: Edit** both to `"Dragons — Test"`.

- [ ] **Step 3: Update tests** if any assert the emoji title; run `pnpm --filter @dragons/api test -- notification-test`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/admin/notification-test.routes.ts
git commit -m "chore(api): drop emoji from admin test push title (L15)"
```

---

## Task 12: Docs + tracker + final gates

**Files:**
- Modify: `AGENTS.md` (data model, outbox-poll queue, C5 heartbeat, superadmin role)
- Modify: `apps/api/REVIEW.md` (flip 11 `[~]`→`[x]`, update tally to 100 done / 0 deferred / 0 open)

- [ ] **Step 1: Update AGENTS.md** — new `syncRuns` columns + `partial` status; the `outbox-poll` BullMQ queue replacing the setInterval; the heartbeat-gated reclaim; the `superadmin` role and the operational note (admins must be granted superadmin for Bull Board).

- [ ] **Step 2: Update REVIEW.md** — for C5, H5, H6, H11, M1b, M7e, M3a, L7, L15, L19, H14: change `[~]` to `[x]` with a one-line note + the implementing commit; update the Progress tally.

- [ ] **Step 3: Full gates**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm check:ai-slop && pnpm build`
Expected: all PASS. Then `pnpm --filter @dragons/api coverage` — confirm ≥ 90 branches / 95 funcs/lines/stmts.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md apps/api/REVIEW.md
git commit -m "docs: close the 11 deferred REVIEW.md items (tally 100/0/0)"
```

---

## Self-review notes

- **Spec coverage:** all 11 items map to Tasks 2-11; schema in Task 1; docs/tracker in Task 12. M7e is folded into Task 3 (health counts). ✓
- **Type consistency:** `getDb`/`getRedis`, `mapTicketError`, `requireRefereeSelfOrAdminRole`, `INSTANCE_ID`/`isInstanceAlive`, `failedStep`/`ownerInstanceId`, `outboxPollQueue`/`outboxPollWorker` used consistently across tasks. ✓
- **Ordering caveat:** Tasks 4 and 5 write `redis.` usages that Task 9 then migrates to `getRedis()`. Task 9's codemod step explicitly includes those two new sites. If executing out of order, re-grep before Task 9. ✓
- **DB dependency:** Tasks 1 (migrate) and any test hitting the real DB need `docker compose ... up -d`. Most API tests mock the DB or use PGLite. ✓

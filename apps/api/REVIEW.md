# API Package Review — Action Tracker

**Scope:** `apps/api`
**Review date:** 2026-05-04
**Branch state at review:** `main` clean, last commit `80d1c88`
**Method:** Inventory pass + automated sweep (lint, typecheck, coverage, audit, knip) + 3 parallel deep agents (code quality / architecture / security)

This document tracks every finding from the review, ordered for sequential fixing. Each item has a checkbox so progress is visible.

## Progress

After-fix baseline (2026-05-04, fourth pass):
- 158 test files, 2731 tests passing (was 153 / 2673 pre-review)
- Coverage: 96.92% stmts / 90.08% branches / 96.18% funcs / 97.45% lines
- Lint clean. Typecheck clean. AI-slop check passed.

### Fixed in this pass

**Critical (4 of 5 fixed; C5 mitigated by infra)**
- C1 XFF rate-limit bypass — `trustForwardedFor` pre-middleware rewrites XFF to LB-appended segment
- C2 SSE Redis subscribers — single shared subscriber + per-process connection cap (50/device, 1000 total)
- C3 Outbox poller lock window — split into atomic claim (`UPDATE...RETURNING` inside short tx) then enqueue outside tx
- C4 publishDomainEvent without tx — audited 36 sites; only `matches.sync.ts:744` was inside-tx, now passes `tx`
- C5 initializeWorkers race — not code-fixed; mitigated by `worker max_instances=1`. Documented in CC1.

**High (9 of 14 fixed)**
- H1 better-auth Redis secondaryStorage wired (`ba:` prefix)
- H2 + M7a Pino redaction deepened (deep paths, env-var redaction)
- H3 + H8 ingest rate-limit + notification-test cooldown moved to Redis (INCR/EXPIRE, SET NX EX)
- H4 `/openapi.json` and `/docs` gated behind `requireAnyRole("admin")` in production
- H7 ICS UID hostname from `BETTER_AUTH_URL` (not `x-forwarded-host`)
- H9 notification-test eventId via ULID (collision-proof under concurrency)
- H10 broadcast `setBroadcastLive` uses `FOR UPDATE` row lock; `BroadcastError` typed; route stops leaking error text
- H13 Expo client retries 5xx with exponential backoff (3 attempts)
- Per-identifier email lockout added (10 fails / 15 min → 30 min lockout, Redis-backed)
- H5/H6/H11/H12/H14 deferred — see CC1 / RBAC notes; not strictly required given infra constraints

**Medium (~16 of 32 fixed)**
- M3a partial / M3b user.routes.ts Zod body / M3 league id NaN handled
- M4a CSV formula-injection prefix
- M4b `/public/matches/:id` restricted to own-club matches
- M4d push token redacted from request log paths (`scrubPath`)
- M4e `/admin/users/:id/referee-link` requires `admin` role (not just `user.update`)
- M4f public scoreboard/broadcast deviceId validated against `SCOREBOARD_DEVICE_ID`
- M5d `/health/deep` endpoint (db, redis, outbox lag, last-sync age, queue counts)
- M6a `escapeLikePattern` extracted to `services/utils/sql.ts`; applied to sync-admin, referee-history, broadcast routes, notification-test
- M7b dead `whatsapp.provider.ts` deleted
- M7c unused imports in `event-admin.service.ts` + `notification-admin.service.ts` removed
- M7d retention windows moved to env (`SYNC_RUN_RETENTION_DAYS`, `DOMAIN_EVENT_RETENTION_DAYS`)
- M7h `pubsub.ts` JSON-parse failure logged instead of silent
- M7m broadcast `matchCache` entries gain 30s TTL (avoids stale data after match update)
- M7q `filter(!!id)` → `id > 0` (preserves valid 0)

**Low (3 fixed)**
- L4 duplicate `dragons://` in trustedOrigins removed
- L8 dead `security: []` on health route removed
- Misc: BroadcastError class for typed error handling

### Round 6 follow-ups (2026-05-04)

- H12 `triggerManualSync` race — deterministic `jobId: "manual-sync"` so concurrent triggers cannot create two parallel syncs
- M3c settings.routes referee-reminders parses `JSON.parse` in try/catch with sane fallback
- M4c player photo extension derived from validated content-type (not attacker filename)
- M4g `VERBOSE_ERRORS` env flag replaces `NODE_ENV !== production` check; staging that runs as development can no longer leak error messages
- M5a sync-admin + referee-history types moved out of `routes/admin/*.schemas.ts` into the service layer; route schemas re-export the types — services no longer import from routes
- M7l `releaseOverride` + `updateMatchLocal` resolve team names via `loadTeamNames` instead of stringifying API IDs
- M7n match.routes static `reconcileMatch` import (replaces dynamic import + `.then().catch`)
- M7o `setBroadcastLive` returns `null` for "no config existed" instead of synthesizing an empty stopped config
- M7p `enqueueDomainEvent` fire-and-forget now has `.catch` to satisfy strict-mode unhandled-rejection
- M7r SDK login deduplicates concurrent calls via `loginInFlight` promise
- M7s SDK `withRetry` wraps the final attempt's error with `cause` + attempt count
- Tests added: CSV formula prefix, player photo extension, settings malformed JSON, sdk-client login dedupe, broadcast race, queue manual sync state machine

### Round 7 follow-ups (2026-05-04)

- L2 env superRefine rejects `localhost` / `127.0.0.1` for `BETTER_AUTH_URL` when `NODE_ENV=production`
- L11 Expo client validates send + receipts response shapes via Zod; logs and aborts on drift
- L12 `maskToken` always masks, never returns plaintext for short tokens
- M2e `leagues.sync` parallelizes via `p-limit(5)` (was sequential)
- M3d `permission-coverage.test.ts` static-walks `routes/admin/*` and asserts every handler has an explicit `requirePermission` / `requireAnyRole` / `requireRefereeSelf` guard (with documented self-service exceptions)
- M6e `services/scoreboard/constants.ts` extracts `SCOREBOARD_ONLINE_THRESHOLD_MS`, `BROADCAST_STALE_THRESHOLD_MS`, and `computeSecondsSince`; consumed by admin/scoreboard, public/scoreboard, broadcast/publisher
- M7f `sync-logger` Redis publish failure now uses a 30s recovery cooldown instead of permanently disabling streaming for the run
- M7i magic thresholds split between scoreboard ↔ broadcast unified through the constants module
- New tests: env-schema validation (production URL rules + VERBOSE_ERRORS coercion), scoreboard constants

### Round 8 follow-ups (2026-05-04)

- M2a `referee-games.sync` batches existing-row + matches-id lookups via `inArray`; replaces N+1 per-game query pattern (drops ~2N round-trips per sync run)
- M6c `services/scoreboard/sse-helper.ts` extracts the SSE plumbing (encoder, controller, heartbeat, cancel cleanup); `services/scoreboard/sse.ts` and `routes/public/broadcast.routes.ts` both consume it
- M7g `services/notifications/channel-config-parsers.ts` adds Zod-backed `parseWhatsAppGroupConfig` / `parseInAppConfig` / `readLocale`; `notification-pipeline` and `digest.worker` use them, replacing `as unknown as WhatsAppGroupConfig` and `(config.config as Record<string, unknown>)?.locale as string` casts
- L9 `[lastSync, runningSync].filter(Boolean) as ...` → typed predicate
- L13 stramatel-decoder ASCII validation uses `for (const byte of payload)` instead of indexed `payload[i] as number`
- L20 `snapshotsDiffer` typed via `Pick<typeof liveScoreboards.$inferSelect, DedupeKey>` so callers no longer cast through `Record<string, unknown>`

### Round 9 follow-ups (2026-05-04)

- M2b match-admin: `tx.insert(matchChanges).values([...])` and `tx.insert(matchOverrides).values([...]).onConflictDoUpdate(...)` replace per-row inserts inside the transaction
- M2f push-receipt worker groups failures by errorCode and runs one UPDATE per distinct code (was N updates for N failures)
- M6b push templates: `_utils.ts` consolidates `truncate` + `formatDate` + `formatDe`; six template files now import them instead of defining their own copies
- L1 production cookie prefix is `__Secure-dragons` (must-be-secure semantics encoded in the name)
- L10 `GET /admin/sync/jobs` accepts a `limit` query param (1–500, default 100)

### Round 10 follow-ups (2026-05-04)

- M6f templates `render-chain.ts` extracts the renderer chain; both `index.ts` (renderEventMessage) and `digest.ts` (renderDigestMessage) consume the same `tryRenderEvent`. Digest now includes task events (was a silent feature gap)
- M2d `reorderColumns` issues parallel UPDATEs inside a single transaction instead of sequential awaits

### Decisions made (2026-05-04)

- **H5** Bull Board exposure → keep as-is (admin-gated). Acceptable risk for a small admin team. If admin pool grows, revisit and either gate behind a `superadmin` role or move behind IAP.
- **H6** `requireRefereeSelfOrPermission` widening → keep current behavior. `refereeAdmin` is an oversight role; cross-referee visibility is intended. `rbac.test.ts` covers all cases (linked-referee / admin / refereeAdmin / neither / both); route-level comment in `routes/referee/games.routes.ts` documents the contract.
- **H14** Sync orchestrator partial-failure → accept current behavior. Hash-skip makes re-running cheap. `failed` status means at least one step failed; check `syncRunEntries` for granular per-item log.
- **M5b** Service file gigantism → split `task.service.ts` into table-affinity files + extract pure functions out of `matches.sync.ts`. _(implementation pending)_
- **M5c** Domain event payload typing → per-event-type Zod schemas in `@dragons/shared`. Producers and consumers parse at the boundary. _(implementation pending)_
- **M5e** Data access layer → codify the pragmatic rule: queries repeated in 3+ places get a `*-query.service.ts` helper; otherwise inline Drizzle in the consuming service. Documented in `AGENTS.md`.

### Cleanup pass (2026-05-04, commit 85794e2)

- L3 `.env.example` BETTER_AUTH_SECRET recommendation bumped to 48 chars
- L5 verified via reading hono-openapi: `openAPIRouteHandler` caches the spec in a closure-scoped variable. No code change.
- L6 `index.ts` replaces the double-cast with a `Closable` interface satisfied by both `serve()` and `createServer()`
- L14 sync.worker `triggeredBy` uses an explicit `"cron" | "manual"` type rather than `as const` on one arm
- L16 comment on `/notifications/preferences` documents the caller-self semantics
- L18 sync-logger tracks `droppedEntries` count; orchestrator surfaces it on `syncRuns.errorMessage`
- L21 `isReferee` in `@dragons/shared` narrows to `user is U & { refereeId: number }`; `rbac.ts` drops the `as number` cast
- L23 `AGENTS.md` documents the subdomain-takeover risk on `.app.hbdragons.de` cookie domain
- L24 push template `TITLE_MAX` / `BODY_MAX` comment cites APNs/Android limits

### Remaining low-priority items

- L7 Proxy-based lazy singletons for `db`/`redis` — refactor risk too high; left in place
- L15 admin-test emoji `🏀` — left as human-authored product copy

## Baseline at review time

- 319 source files, 153 test files, 2673 tests passing
- Coverage: 97.02% stmts / 90.03% branches / 96.5% funcs / 97.58% lines
- Lint clean. Typecheck clean.
- `pnpm audit --prod`: 19 vulnerabilities (1 low, 18 moderate). All transitive; no direct prod-runtime impact today.

## How to use this doc

1. Work top-to-bottom. Items are ordered by impact + dependency.
2. Tick the checkbox when fixed and tested. Add a one-line note with commit SHA.
3. Each finding has: **Location** (file:line), **Problem** (what's wrong), **Fix** (concrete change), **Verify** (how to confirm).
4. If a finding is rejected after deeper investigation, change `[ ]` to `[~]` and add a one-line reason.
5. Cross-cutting themes are at the bottom — read them before starting Sprint 1 because several findings are best fixed together.

---

## Phase 1 — Critical (security + data correctness)

### C1. Login rate-limit bypass via `X-Forwarded-For` spoofing

- [ ] **Status:** todo
- **Location:** `apps/api/src/config/auth.ts:27-37`
- **Problem:** better-auth rate-limits sign-in at 5/min keyed by client IP, sourced from `x-forwarded-for[0].split(",")[0].trim()`. Google's HTTPS LB *appends* to a client-supplied XFF, so the attacker controls the first segment. Each request gets a fresh rate-limit key → effectively unlimited login attempts per second. Combined with `disableSignUp: true` the path is online password-guessing against any known operator email.
- **Fix:**
  1. Add a Hono pre-middleware that rewrites `x-forwarded-for` to its last entry (the LB-appended one) before better-auth sees it. Or set `advanced.ipAddress.ipAddressHeaders: ["x-real-ip"]` if Cloud Run sets it.
  2. Add a per-identifier (lower-cased email) lockout independent of IP — 10 failed attempts in 15 min → 30-min lockout, persisted in Redis.
- **Verify:** integration test that sends 20 sign-in attempts with rotating XFF values and expects 5 to succeed and 15 to be rate-limited.

### C2. Public SSE streams open one Redis subscriber per connection (DoS)

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/scoreboard/pubsub.ts:25-41, 60-76`; `routes/public/scoreboard.routes.ts:51-60`; `routes/public/broadcast.routes.ts:31-90`
- **Problem:** Both endpoints are unauthenticated and on every connection allocate a new ioredis client + `SUBSCRIBE`. No connection cap, no per-IP cap, no global cap. Attacker opens N concurrent streams → N Redis subscribers → exhausts Redis `maxclients` (default 10000) → kills ingest publishing AND BullMQ workers (shared Redis). Same pattern in `routes/admin/sync.routes.ts:322` (admin-gated, but identical resource leak).
- **Fix:**
  1. One shared subscriber per process. Fan out via in-process EventEmitter keyed by deviceId / channel. ioredis subscribers can subscribe to many channels on one connection.
  2. Add caps: `MAX_OPEN_STREAMS_PER_DEVICE = 50`, `MAX_OPEN_STREAMS_TOTAL = 1000`. Reject excess with 503.
  3. Validate `deviceId` against `liveScoreboards` table before opening subscription. Reject unknown IDs with 404.
- **Verify:** load test opening 200 concurrent SSE connections — Redis client count on the API process stays at 1 baseline. Open >cap connections → 503.

### C3. Outbox poller holds `FOR UPDATE` locks during BullMQ enqueue

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/events/outbox-poller.ts:20-86`
- **Problem:** `SELECT ... FOR UPDATE SKIP LOCKED` followed by `await domainEventsQueue.add(...)` for each row before the transaction commits. Locks held for the full BullMQ + Redis round-trip × batch size. Concurrent pollers blocked. If BullMQ add succeeds but the wrapping tx is rolled back (e.g. connection reset), the row is enqueued in Redis but `enqueued_at` is null → next poll enqueues it again.
- **Fix:** Split into two phases. Phase 1: open tx, `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 100`, immediately `UPDATE enqueued_at = now() RETURNING id`, commit. Phase 2: enqueue to BullMQ outside any transaction. Phase 1 holds locks for milliseconds. Or use optimistic claim: `UPDATE ... WHERE enqueued_at IS NULL RETURNING ...` to claim a batch atomically.
- **Verify:** test with two poller instances + concurrent writers; max-lock-time on `domain_events` rows stays sub-second.

### C4. `publishDomainEvent` called inside `db.transaction(...)` without `tx` (35 call sites)

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/sync/matches.sync.ts:744` plus 30+ more. Only `apps/api/src/services/admin/match-admin.service.ts:201, 382, 408, 432` correctly pass `tx`.
- **Problem:** `publishDomainEvent(params, tx?)` is correct: when `tx` is passed, the event row commits atomically with the state change. When omitted inside a `db.transaction(...)` body, the event commits independently. If the wrapping tx rolls back after the publish, the event has already been persisted and will be enqueued — phantom notification for a state change that never happened.
- **Fix:** Audit all 35 call sites. For each, decide:
  - Inside a `db.transaction(...)` body → must pass `tx`
  - After commit → leave as-is
  - Add an ESLint rule (custom) that flags `publishDomainEvent(...)` calls inside arrow-fn bodies passed to `db.transaction(...)` that don't pass `tx`. Or rename to `publishDomainEventOutsideTx` to force opt-in.
- **Verify:** grep for `publishDomainEvent` call sites; cross-reference each against its enclosing function for `db.transaction`. Expected zero call sites that are inside a transaction body without `tx`.

### C5. `initializeWorkers` marks all running syncs as failed on startup (multi-instance race)

- [ ] **Status:** todo
- **Location:** `apps/api/src/workers/index.ts:23-42, 246-278`
- **Problem:** Every worker startup unconditionally marks all `syncRuns.status = 'running'` rows as `failed` ("Stale: worker restarted"). Cloud Run autoscale or rolling deploys mean a new instance comes up while an old instance's sync is still running. The new instance flags the running sync as failed; the old instance's `syncWorker.on("completed")` then refuses to overwrite the now-`failed` row (status check at `sync.worker.ts:115`). Same pattern on shutdown.
- **Fix:** Either
  - **(a)** Declare single-instance worker as a hard constraint. Set Cloud Run `maxInstances: 1` for the worker service. Document it. Remove the FOR UPDATE SKIP LOCKED pretense if going this route.
  - **(b)** Redis-backed lease for "scheduler leadership" (only the leader runs scheduler init + stale-run cleanup; others just attach workers). Add a server `instanceId` column on `syncRuns`; only mark stale on rows whose instance hasn't heartbeat within N seconds.
- **Decision needed:** see Cross-cutting #1.
- **Verify:** simulate two worker instances starting 30s apart with a sync in flight on instance A — instance B does not mark A's sync as failed.

---

## Phase 2 — High

### Security

#### H1. Better-auth rate-limit storage in-memory; horizontal scale defeats it

- [ ] **Status:** todo
- **Location:** `apps/api/src/config/auth.ts:25-37` (file already comments this gap)
- **Problem:** Each Cloud Run instance has its own rate-limit map. Effective limit = configured × instance count. Combined with C1, login is nearly unrate-limited under load.
- **Fix:** Configure `secondaryStorage` (better-auth supports the option natively) backed by Redis. Same Redis instance the queue uses; namespace keys.
- **Verify:** spawn a second instance, attempt 10 logins distributed across both — only 5 succeed in the first minute total.

#### H2. SDK credentials in clear-text body; Pino redaction shallow

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/sync/sdk-client.ts:109-145`, `referee-sdk-client.ts:47-68`, `apps/api/src/config/logger.ts:43-56`
- **Problem:** SDK clients log in via `application/x-www-form-urlencoded` body containing `username=...&password=...`. Pino redaction config (`*.password`) only matches one-level keys; not `req.body.password`, `payload.user.password`, etc. Today no log line includes the body, but one careless `log.error({ body }, ...)` leaks the federation password to Cloud Logging.
- **Fix:**
  1. Centralize SDK login so password is never bound into a loggable shape: wrap as `{ form: { username, password } }` and add `*.form.password` to Pino redact list.
  2. Add deep paths to `redact`: use `**.password`, `**.token`, `**.secret` (or explicit list of `req.body.password`, `body.password`, `payload.password`, `data.password`).
  3. Explicitly redact env-var-shaped keys: `SDK_PASSWORD`, `BETTER_AUTH_SECRET`, `SCOREBOARD_INGEST_KEY`.
- **Verify:** log a synthetic object with nested `password` and `token` fields at every reasonable depth — none appear in stdout.

#### H3. Scoreboard ingest rate-limit is process-local

- [ ] **Status:** todo
- **Location:** `apps/api/src/middleware/ingest-key.ts:6-49`
- **Problem:** 30 req/sec per device cap is a `Map` in module scope. Per-process. Multiplies with instance count. Cleanup heuristic (size > 1024) rarely triggers under steady traffic from one device.
- **Fix:** Move counter to Redis with `INCR` + `EXPIRE` per second-window key (`ingest:rl:<deviceId>:<floor(t/1)>`). Drop the in-memory map entirely.
- **Verify:** with two API instances, send 60 req/sec to ingest from a single device-id → 50% are 429. (Currently both instances accept all 60.)

#### H4. `/openapi.json` and `/docs` world-readable in production

- [ ] **Status:** todo
- **Location:** `apps/api/src/app.ts:33-34` (mounted before any auth middleware)
- **Problem:** Anonymous attacker hits `https://api.app.hbdragons.de/openapi.json` and gets a complete enumeration of every admin endpoint, schema, request shape — free recon. Combined with C1, materially shortens the attack chain.
- **Fix:** In production: gate `/docs` and `/openapi.json` behind `requireAnyRole("admin")`. Or generate two specs (a public-routes-only one mounted unauthed, a full one under `/admin/docs`). Cloud-Run-only IP allowlist also acceptable.
- **Verify:** anonymous GET `/openapi.json` in prod returns 401/403; admin GET returns the spec.

#### H5. Bull Board UI exposed at `/admin/queues/*`

- [ ] **Status:** todo
- **Location:** `apps/api/src/app.ts:21-46`
- **Problem:** Admin-gated correctly via `requireAnyRole("admin")` — not unauthenticated leak. Concern: gives admin role total power to inspect/retry/fail/remove arbitrary BullMQ jobs (including manual sync triggers with user IDs in payloads). Bull Board has historical XSS / auth-bypass bugs. One compromised admin = total queue compromise.
- **Fix:** Either
  - Move Bull Board to a separate non-public service (private Cloud Run + IAP), or
  - Gate behind `superadmin` role separate from `admin`, or
  - Remove from production entirely; expose needed operations via existing `/admin/sync/*` API.
- **Verify:** decision documented in `AGENTS.md`. If kept, audit log for every Bull-Board mutation.

#### H6. `requireRefereeSelfOrPermission` widens scope to any matching permission holder

- [ ] **Status:** todo
- **Location:** `apps/api/src/middleware/rbac.ts:96-118`; consumer `apps/api/src/routes/referee/games.routes.ts:12-51`
- **Problem:** Skips refereeId-scoped filter when caller has any matching permission. Today `refereeAdmin` role holds `assignment.view` (`packages/shared/src/rbac.ts:32`) so a `refereeAdmin` user with no `refereeId` link sees every referee's data on `/referee/games`. May be intended, but the design contract is hidden in the middleware.
- **Fix:**
  1. Make the wide-view role allowlist explicit at the route, not implicit in the middleware (e.g. `requireRefereeSelfOrAdminRole(["admin", "refereeAdmin"])`).
  2. Add an integration test per role exercising `/referee/games` and asserting expected scope.
- **Verify:** test matrix per role × endpoint passes; behavior documented at the route.

#### H7. `x-forwarded-host` reflected into ICS UID (cache poisoning)

- [ ] **Status:** todo
- **Location:** `apps/api/src/routes/public/match.routes.ts:93-99`; `apps/api/src/services/public/calendar.service.ts:115`
- **Problem:** Hostname from request header embedded into iCal UID `match-${id}@${hostname}`. CDN cache or shared cache between users can be poisoned by an attacker reaching origin via a different vhost.
- **Fix:** Use `env.BETTER_AUTH_URL` (or a new `PUBLIC_BASE_URL` env var) for the ICS UID hostname. Stop reflecting request headers into cached output.
- **Verify:** ICS responses use the same UID hostname regardless of `x-forwarded-host` value sent.

#### H8. In-memory state never cleaned up (slow leaks)

- [ ] **Status:** todo
- **Location:** `apps/api/src/routes/admin/notification-test.routes.ts:36-42` (`lastSendByUser` only adds), `apps/api/src/middleware/ingest-key.ts:6-49` (counter map prunes only above 1024 entries)
- **Problem:** Both maps grow over time. Slow leaks; eventual memory pressure.
- **Fix:** Move both to Redis with TTL. Bundles with H3.
- **Verify:** memory profile under steady load is flat over 24h.

### Code quality / correctness

#### H9. Notification-test deterministic eventId collides on multi-instance double-click

- [ ] **Status:** todo
- **Location:** `apps/api/src/routes/admin/notification-test.routes.ts:101-168`
- **Problem:** `eventId = admin_test:${callerId}:${sentAt.getTime()}`. Two clicks within the same millisecond on the same admin produce identical IDs → unique-constraint violation → 500. Cooldown (10s) is process-local so multi-instance defeats it.
- **Fix:** Use `ulid()` (already imported via `event-publisher.ts`) for the eventId; embed click timestamp in payload. Or `onConflictDoNothing()` and short-circuit if no row returned.
- **Verify:** rapid double-click test no longer 500s.

#### H10. `setBroadcastLive` race + leaks internal error text

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/broadcast/config.ts:97-118`; `apps/api/src/routes/admin/broadcast.routes.ts:101-110`
- **Problem:** Transaction reads existing config without `FOR UPDATE`. Concurrent admin clicks both observe `existing.matchId !== null`, both update, both publish. Route's catch block exposes `(err as Error).message` directly to the client.
- **Fix:**
  1. `tx.select(...).for("update")` on `broadcastConfigs` row.
  2. Replace catch's raw `err.message` with an allowlist of expected error messages → user-facing strings.
- **Verify:** rapid double-click on broadcast start results in one publish; unexpected errors return generic message.

#### H11. Notification coalesce map unbounded; per-process

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/notifications/notification-pipeline.ts:35-60`
- **Problem:** `recentDispatches` cleanup only runs when `size > 1000`, and only deletes stale entries. 5000 unique entities firing in 60s drives map to 5000. Per-process, so two replicas don't share — coalescing globally defeated by horizontal scale (the whole point of the 60s window).
- **Fix:** Move to Redis: `SET coalesce:<key> 1 NX EX 60`. Set returns null = already-dispatched, skip. Single primitive replaces both the cap and the multi-instance gap.
- **Verify:** with two API instances both processing notifications for the same entity within 60s — only one dispatches.

#### H12. `triggerManualSync` racy check-then-act

- [ ] **Status:** todo
- **Location:** `apps/api/src/workers/queues.ts:201-232`
- **Problem:** `getJobs(["active","waiting"], ...)` followed by `db.insert(syncRuns)` is check-then-act. Two concurrent triggers both observe an empty queue and both insert syncRuns + add jobs.
- **Fix:** Pass deterministic `jobId: "manual-sync"` to `syncQueue.add(...)` so BullMQ rejects duplicates atomically. Or unique partial index on `syncRuns(syncType) WHERE status IN ('pending','running')`.
- **Verify:** two simultaneous triggers result in one syncRuns row + one BullMQ job.

#### H13. Expo client doesn't retry transient 5xx

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/notifications/expo-push.client.ts:76-91, 110-118`
- **Problem:** Any non-2xx throws; `PushChannelAdapter.send` writes every row in the batch as `failed`. Single Expo blip = entire cycle's notifications fail (then trigger DeviceNotRegistered checks unnecessarily).
- **Fix:** Wrap fetch in a small retry helper (mirror `withRetry` in `sdk-client.ts`): retry on 5xx + network errors with exponential backoff (3 attempts).
- **Verify:** simulated 503 from Expo → 3 attempts → success on retry → batch logged as delivered.

#### H14. Sync orchestrator partial-failure semantics opaque

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/sync/index.ts:50-345`; `matches.sync.ts:599-981`
- **Problem:** Six steps with mixed transactional postures (some bulk-upsert, some per-row tx, some no tx at all). On fatal error mid-step, status set to `failed` but partial state already committed. Reading `errorMessage = "Fatal sync error: ..."` gives no signal whether 0% or 95% of work landed.
- **Fix:** Add `partial` status. Capture per-step records on `syncRuns` (which step failed, what was committed). Optionally: add a `step` column.
- **Verify:** simulated mid-sync error → `syncRuns` row shows step that failed and counts of committed entities per step.

---

## Phase 3 — Medium

### M1 — Multi-instance / scaling (cross-cutting; read C5 + Cross-cutting #1 first)

#### M1a. Replace process-local rate-limiters / dedupe maps with Redis

- [ ] **Status:** todo (bundled with H1, H3, H8, H11)
- **Locations:** notification-test cooldown `routes/admin/notification-test.routes.ts:36-37`; SDK session cookie cache `services/sync/sdk-client.ts:93`; broadcast `matchCache` `services/broadcast/publisher.ts:25`
- **Fix:** Single Redis migration sweep covering all these caches. Plus broadcast cache: add 30-60s TTL OR invalidate on match update via `invalidateMatchCache(deviceId)` from match service hooks.
- **Verify:** restart any one instance → coalesce + rate-limit + cache state preserved.

#### M1b. Outbox poller as BullMQ repeatable job, not setInterval

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/events/outbox-poller.ts:88-116`
- **Problem:** `setInterval` + module-level singleton check is intra-process only. Two instances → both poll. No retry, no DLQ, no metrics on lag, no admin trigger.
- **Fix:** Convert to BullMQ repeatable job with `concurrency: 1`, `jobId: "outbox-poll-cron"`. BullMQ deduplicates repeatable jobs by job ID. Add metric `outbox_lag_seconds = max(now - created_at) WHERE enqueued_at IS NULL`. Add alarm `events_undeliverable` for rows pending > 5 min.
- **Verify:** two worker instances → one poller fires; metric exposed.

### M2 — N+1 query loops in hot paths

#### M2a. `referee-games.sync.ts` sequential per-row processing

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/sync/referee-games.sync.ts:232-393`
- **Problem:** Each iteration runs ≥ 3 queries (SELECT existing, findMatchId, INSERT/UPDATE) and possibly 5+ (event publish, reminder scheduling). 200-game backlog ≈ 1000 round-trips. `matches.sync.ts:522-530` already shows the right pattern.
- **Fix:** Batch-load existing rows by `inArray(refereeGames.apiMatchId, allIds)`; precompute `matchIdLookup` once; group inserts/updates and run as bulk `INSERT ... ON CONFLICT DO UPDATE`. Domain event emits stay per-row.
- **Verify:** sync of 200-game backlog runs in seconds, not 60s+.

#### M2b. `match-admin.service.ts` per-row inserts in transaction

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/admin/match-admin.service.ts:134-167`
- **Problem:** `for (const change of fieldChanges) { await tx.insert(matchChanges).values(...) }` — N round-trips inside a transaction → long-held row locks.
- **Fix:** Bulk insert: `tx.insert(matchChanges).values(fieldChanges.map(...))`. Same for overrides via `onConflictDoUpdate`.
- **Verify:** match update with 10 changes → one INSERT statement in PG logs.

#### M2c. `teams.sync.ts` per-team UPDATE for own-club flag

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/sync/teams.sync.ts:185-208`
- **Fix:** CASE expression: `UPDATE teams SET is_own_club = CASE id WHEN x THEN true ... END WHERE id IN (...)`.

#### M2d. `board.service.ts` column reorder per-row

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/admin/board.service.ts:259-266`
- **Fix:** `UPDATE board_columns FROM (VALUES (id1, pos1), (id2, pos2), ...) AS t(id, position) WHERE board_columns.id = t.id`.

#### M2e. `leagues.sync.ts` sequential SDK calls

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/sync/leagues.sync.ts:57-127`
- **Fix:** `Promise.all(trackedLeagues.map(async (league) => { ... }))`. Token bucket already bounds.

#### M2f. `push-receipt.worker.ts` per-failure UPDATE loop

- [ ] **Status:** todo
- **Location:** `apps/api/src/workers/push-receipt.worker.ts:130-143`
- **Fix:** Group failures by errorCode (small cardinality). One UPDATE per distinct errorCode using `inArray(notificationLog.id, idsForCode)`. Drops 1000s of updates to ~5.

### M3 — Validation gaps

#### M3a. Manual `Number(c.req.query(...))` instead of Zod

- [ ] **Status:** todo
- **Locations:** `routes/referee/games.routes.ts:14-24`, `routes/admin/referee-assignment.routes.ts:32-46, 65-101`, `routes/admin/scoreboard.routes.ts:60-68`, `routes/public/scoreboard.routes.ts:22-58`, `routes/public/broadcast.routes.ts:21-23, 39-41`, `routes/admin/notification.routes.ts:79-81`, `routes/admin/league.routes.ts:65`
- **Fix:** Pull `idSchema = z.coerce.number().int().positive()` into a shared `schemas/common.ts`. Adopt the Zod pattern from `match.routes.ts` everywhere.
- **Verify:** invalid numeric inputs return 400 with structured error, not 500.

#### M3b. `routes/admin/user.routes.ts` body parsed via TS-cast not Zod

- [ ] **Status:** todo
- **Location:** `apps/api/src/routes/admin/user.routes.ts:13-27`
- **Fix:** Add a Zod schema mirroring others in `routes/admin/*.schemas.ts`.

#### M3c. `routes/admin/settings.routes.ts:102` JSON.parse without try/catch

- [ ] **Status:** todo
- **Location:** `apps/api/src/routes/admin/settings.routes.ts:102`
- **Fix:** Mirror try/catch pattern used in `services/referee/referee-reminders.service.ts:84`.

#### M3d. `app.use("/admin/*", requireAuth)` does not enforce permission

- [ ] **Status:** todo
- **Location:** `apps/api/src/app.ts:40` and per-route handlers
- **Problem:** Every new admin route must remember to add `requirePermission`. No automated check.
- **Fix:** Integration test that walks every registered route under `/admin/*` and asserts at least two middleware layers (auth + permission). Or extract the route-mounting into a helper that requires a permission tuple.
- **Verify:** new admin route without permission middleware fails the integration test.

### M4 — Information disclosure / abuse

#### M4a. CSV formula injection in referee-history export

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/admin/referee-history.csv.ts:6-23`
- **Problem:** Team names / referee names from federation API can include `=`, `+`, `-`, `@`. Excel auto-runs formulas → potential local-data exfiltration on admin's machine.
- **Fix:** In `escape()`, prefix any field whose first char is `=`, `+`, `-`, `@`, `\t`, `\r` with `'` (apostrophe).
- **Verify:** export with synthetic name `=2+5+cmd|...` — output has `'` prefix.

#### M4b. `/public/matches/:id` returns any match including override comments

- [ ] **Status:** todo
- **Location:** `apps/api/src/routes/public/match.routes.ts:113-126`; `services/admin/match-query.service.ts`
- **Problem:** Public list filters to own-club; detail does not. Admin override comments authored via PATCH are exposed.
- **Fix:** Either restrict `getPublicMatchDetail` to own-club matches, OR strip override-only fields (`publicComment`, `internalComment`) before returning to public route.

#### M4c. Player photo upload preserves attacker filename extension

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/social/player-photo.service.ts:22-35`; `routes/admin/social.routes.ts:43-57`
- **Problem:** Today not exploitable (content-type derived from filename, defaults to `image/png` for unknown extensions). Brittle: any refactor that "uses actual extension" introduces stored-XSS via SVG.
- **Fix:** Derive extension from validated content-type (`png`/`jpeg`/`webp`), not user-supplied filename. Same fix already exists for backgrounds.

#### M4d. Push token in URL path of `DELETE /api/devices/:token` is logged

- [ ] **Status:** todo
- **Location:** `apps/api/src/routes/device.routes.ts:55-80`; `middleware/request-logger.ts:57`
- **Problem:** Path is logged in every request line. Cloud Logging retains. Exfiltrated push tokens usable for arbitrary push-spam to that device.
- **Fix:** Either move token from path to body (`DELETE /api/devices` with `{token}`), OR redact paths matching `/api/devices/.+` to `/api/devices/<redacted>` in request logger.

#### M4e. `PUT /admin/users/:id/referee-link` lets `user.update` holder link any referee

- [ ] **Status:** todo
- **Location:** `apps/api/src/routes/admin/user.routes.ts:10-42`
- **Problem:** Today admin-only by configured permission. Latent privilege escalation if a future role gets `user.update`.
- **Fix:** Restrict explicitly to `admin` role (`requireAnyRole("admin")`) instead of `requirePermission("user", "update")`. Or split into a new permission `user.linkReferee`.

#### M4f. Public scoreboard/broadcast accept any string `deviceId`

- [ ] **Status:** todo
- **Location:** `routes/public/scoreboard.routes.ts:21-42, 51-60`; `routes/public/broadcast.routes.ts:20-29, 38-90`
- **Problem:** No validation against known devices. Bundled with C2.
- **Fix:** Validate `deviceId` against `liveScoreboards` table or known-devices allowlist. Reject unknown with 404.

#### M4g. `INTERNAL_ERROR` echoes `Error.message` in non-prod

- [ ] **Status:** todo
- **Location:** `apps/api/src/middleware/error.ts:38-56`
- **Problem:** Tied to `NODE_ENV !== "production"`. Staging environments often left as `development` for verbose errors → leak DB constraint names, library internals.
- **Fix:** Tie verbose-message branch to a separate explicit env flag (`VERBOSE_ERRORS=true`) so production-mode staging behaves like prod.

### M5 — Architecture / coupling

#### M5a. Services importing route schemas (layering leak)

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/admin/sync-admin.service.ts:5`; `referee-history.service.ts:11-14`
- **Fix:** Move schema-derived types to `@dragons/shared`. Routes import their schemas separately and call services with plain types.

#### M5b. Service file gigantism

- [ ] **Status:** todo
- **Locations:** `services/sync/matches.sync.ts` (981 lines), `services/admin/task.service.ts` (898), `services/venue-booking/venue-booking.service.ts` (652), `services/sync/sdk-client.ts` (612), `services/admin/match-query.service.ts` (581)
- **Fix:**
  - `matches.sync.ts` → extract pure functions (`period-scores.ts`, `match-snapshot.ts`, `match-change-classifier.ts`); keep orchestrator thin.
  - `task.service.ts` → split by table-affinity (`task-crud.ts`, `task-assignees.ts`, `task-checklist.ts`, `task-comments.ts`); shared `task-event-emitter.ts`.

#### M5c. Domain event payload schema implicit and untyped

- [ ] **Status:** todo
- **Location:** 35+ `publishDomainEvent({ payload: {...} })` call sites; classifier `services/events/event-types.ts:39-65` scrapes payloads with regex
- **Fix:** Define per-event-type `EventPayload` discriminated union in `@dragons/shared`. Replace `payload: Record<string, unknown>` with `EventPayload<T>`. Urgency classifier accesses `payload.kickoffDate` directly.

#### M5d. Health endpoint thin

- [ ] **Status:** todo
- **Location:** `apps/api/src/routes/health.routes.ts:9-45`
- **Fix:** Add `/health/deep` covering: outbox lag (`max(now - created_at) WHERE enqueued_at IS NULL`), queue depth, last-sync age, WAHA reachability, push-receipt backlog. Keep `/health` as fast liveness probe. Wire `/health/deep` into Cloud Monitoring uptime check (don't restart on degraded; alert).

#### M5e. Implicit data-access layer

- [ ] **Status:** todo
- **Location:** `services/admin/match-query.service.ts` has helpers; rest of code does inline Drizzle. Inconsistent.
- **Decision:** Either commit to repos (`repositories/` dir, all SELECTs centralized), or commit to inline (delete `match-query` helpers). Document.

### M6 — Dedup / consistency

#### M6a. `escapeLikePattern` private; ILIKE input unescaped elsewhere

- [ ] **Status:** todo
- **Locations:** definition `services/admin/event-admin.service.ts:16-18`; unescaped uses in `sync-admin.service.ts:127-138`, `referee-history.service.ts:255-260`, `routes/admin/broadcast.routes.ts:178-182`. Also `routes/admin/notification-test.routes.ts:198` uses LIKE with caller-controlled session id (low risk for UUIDs but fragile).
- **Fix:** Move `escapeLikePattern` to `services/utils/sql.ts`. Use everywhere ILIKE/LIKE meets a user-provided pattern.

#### M6b. Push template helpers duplicated 6 times with subtle divergence

- [ ] **Status:** todo
- **Locations:** `services/notifications/templates/push/{referee-assigned, referee-unassigned, referee-reassigned, match-cancelled, match-rescheduled, referee-slots}.ts`
- **Problem:** `truncate` duplicated 6×. `formatDe` 3×. `formatDate` 2× with different output for `en` (`DD.MM.` vs `DD.MM.YYYY`) — UI inconsistency.
- **Fix:** Move helpers to `templates/push/_utils.ts`. Pick one canonical format per locale.

#### M6c. SSE plumbing duplicated

- [ ] **Status:** todo
- **Locations:** `services/scoreboard/sse.ts:26-105`; `routes/public/broadcast.routes.ts:32-91`
- **Fix:** Extract `createSseStream({ initialState, subscribe, heartbeatMs })`. Both routes shrink to ~10 lines.

#### M6d. `pickDefined` pattern duplicated

- [ ] **Status:** todo
- **Locations:** `services/admin/booking-admin.service.ts:204-213, 303-311`; `services/broadcast/config.ts:65-72`; others
- **Fix:** `pickDefined<T>(input: Partial<T>, allowedKeys: (keyof T)[]): Partial<T>` helper.

#### M6e. `secondsSinceLastFrame` math repeated; admin route omits clamp

- [ ] **Status:** todo
- **Locations:** `routes/public/scoreboard.routes.ts:35-38`; `services/broadcast/publisher.ts:74-77`; `routes/admin/scoreboard.routes.ts:78-80`
- **Fix:** `computeSecondsSince(date: Date): number` in scoreboard utils. Always clamp `Math.max(0, ...)`.

#### M6f. `templates/index.ts` and `templates/digest.ts` renderer chain duplicated; digest excludes task

- [ ] **Status:** todo
- **Location:** `templates/index.ts:26-30`; `templates/digest.ts:20-37`
- **Problem:** Asymmetric inclusion — task events in real-time, missing from digest. Silent feature drift.
- **Fix:** Extract `tryRenderEvent(eventType, payload, entityName, locale): RenderedMessage | null`.

### M7 — Other

#### M7a. Pino redaction one-level only

- [ ] **Status:** bundled with H2

#### M7b. `whatsapp.provider.ts` is dead stub

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/notifications/whatsapp.provider.ts:1-13`
- **Problem:** Returns `{ success: false }`. Only its test references it. Real WhatsApp via `whatsapp-group.ts` (WAHA).
- **Fix:** Delete file + test.

#### M7c. Unused imports

- [ ] **Status:** todo
- **Location:** `services/admin/event-admin.service.ts:2,10,11,12`; `services/admin/notification-admin.service.ts:146` constructs unused `inAppAdapter`
- **Fix:** Delete unused imports + dead constructor calls.

#### M7d. Retention windows hard-coded

- [ ] **Status:** todo
- **Location:** `apps/api/src/workers/index.ts:54-62, 111-130, 133-182`
- **Fix:** `SYNC_RUN_RETENTION_DAYS` and `DOMAIN_EVENT_RETENTION_DAYS` env vars in `config/env.ts`.

#### M7e. Outbox poller no max-lag metric

- [ ] **Status:** bundled with M1b

#### M7f. `sync-logger.ts` Redis publish failure permanently disables stream

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/sync/sync-logger.ts:60-71`
- **Problem:** First failure sets `redisPublishFailed = true` and never resets. Transient Redis blip kills SSE for the rest of the run.
- **Fix:** Reset `redisPublishFailed` after a cooldown (e.g. 30s) so streaming recovers.

#### M7g. `notification-pipeline.ts` unsafe `as` casts on config

- [ ] **Status:** todo
- **Locations:** `services/notifications/notification-pipeline.ts:287, 306, 320`; `workers/digest.worker.ts:72`
- **Problem:** `(channelCfg.config as unknown as WhatsAppGroupConfig).groupId`, `.locale as string`. Corrupt config row crashes pipeline.
- **Fix:** Validate config bytes against `whatsappGroupConfigSchema` etc. before use. Drop unsafe casts.

#### M7h. `pubsub.ts` swallows JSON.parse silently

- [ ] **Status:** todo
- **Location:** `services/scoreboard/pubsub.ts:31-35, 66-70`
- **Fix:** Log at debug/warn level instead of silent drop.

#### M7i. Magic thresholds split across files

- [ ] **Status:** todo
- **Locations:** `STALE_MS = 30_000` in `services/broadcast/publisher.ts:14`; `< 10s` for "online" in `routes/admin/scoreboard.routes.ts:85`
- **Fix:** Single `services/scoreboard/constants.ts` or env vars.

#### M7j. `match-admin.service.ts` runs entire match update + event publish in one transaction

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/admin/match-admin.service.ts:50-256`
- **Problem:** Could deadlock against outbox poller's `FOR UPDATE SKIP LOCKED` on `domain_events`.
- **Fix:** After resolving C3 (poller lock window), revisit. May not need change if poller no longer holds long locks.

#### M7k. Push template type reuse loses semantic info

- [ ] **Status:** todo
- **Locations:** `templates/push/referee-unassigned.ts:3` and `referee-reassigned.ts:3` borrow `RefereeAssignedPayload`
- **Problem:** Reassigned should display "from X to Y" — publishing site already includes those fields, template doesn't.
- **Fix:** Define `RefereeUnassignedPayload` + `RefereeReassignedPayload` separately. Update templates to display old/new.

#### M7l. `releaseOverride` event uses team API IDs as strings, not names

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/admin/match-admin.service.ts:392-412`
- **Problem:** `homeTeam: String(locked.homeTeamApiId)` shows `"408 vs 511"` in notifications instead of team names.
- **Fix:** Resolve team names via existing lookup join.

#### M7m. `releaseOverride` does not invalidate broadcast cache

- [ ] **Status:** bundled with M1a

#### M7n. `match.routes.ts` dynamic import + fire-and-forget reconcile

- [ ] **Status:** todo
- **Location:** `apps/api/src/routes/admin/match.routes.ts:117-124`
- **Fix:** Static import at top. If latency matters, enqueue a BullMQ job (already plumbed for venue-booking) instead of `.then().catch()` race.

#### M7o. `setBroadcastLive` returns synthetic empty config when stopping never-started broadcast

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/broadcast/config.ts:119-137`
- **Fix:** Return `null` for "no config existed"; route translates to 404 or `{ config: null }`.

#### M7p. `event-publisher.ts` `void enqueueDomainEvent(event)` — fire-and-forget

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/events/event-publisher.ts:131-138`
- **Fix:** `.catch(() => {})` or `await`. Future strict-mode unhandled-rejection terminates process.

#### M7q. `matches.sync.ts:519` filter excludes valid 0

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/sync/matches.sync.ts:519`; `services/sync/data-fetcher.ts:63`
- **Fix:** `filter((id): id is number => typeof id === "number" && id > 0)`.

#### M7r. SDK login no concurrency guard

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/sync/sdk-client.ts:109-145, 237-255`
- **Fix:** Per-instance promise: `if (this.loginInFlight) return this.loginInFlight; this.loginInFlight = withRetry(...);`.

#### M7s. SDK `withRetry` swallows attempt context

- [ ] **Status:** todo
- **Location:** `apps/api/src/services/sync/sdk-client.ts:69-90`
- **Fix:** Wrap final error with `new Error(\`${label} failed after ${maxAttempts} attempts: ${err.message}\`, { cause: err })`.

---

## Phase 4 — Low / Nit

- [ ] L1. Cookie name lacks `__Secure-` prefix — `config/auth.ts:47-56`
- [ ] L2. `BETTER_AUTH_URL` defaults to localhost — add Zod refinement to reject in prod — `config/env.ts:11`
- [ ] L3. `BETTER_AUTH_SECRET` min 32 — bump example to 48 — `config/env.ts:10`
- [ ] L4. `dragons://*` and `dragons://` both in trustedOrigins — redundant — `config/auth.ts:14-18`
- [ ] L5. `app.ts:33` openAPI spec may rebuild per request — verify caching
- [ ] L6. `index.ts:42` double-cast `httpServer = healthServer as unknown as typeof httpServer`
- [ ] L7. Proxy-based lazy singletons for db/redis break Symbol.iterator — `config/database.ts:8-17`, `config/redis.ts:11-28`
- [ ] L8. `health.routes.ts:14` dead `security: []` override
- [ ] L9. `sync-admin.service.ts:55` `filter(Boolean) as ...` — use predicate
- [ ] L10. `sync.routes.ts:104` job page size hardcoded 100 — add limit query param
- [ ] L11. `expo-push.client.ts:89,106` Expo response shape unvalidated — add Zod schema
- [ ] L12. `notification-test.routes.ts:215-218` `maskToken` reveals short tokens fully
- [ ] L13. `stramatel-decoder.ts:57-59` `payload[i] as number` cast — use for-of
- [ ] L14. `sync.worker.ts:21-23` inconsistent `as const` on ternary branches
- [ ] L15. Admin-test emoji `🏀` violates project anti-emoji rule — `notification-test.routes.ts:106, 138`
- [ ] L16. `notification.routes.ts:132-170` "preferences" mounted under `/admin/*` but caller-self — semantic mismatch (consider `/api/me/...`)
- [ ] L17. `event-publisher.ts` exports `buildDomainEvent`/`insertDomainEvent`/`enqueueDomainEvent` separately — document why
- [ ] L18. `services/admin/booking-admin.service.ts:204, 303` `set: Record<string, unknown>` — bundled with M6d
- [ ] L19. `routes/admin/notification-test.routes.ts:124` batch error reused per device — reuse `PushChannelAdapter` from production path
- [ ] L20. `services/scoreboard/ingest.ts:88-91` double-cast in `snapshotsDiffer` — type via `Pick<typeof liveScoreboards.$inferSelect, ...>`
- [ ] L21. `requireRefereeSelfOrPermission` `as number` cast — make `isReferee` narrow `user is User & { refereeId: number }` in `@dragons/shared`
- [ ] L22. `notification-pipeline.ts:155, 156, 203, 204, 286` `event.payload as Record<string, unknown>` — `getEventPayload(event)` helper
- [ ] L23. Cookie `domain: ".app.hbdragons.de"` — verify all subdomains are owned (subdomain-takeover risk)
- [ ] L24. `templates/push/types.ts` TITLE_MAX/BODY_MAX — verify against APNs/Android limits, document source

---

## Cross-cutting themes (read before starting)

### CC1. Multi-instance readiness — RESOLVED via infra audit

Reading `infra/environments/production/main.tf`:

- **API service** (RUN_MODE=api): `min_instances=1, max_instances=10` → multi-instance.
- **Worker service** (RUN_MODE=worker): `min_instances=1, max_instances=1` → single-instance by infra contract.

This is a **hybrid** deployment: the API path scales horizontally, the worker path does not. Many findings re-prioritize:

- Worker-only state (outbox poller singleton, scheduler init, stale-sync reclaim, notification coalesce, SDK session cookie cache, sync.worker concurrency) is already correct because the worker is pinned to 1.
- API-only state (login rate-limit, ingest rate-limit, notification-test cooldown, anything in routes/middleware) MUST move to Redis because up to 10 instances.

**Action plan:** keep worker as single-instance (document in `AGENTS.md`). Move API-side rate-limiters and dedupe maps to Redis. Items affected: C1, H1, H3, H8, H10 race window during deploy overlap, M4f. C5 stays as a deploy-overlap risk only (very narrow window) — fix or accept.

### CC2. Outbox primitive correct; call sites broken (C4)

`publishDomainEvent(params, tx?)` is correct. 35 call sites; only 4 pass `tx`. Action: audit all 35; either make `tx` required (renaming the no-tx path to `publishDomainEventOutsideTx`) or write an ESLint rule.

### CC3. Transaction boundaries inconsistent

Three patterns coexist: full-tx-with-event (gold standard, `match-admin.service.ts`), tx-without-event-tx (broken outbox, `matches.sync.ts`), no-tx-at-all (sync workers). Pick one default per operation type. Document.

### CC4. Per-connection Redis client in 3 SSE places (C2 expanded)

`scoreboard/pubsub.ts`, `routes/public/broadcast.routes.ts`, `routes/admin/sync.routes.ts:322`. Replace with one shared subscriber per process fanning out via in-memory EventEmitter.

### CC5. N+1 query loops (M2)

At least 6 hot paths. Bulk-load via `inArray`, bulk-insert with `values([...])`, or `UPDATE ... FROM (VALUES ...)` for batch updates.

### CC6. Trace context lost at boundaries

Excellent in-process: AsyncLocalStorage threads requestId/traceId through `logger.child()`. But: outbound SDK calls don't send `traceparent`; BullMQ jobs don't carry trace context. Sync triggered by `POST /admin/sync/trigger` becomes anonymous to the trace tree. **Action:** thread `traceId` into BullMQ job data; restore context in worker handler before processing. Add `traceparent` to outbound SDK fetch.

### CC7. Unsafe `as unknown as` / `as Record<string, unknown>` casts hide schema drift

Concentrated in: `notification-pipeline.ts` config readers, Expo response handler, broadcast cache, decoder bounds, event payload access. Replace with Zod parse at the boundary.

### CC8. Implicit single-tenant assumption

"Own club" identity (`teams.isOwnClub`, `getClubConfig()`) plumbed through routes/services/sync. Adding a second club requires either full multi-tenant refactor or fork-per-tenant. Codebase reads as fork-per-tenant but doesn't say so explicitly. **Decision:** document the constraint in `AGENTS.md`.

---

## Strengths to preserve (don't accidentally break)

- Outbox primitive design (`event-publisher.ts:124-140`)
- Sync hash-skip via `dataHash` columns + `setWhere: sql\`excluded.data_hash != ...\``
- Constant-time ingest-key compare (`middleware/ingest-key.ts:12-17`)
- GDPR-aware logging: IP anonymization + URL query-string redaction (`config/log-privacy.ts`, `middleware/request-logger.ts:60, 85`)
- Per-request logger child + AsyncLocalStorage trace context (`middleware/request-logger.ts:45-112`)
- RBAC type-safety via `Resource`/`Action<R>` types from `@dragons/shared`
- Better-auth session cookie cache (5min)
- SDK token bucket + jittered exponential backoff (`sdk-client.ts:28-90`)
- Worker concurrency settings sized per-workload
- Test infrastructure with PGLite (under-utilized but available)
- Stramatel decoder bounds checks
- Admin-only signup hardening (`disableSignUp: true` + `databaseHooks.user.create` strips auto-injected role)
- Coverage threshold 90/95 enforced in CI
- Session fixation handled (better-auth regenerates session on sign-in)
- No SQL injection (Drizzle template binding)
- No path traversal (regex-constrained route params)
- CORS strict allowlist + credentials

---

## False positives explicitly ruled out (so future reviewers don't re-check)

- SQL injection — Drizzle template params bound; raw `sql\`...\`` only contains column names
- Path traversal in `assets/clubs/:id.webp` — regex-constrained integers
- iCal CRLF/header injection — `ical-generator` library handles RFC-5545 escaping
- Constant-time ingest-key compare — adequate
- Stramatel decoder buffer bounds — 48-byte minimum guard correct
- CORS misconfig — strict allowlist + credentials, Hono cors echoes only matching origins
- Hono `parseBody` prototype pollution — `dot: true` not used
- Federation submit endpoint open to any logged-in referee — re-checks ownership
- `/admin/users/:id/role` privilege escalation — no such endpoint exists; better-auth admin plugin handles role mutations under `/api/auth/admin/*` with `adminRoles: ["admin"]`
- OpenAPI/Bull-Board middleware ordering — correct
- Session fixation/regeneration — better-auth regenerates on sign-in (verified)
- pnpm audit findings — all transitive through dev deps; no prod-runtime impact today

---

## Methodology notes

This review was produced by:

1. **Inventory pass** — Explore agent mapped every route, service, worker, middleware, config file, dependency, and test in `apps/api`.
2. **Automated sweep** — `pnpm --filter @dragons/api lint`, `typecheck`, `coverage`, `pnpm audit --prod`, `pnpm dlx knip --workspace apps/api`. All clean except 19 transitive audit vulns.
3. **Three parallel deep agents:**
   - Code quality (`superpowers:code-reviewer`)
   - Architecture (general-purpose, design-focused)
   - Security (general-purpose, threat-model-driven, route-by-route walk)
4. **Consolidation** — findings deduplicated, severity-ranked, and ordered for sequential fix.

Re-running the review: clean main, run the same automated sweep, dispatch the same three agents with their original briefs, then update this doc with new findings + cross out resolved ones.

# Sync Performance & Resource Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 8 performance and resource issues in the API sync pipeline: N+1 queries in match sync, referee assignments, and intent confirmation; unbounded parallel league fetching; full-table-scan lookups; SyncLogger Redis leak; stale SDK session detection; hardcoded `changedBy`.

**Architecture:** Targeted patches in individual files — no new abstractions. Each fix is independent and testable in isolation. The sync orchestrator and external interfaces remain unchanged.

**Tech Stack:** Drizzle ORM (inArray), pLimit, ioredis, Vitest

---

### Task 1: Batch-load existing matches to eliminate N+1 SELECT

**Files:**
- Modify: `apps/api/src/services/sync/matches.sync.ts:442-508`
- Test: `apps/api/src/services/sync/matches.sync.test.ts`

**Context:** Currently, `syncMatchesFromData` does a per-match `db.select().from(matches).where(eq(matches.apiMatchId, apiMatchId))` inside the loop (line 504-508). With hundreds of matches, this is hundreds of round-trips. Fix: batch-load all existing matches before the loop into a Map.

**Step 1: Update the implementation**

In `matches.sync.ts`, add `inArray` to the drizzle-orm import:

```typescript
import { eq, and, inArray } from "drizzle-orm";
```

At the top of `syncMatchesFromData`, before the `for (const data of leagueData)` loop, collect all apiMatchIds and batch-load:

```typescript
// Batch-load all existing matches to avoid N+1 SELECTs
const allApiMatchIds = leagueData
  .flatMap((d) => d.spielplan.map((m) => m.matchId))
  .filter((id): id is number => !!id);

const existingMatchesByApiId = new Map<number, typeof matches.$inferSelect>();
if (allApiMatchIds.length > 0) {
  const existingMatches = await db
    .select()
    .from(matches)
    .where(inArray(matches.apiMatchId, allApiMatchIds));
  for (const m of existingMatches) {
    existingMatchesByApiId.set(m.apiMatchId, m);
  }
}
```

Then replace the per-match SELECT (lines 504-508):
```typescript
// OLD:
const [existing] = await db
  .select()
  .from(matches)
  .where(eq(matches.apiMatchId, apiMatchId))
  .limit(1);

// NEW:
const existing = existingMatchesByApiId.get(apiMatchId) ?? null;
```

Keep the `FOR UPDATE` lock inside the transaction — that's still needed for write safety.

**Step 2: Update the test**

In `matches.sync.test.ts`, the mock setup currently has `mockSelect` returning per-match results. The batch-load adds one upfront SELECT call. Update the mock chain so the first `mockSelect` call returns the batch result (array of existing matches), and remove individual per-match select mocking.

The key test change: `mockSelect` must now handle two call patterns:
1. The batch-load call at the start (returns array of existing matches)
2. Any remaining select calls inside transactions (already handled by `mockTransaction`)

Add a test: "batch-loads existing matches before processing loop":
```typescript
it("batch-loads existing matches before the loop", async () => {
  // Setup: two matches, one existing
  const leagueData = [makeLeagueData({ spielplan: [makeBasicMatch({ matchId: 1 }), makeBasicMatch({ matchId: 2 })] })];

  // First select call = batch load, returns match 1 as existing
  mockSelect.mockReturnValueOnce(
    buildSelectChain([{ ...existingMatchRow, apiMatchId: 1 }])
  );

  // ... rest of mock setup for creates/updates

  await syncMatchesFromData(leagueData, new Map(), null);

  // Verify batch load used inArray, not individual selects
  expect(mockSelect).toHaveBeenCalledTimes(1); // Just the batch load
});
```

**Step 3: Run tests**

```bash
pnpm --filter @dragons/api test -- matches.sync.test
```

**Step 4: Commit**

```bash
git add apps/api/src/services/sync/matches.sync.ts apps/api/src/services/sync/matches.sync.test.ts
git commit -m "perf: batch-load existing matches to eliminate N+1 SELECTs in match sync"
```

---

### Task 2: Batch-load existing referee assignments to eliminate N+1 SELECT

**Files:**
- Modify: `apps/api/src/services/sync/referees.sync.ts:203-283`
- Test: `apps/api/src/services/sync/referees.sync.test.ts`

**Context:** `syncRefereeAssignmentsFromData` does a per-assignment `db.select().from(matchReferees).where(...)` inside the loop (line 241-250). Fix: batch-load all existing assignments before the loop.

**Step 1: Update the implementation**

Add `inArray` to the drizzle-orm import:

```typescript
import { eq, and, sql, inArray } from "drizzle-orm";
```

After the `validAssignments` filter (line 229), batch-load existing assignments:

```typescript
// Batch-load existing assignments to avoid N+1 SELECTs
const matchIdsToCheck = [...new Set(validAssignments.map((a) => matchIdLookup.get(a.matchApiId)!))];
const existingAssignments = matchIdsToCheck.length > 0
  ? await db
      .select()
      .from(matchReferees)
      .where(inArray(matchReferees.matchId, matchIdsToCheck))
  : [];
const existingBySlot = new Map(
  existingAssignments.map((r) => [`${r.matchId}-${r.slotNumber}`, r]),
);
```

Then replace the per-assignment SELECT inside the loop:

```typescript
// OLD:
const [existing] = await db
  .select()
  .from(matchReferees)
  .where(
    and(
      eq(matchReferees.matchId, matchId),
      eq(matchReferees.slotNumber, slotNumber),
    ),
  )
  .limit(1);

// NEW:
const existing = existingBySlot.get(`${matchId}-${slotNumber}`) ?? null;
```

**Step 2: Update tests**

In `referees.sync.test.ts`, update `syncRefereeAssignmentsFromData` tests:
- The batch-load SELECT is now the first call. Mock it to return existing assignments.
- Remove per-assignment SELECT mocking from individual test cases.
- Add a test verifying the batch-load happens once before the loop.

**Step 3: Run tests**

```bash
pnpm --filter @dragons/api test -- referees.sync.test
```

**Step 4: Commit**

```bash
git add apps/api/src/services/sync/referees.sync.ts apps/api/src/services/sync/referees.sync.test.ts
git commit -m "perf: batch-load existing referee assignments to eliminate N+1 SELECTs"
```

---

### Task 3: Replace N+1 intent confirmation with single UPDATE...FROM

**Files:**
- Modify: `apps/api/src/services/sync/referees.sync.ts:289-322`
- Test: `apps/api/src/services/sync/referees.sync.test.ts`

**Context:** `confirmIntentsFromSync` loops through pending intents and does individual SELECTs to check for matching assignments. Replace with a single SQL statement.

**Step 1: Update the implementation**

Replace the entire `confirmIntentsFromSync` function body:

```typescript
export async function confirmIntentsFromSync(): Promise<number> {
  const now = new Date();

  // Single query: update all pending intents that have a matching assignment
  const result = await db.execute(sql`
    UPDATE ${refereeAssignmentIntents}
    SET confirmed_by_sync_at = ${now}
    WHERE ${refereeAssignmentIntents.confirmedBySyncAt} IS NULL
      AND EXISTS (
        SELECT 1 FROM ${matchReferees} mr
        WHERE mr.match_id = ${refereeAssignmentIntents}.match_id
          AND mr.referee_id = ${refereeAssignmentIntents}.referee_id
      )
  `);

  return Number(result.rowCount ?? 0);
}
```

This replaces N+1 queries (1 SELECT for pending + N SELECTs for matching) with a single UPDATE.

**Step 2: Update tests**

Replace the existing `confirmIntentsFromSync` tests. The function no longer uses `db.select()` or `db.update()` — it uses `db.execute()` with raw SQL. Update mock setup:

```typescript
const mockExecute = vi.fn();
// Add to db mock:
db: {
  insert: ...,
  select: ...,
  update: ...,
  execute: (...args: unknown[]) => mockExecute(...args),
}
```

Tests:
- "confirms intents with matching assignments": mock `execute` returning `{ rowCount: 3 }`, verify returns 3
- "returns 0 when no intents match": mock `execute` returning `{ rowCount: 0 }`, verify returns 0
- "handles null rowCount": mock `execute` returning `{}`, verify returns 0

**Step 3: Run tests**

```bash
pnpm --filter @dragons/api test -- referees.sync.test
```

**Step 4: Commit**

```bash
git add apps/api/src/services/sync/referees.sync.ts apps/api/src/services/sync/referees.sync.test.ts
git commit -m "perf: replace N+1 intent confirmation with single UPDATE...FROM"
```

---

### Task 4: Add concurrency limit to parallel league fetching

**Files:**
- Modify: `apps/api/src/services/sync/data-fetcher.ts:100-101`
- Test: `apps/api/src/services/sync/data-fetcher.test.ts`

**Context:** `fetchAllSyncData` fires `Promise.all(trackedLeagues.map(...))` with no concurrency limit. Each league internally fires batch game details. Fix: use `pLimit(3)`.

**Step 1: Update the implementation**

Add pLimit import at top of `data-fetcher.ts`:

```typescript
import pLimit from "p-limit";
```

Replace the `Promise.all` on line 100-101:

```typescript
// OLD:
const leagueData = await Promise.all(
  trackedLeagues.map((l) => fetchLeagueData(l.apiLigaId, l.id, l.name)),
);

// NEW:
const limit = pLimit(3);
const leagueData = await Promise.all(
  trackedLeagues.map((l) => limit(() => fetchLeagueData(l.apiLigaId, l.id, l.name))),
);
```

**Step 2: Update tests**

In `data-fetcher.test.ts`, pLimit is not currently mocked. Add a mock for pLimit:

```typescript
const mockPLimit = vi.fn();
vi.mock("p-limit", () => ({
  default: (concurrency: number) => {
    mockPLimit(concurrency);
    return (fn: () => Promise<unknown>) => fn();
  },
}));
```

Add a test:

```typescript
it("limits league fetch concurrency to 3", async () => {
  mockSelect.mockReturnValue(buildSelectChain([
    { id: 1, apiLigaId: 100, name: "League A" },
    { id: 2, apiLigaId: 200, name: "League B" },
  ]));
  mockGetSpielplan.mockResolvedValue([]);
  mockGetTabelle.mockResolvedValue([]);
  mockGetGameDetailsBatch.mockResolvedValue(new Map());

  await fetchAllSyncData();

  expect(mockPLimit).toHaveBeenCalledWith(3);
});
```

**Step 3: Run tests**

```bash
pnpm --filter @dragons/api test -- data-fetcher.test
```

**Step 4: Commit**

```bash
git add apps/api/src/services/sync/data-fetcher.ts apps/api/src/services/sync/data-fetcher.test.ts
git commit -m "perf: limit parallel league fetching to 3 concurrent leagues"
```

---

### Task 5: Build lookup maps from upsert results instead of full table scans

**Files:**
- Modify: `apps/api/src/services/sync/referees.sync.ts:33-104` (roles) and `106-194` (referees)
- Modify: `apps/api/src/services/sync/venues.sync.ts:119-124` (`buildVenueIdLookup`)
- Modify: `apps/api/src/services/sync/referees.sync.ts:196-201` (`buildMatchIdLookup`)
- Test: `apps/api/src/services/sync/referees.sync.test.ts`
- Test: `apps/api/src/services/sync/venues.sync.test.ts`

**Context:** After upsert, `syncRefereesFromData` and `syncRefereeRolesFromData` do `SELECT * FROM referees/refereeRoles` to build lookups, scanning the entire table. Fix: pre-load existing rows before upsert, merge with upsert results.

**Step 1: Update referees sync**

For `syncRefereeRolesFromData`:
- Before the upsert, load existing roles: `const existingRoles = await db.select({id, apiId}).from(refereeRoles)`
- Build initial lookup from existing rows
- After upsert, merge upsert results into the lookup (upsert returns id+apiId for created/updated rows)
- Remove the post-upsert full table scan

```typescript
// Pre-load existing for lookup
const existingRoles = await db
  .select({ id: refereeRoles.id, apiId: refereeRoles.apiId })
  .from(refereeRoles);
const roleIdLookup = new Map(existingRoles.map((r) => [r.apiId, r.id]));

// ... upsert ...

// Merge upsert results (new IDs for created rows, updated IDs for changed rows)
for (const row of upsertResult) {
  roleIdLookup.set(row.apiId, row.id);
}

// DELETE the old post-upsert full scan
```

Apply the same pattern to `syncRefereesFromData`.

**Note:** `buildVenueIdLookup` and `buildMatchIdLookup` are called externally by the orchestrator after all syncs complete. These scan all rows because they need the complete mapping (not just synced rows). Leave these as-is — they're called once and correctness requires completeness.

**Step 2: Update tests**

Update tests for `syncRefereeRolesFromData` and `syncRefereesFromData`:
- The pre-load SELECT now happens *before* the upsert, not after
- Adjust mock call order expectations
- Verify no post-upsert full table scan

**Step 3: Run tests**

```bash
pnpm --filter @dragons/api test -- referees.sync.test
```

**Step 4: Commit**

```bash
git add apps/api/src/services/sync/referees.sync.ts apps/api/src/services/sync/referees.sync.test.ts
git commit -m "perf: build referee/role lookups from pre-loaded + upsert results, not full table scan"
```

---

### Task 6: Reuse shared Redis connection in SyncLogger

**Files:**
- Modify: `apps/api/src/services/sync/sync-logger.ts`
- Test: `apps/api/src/services/sync/sync-logger.test.ts`

**Context:** `SyncLogger` constructor creates `new Redis(env.REDIS_URL)` per instance (line 38). Each sync run leaks a connection. Fix: accept a Redis instance or use the shared one from `config/redis.ts`.

**Step 1: Update the implementation**

Change `SyncLogger` to accept an optional Redis instance, defaulting to the shared one:

```typescript
import { redis as sharedRedis } from "../../config/redis";

// Remove: import Redis from "ioredis";
// Remove: import { env } from "../../config/env";
import type Redis from "ioredis";

export class SyncLogger {
  private syncRunId: number;
  private entries: NewSyncRunEntry[] = [];
  private batchSize = 50;
  private eventEmitter: EventEmitter;
  private redis: Redis | null = null;
  private channelName: string;
  private redisPublishFailed = false;

  constructor(syncRunId: number, redisInstance?: Redis | null) {
    this.syncRunId = syncRunId;
    this.eventEmitter = new EventEmitter();
    this.channelName = `sync:${syncRunId}:logs`;

    try {
      this.redis = redisInstance !== undefined ? redisInstance : sharedRedis;
    } catch {
      log.warn("Redis not available, streaming disabled");
    }
  }
  // ...

  async close(): Promise<void> {
    await this.flush();

    if (this.redis) {
      try {
        await this.redis.publish(this.channelName, JSON.stringify({ type: "complete" }));
        // Do NOT call redis.quit() — we don't own this connection
      } catch {
        // Ignore
      }
    }

    this.eventEmitter.emit("complete");
  }
```

Remove `redis.quit()` from `close()` — the shared connection must not be closed by individual sync runs.

Update `createSyncLogger`:
```typescript
export function createSyncLogger(syncRunId: number, redisInstance?: Redis | null): SyncLogger {
  return new SyncLogger(syncRunId, redisInstance);
}
```

**Step 2: Update tests**

Remove the `vi.mock("ioredis")` block. Instead mock `../../config/redis`:

```typescript
const mockPublish = vi.fn().mockResolvedValue(1);
vi.mock("../../config/redis", () => ({
  redis: {
    publish: mockPublish,
  },
}));
```

Remove `mockQuit` expectations from tests — `close()` no longer calls `quit()`.

Add a test: "accepts custom Redis instance":
```typescript
it("uses provided Redis instance", async () => {
  const customRedis = { publish: vi.fn().mockResolvedValue(1) };
  const logger = new SyncLogger(1, customRedis as unknown as Redis);
  await logger.log({ entityType: "league", entityId: "1", action: "created" });
  expect(customRedis.publish).toHaveBeenCalled();
});
```

Add a test: "disables streaming when null Redis passed":
```typescript
it("disables streaming when null Redis passed", async () => {
  const logger = new SyncLogger(1, null);
  await logger.log({ entityType: "league", entityId: "1", action: "created" });
  expect(mockPublish).not.toHaveBeenCalled();
});
```

**Step 3: Run tests**

```bash
pnpm --filter @dragons/api test -- sync-logger.test
```

**Step 4: Commit**

```bash
git add apps/api/src/services/sync/sync-logger.ts apps/api/src/services/sync/sync-logger.test.ts
git commit -m "fix: reuse shared Redis connection in SyncLogger instead of creating per-run"
```

---

### Task 7: Add session age validation to SdkClient

**Files:**
- Modify: `apps/api/src/services/sync/sdk-client.ts:81-174`
- Test: `apps/api/src/services/sync/sdk-client.test.ts`

**Context:** `ensureAuthenticated()` checks `this.isAuthenticated` (a boolean) but doesn't validate the session is still alive. Sessions expire between daily syncs. Fix: track last auth time and re-validate after a threshold.

**Step 1: Update the implementation**

Add timestamp tracking to `AuthenticatedClient`:

```typescript
class AuthenticatedClient {
  private sessionCookie: string | null = null;
  private isAuthenticated = false;
  private lastAuthenticatedAt: number = 0;

  async login(): Promise<boolean> {
    // ... existing login code ...
    this.isAuthenticated = true;
    this.lastAuthenticatedAt = Date.now();
    log.info("Successfully authenticated with basketball-bund.net");
    return true;
  }

  logout(): void {
    this.sessionCookie = null;
    this.isAuthenticated = false;
    this.lastAuthenticatedAt = 0;
  }

  get authenticatedAt(): number {
    return this.lastAuthenticatedAt;
  }
  // ... rest unchanged
}
```

Update `SdkClient.ensureAuthenticated()`:

```typescript
private static readonly SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

async ensureAuthenticated(): Promise<void> {
  const sessionAge = Date.now() - this.authClient.authenticatedAt;
  if (!this.authClient.authenticated || sessionAge > SdkClient.SESSION_MAX_AGE_MS) {
    if (this.authClient.authenticated) {
      log.info({ sessionAgeMs: sessionAge }, "Session expired, re-authenticating");
    }
    await withRetry(() => this.authClient.login(), 3, "login");
  }
}
```

**Step 2: Update tests**

In `sdk-client.test.ts`, add tests:

```typescript
it("re-authenticates when session is older than 30 minutes", async () => {
  // First login
  mockFetch(/* success response */);
  await client.ensureAuthenticated();

  // Advance time past 30 minutes
  vi.advanceTimersByTime(31 * 60 * 1000);

  // Second call should trigger re-login
  mockFetch(/* success response */);
  await client.ensureAuthenticated();

  // Login should have been called twice
  expect(fetchCallCount("login.do")).toBe(2);
});

it("does not re-authenticate when session is fresh", async () => {
  mockFetch(/* success response */);
  await client.ensureAuthenticated();

  // Only 5 minutes later
  vi.advanceTimersByTime(5 * 60 * 1000);

  await client.ensureAuthenticated();

  // Login should have been called only once
  expect(fetchCallCount("login.do")).toBe(1);
});
```

**Step 3: Run tests**

```bash
pnpm --filter @dragons/api test -- sdk-client.test
```

**Step 4: Commit**

```bash
git add apps/api/src/services/sync/sdk-client.ts apps/api/src/services/sync/sdk-client.test.ts
git commit -m "fix: validate SDK session age and re-authenticate after 30 minutes"
```

---

### Task 8: Use authenticated user ID for `changedBy` in match routes

**Files:**
- Modify: `apps/api/src/routes/admin/match.routes.ts:77,111`
- Test: `apps/api/src/routes/admin/match.routes.test.ts`

**Context:** `changedBy` is hardcoded to `"admin"`. The auth middleware sets `c.get("user")` with the full user object including `id`. Use it.

**Step 1: Update the implementation**

In `match.routes.ts`, line 77:

```typescript
// OLD:
const changedBy = "admin";

// NEW:
const changedBy = c.get("user")?.id ?? "unknown";
```

Same change on line 111 (in the DELETE override handler).

Also fix the fire-and-forget swallowed error on lines 85-87 — log it instead:

```typescript
// OLD:
import("../../services/venue-booking/venue-booking.service")
  .then(({ reconcileMatch }) => reconcileMatch(id))
  .catch(() => {});

// NEW:
import("../../services/venue-booking/venue-booking.service")
  .then(({ reconcileMatch }) => reconcileMatch(id))
  .catch((err) => {
    const log = c.get("logger") ?? console;
    log.error({ err, matchId: id }, "Venue booking reconciliation failed after match update");
  });
```

**Step 2: Update tests**

The test app doesn't set `user` in context (no auth middleware). Add a middleware that sets a mock user for tests:

```typescript
const app = new Hono<AppEnv>();
app.use("/*", async (c, next) => {
  c.set("user", { id: "user-123", role: "admin", name: "Test Admin", email: "admin@test.com", emailVerified: true } as AppEnv["Variables"]["user"]);
  await next();
});
app.onError(errorHandler);
app.route("/", matchRoutes);
```

Then update the test expectations:

```typescript
// OLD:
expect(mocks.updateMatchLocal).toHaveBeenCalledWith(1, { ... }, "admin");

// NEW:
expect(mocks.updateMatchLocal).toHaveBeenCalledWith(1, { ... }, "user-123");
```

Same for `releaseOverride` calls.

Update the "swallows booking reconciliation errors silently" test to verify logging instead of silent swallowing.

**Step 3: Run tests**

```bash
pnpm --filter @dragons/api test -- match.routes.test
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/admin/match.routes.ts apps/api/src/routes/admin/match.routes.test.ts
git commit -m "fix: use authenticated user ID for changedBy instead of hardcoded 'admin'"
```

---

### Task 9: Run full test suite and coverage

After all 8 tasks are complete, verify everything works together.

**Step 1: Run full API test suite**

```bash
pnpm --filter @dragons/api test
```

**Step 2: Run coverage**

```bash
pnpm --filter @dragons/api coverage
```

Fix any coverage regressions.

**Step 3: Run typecheck**

```bash
pnpm typecheck
```

**Step 4: Run lint**

```bash
pnpm lint
```

**Step 5: Final commit if any fixes needed**

```bash
git add -u
git commit -m "chore: fix coverage and lint issues from sync performance fixes"
```

# Backend Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the 6 priority issues identified in the backend analysis: manual sync trigger bug, token bucket race condition, sync logger infinite retry, DB pool cleanup on shutdown, sync run retention, and venue booking batch operations.

**Architecture:** Targeted fixes to existing files. No new tables or endpoints. Each fix is isolated and independently testable.

**Tech Stack:** Hono, Drizzle ORM, BullMQ, ioredis, Vitest

---

### Task 1: Fix manual sync trigger to pass authenticated user ID

The `POST /admin/sync/trigger` route calls `triggerManualSync()` without passing the authenticated user's ID. The user ID is available via `c.get("user")?.id` since the route is behind `requireAdmin` middleware.

**Files:**
- Modify: `apps/api/src/routes/admin/sync.routes.ts:39-42`
- Test: `apps/api/src/routes/admin/sync.routes.test.ts`

**Step 1: Update test to verify user ID is passed**

In `sync.routes.test.ts`, the test app needs to set user context. Update the "triggers manual sync" test:

```typescript
// In the test app setup, add middleware to simulate auth context
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.use("*", async (c, next) => {
  c.set("user", { id: "test-user-123" } as AppEnv["Variables"]["user"]);
  await next();
});
app.route("/", syncRoutes);
```

Update the test assertion:
```typescript
expect(mocks.triggerManualSync).toHaveBeenCalledWith("test-user-123");
```

**Step 2: Update the route handler**

In `sync.routes.ts`, change the trigger handler to pass user ID:

```typescript
async (c) => {
  const userId = c.get("user")?.id;
  const result = await triggerManualSync(userId);
  return c.json(result);
},
```

**Step 3: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/routes/admin/sync.routes.test.ts`

---

### Task 2: Make TokenBucket concurrency-safe

The `acquire()` method can go negative with concurrent callers. Fix by using a mutex (promise chain) to serialize access.

**Files:**
- Modify: `apps/api/src/services/sync/sdk-client.ts:22-56`
- Test: `apps/api/src/services/sync/sdk-client.test.ts`

**Step 1: Add concurrency test**

```typescript
describe("TokenBucket concurrency", () => {
  it("does not exceed rate limit with concurrent acquires", async () => {
    // Create a client with a very small bucket to test contention
    const testClient = new SdkClient();

    // Mock spielplan calls to track timing
    let concurrentCalls = 0;
    let maxConcurrent = 0;
    mockGetSpielplan.mockImplementation(async () => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await new Promise(r => setTimeout(r, 10));
      concurrentCalls--;
      return { matches: [] };
    });

    // Fire 20 calls concurrently - should not error or go negative
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => testClient.getSpielplan(i))
    );

    expect(mockGetSpielplan).toHaveBeenCalledTimes(20);
  });
});
```

**Step 2: Fix TokenBucket implementation**

Replace the TokenBucket class with a serialized version:

```typescript
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private maxTokens: number = 15,
    private refillRate: number = 10,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    // Serialize access to prevent races
    this.pending = this.pending.then(() => this.acquireInternal());
    return this.pending;
  }

  private async acquireInternal(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }
    const waitMs = (1 / this.refillRate) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRate,
    );
    this.lastRefill = now;
  }
}
```

**Step 3: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/sync/sdk-client.test.ts`

---

### Task 3: Fix SyncLogger infinite retry on flush failure

When `flush()` fails, entries are pushed back into the buffer. On repeated failures this grows unbounded. Fix: limit retry attempts per entry batch, then drop with error log.

**Files:**
- Modify: `apps/api/src/services/sync/sync-logger.ts:82-93`
- Test: `apps/api/src/services/sync/sync-logger.test.ts`

**Step 1: Add test for max retry behavior**

```typescript
it("drops entries after max flush retries", async () => {
  // Make flush fail 3 times
  mockInsert.mockReturnValue({
    values: vi.fn().mockRejectedValue(new Error("DB error")),
  });
  const logger = new SyncLogger(1);

  await logger.log({ entityType: "league", entityId: "1", action: "created" });

  // Flush 3 times (max retries) - all fail
  await logger.flush();
  await logger.flush();
  await logger.flush();

  // 4th flush should not attempt insert (entries dropped)
  mockInsert.mockClear();
  await logger.flush();

  expect(mockInsert).not.toHaveBeenCalled();
});
```

**Step 2: Implement max retry logic**

```typescript
export class SyncLogger {
  // ... existing fields
  private flushRetries = 0;
  private static readonly MAX_FLUSH_RETRIES = 3;

  async flush(): Promise<void> {
    if (this.entries.length === 0) return;

    const toInsert = [...this.entries];
    this.entries = [];

    try {
      await db.insert(syncRunEntries).values(toInsert);
      this.flushRetries = 0;
    } catch (error) {
      this.flushRetries++;
      if (this.flushRetries < SyncLogger.MAX_FLUSH_RETRIES) {
        log.error({ err: error, retry: this.flushRetries }, "Failed to flush entries, will retry");
        this.entries.push(...toInsert);
      } else {
        log.error(
          { err: error, droppedCount: toInsert.length },
          "Failed to flush entries after max retries, dropping batch",
        );
        this.flushRetries = 0;
      }
    }
  }
}
```

**Step 3: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/sync/sync-logger.test.ts`

---

### Task 4: Expose DB pool for cleanup on shutdown

The Proxy pattern in `database.ts` hides the Pool, making graceful shutdown impossible. Expose a `closeDb()` function and call it during shutdown.

**Files:**
- Modify: `packages/db/src/index.ts`
- Modify: `apps/api/src/config/database.ts`
- Modify: `apps/api/src/workers/index.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/config/database.test.ts`
- Test: `apps/api/src/workers/index.test.ts`

**Step 1: Add `closeDb()` to packages/db**

Update `packages/db/src/index.ts`:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  const db = drizzle(pool, { schema });

  return { db, pool };
}

export type Database = ReturnType<typeof createDb>["db"];
export * from "./schema";
```

**Step 2: Update `apps/api/src/config/database.ts`**

```typescript
import { createDb, type Database } from "@dragons/db";
import type { Pool } from "pg";
import { env } from "./env";

let _db: Database | undefined;
let _pool: Pool | undefined;

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    if (!_db) {
      const created = createDb(env.DATABASE_URL);
      _db = created.db;
      _pool = created.pool;
    }
    return (_db as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
    _db = undefined;
  }
}
```

**Step 3: Call `closeDb()` during shutdown**

In `apps/api/src/index.ts` shutdown function:
```typescript
async function shutdown() {
  logger.info("Shutting down...");
  if (shutdownWorkersFn) await shutdownWorkersFn();
  if (httpServer) (httpServer as { close: () => void }).close();
  const { closeDb } = await import("./config/database");
  await closeDb();
  process.exit(0);
}
```

**Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/config/database.test.ts`
Run: `pnpm --filter @dragons/api test -- --run apps/api/src/workers/index.test.ts`

---

### Task 5: Add sync run retention policy

Add cleanup of old sync runs during worker initialization. Delete runs older than 90 days.

**Files:**
- Modify: `apps/api/src/workers/index.ts`
- Test: `apps/api/src/workers/index.test.ts`

**Step 1: Add cleanup function and call it from initializeWorkers**

```typescript
import { syncRuns, syncRunEntries } from "@dragons/db/schema";
import { eq, lt, inArray, sql } from "drizzle-orm";

async function cleanupOldSyncRuns(retentionDays: number = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  // Find old runs
  const oldRuns = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(lt(syncRuns.startedAt, cutoff));

  if (oldRuns.length === 0) return 0;

  const oldRunIds = oldRuns.map((r) => r.id);

  // Delete entries first (FK), then runs
  await db.delete(syncRunEntries).where(inArray(syncRunEntries.syncRunId, oldRunIds));
  await db.delete(syncRuns).where(inArray(syncRuns.id, oldRunIds));

  return oldRuns.length;
}
```

Call from `initializeWorkers()`:
```typescript
try {
  const cleaned = await cleanupOldSyncRuns();
  if (cleaned > 0) {
    logger.info({ count: cleaned }, "Cleaned up old sync runs");
  }
} catch (error) {
  logger.warn({ err: error }, "Failed to cleanup old sync runs");
}
```

**Step 2: Write tests**

Test that cleanup deletes old runs and handles errors gracefully.

**Step 3: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/workers/index.test.ts`

---

### Task 6: Batch venue booking junction operations

Replace per-row INSERT/DELETE in `syncBookingMatches` and booking creation with batch operations.

**Files:**
- Modify: `apps/api/src/services/venue-booking/venue-booking.service.ts`
- Test: `apps/api/src/services/venue-booking/venue-booking.service.test.ts`

**Step 1: Batch `syncBookingMatches`**

Replace individual inserts/deletes with batch operations:

```typescript
async function syncBookingMatches(
  bookingId: number,
  expectedMatchIds: number[],
): Promise<void> {
  const existing = await db
    .select({ matchId: venueBookingMatches.matchId })
    .from(venueBookingMatches)
    .where(eq(venueBookingMatches.venueBookingId, bookingId));

  const existingIds = new Set(existing.map((r) => r.matchId));
  const expectedIds = new Set(expectedMatchIds);

  const toInsert = [...expectedIds].filter((id) => !existingIds.has(id));
  const toDelete = [...existingIds].filter((id) => !expectedIds.has(id));

  if (toInsert.length > 0) {
    await db.insert(venueBookingMatches).values(
      toInsert.map((matchId) => ({ venueBookingId: bookingId, matchId })),
    );
  }

  if (toDelete.length > 0) {
    await db
      .delete(venueBookingMatches)
      .where(
        and(
          eq(venueBookingMatches.venueBookingId, bookingId),
          inArray(venueBookingMatches.matchId, toDelete),
        ),
      );
  }
}
```

**Step 2: Batch new booking match inserts**

In `reconcileBookingsForMatches`, replace the per-match insert loop:

```typescript
// OLD (lines 460-465):
for (const mid of activeMatchIds) {
  await db.insert(venueBookingMatches).values({ ... });
}

// NEW:
if (activeMatchIds.length > 0) {
  await db.insert(venueBookingMatches).values(
    activeMatchIds.map((matchId) => ({
      venueBookingId: created!.id,
      matchId,
    })),
  );
}
```

**Step 3: Batch junction cleanup for cancelled matches**

In the `activeGames.length === 0` branch, replace per-match delete loop:

```typescript
// OLD (lines 379-387):
for (const game of group) {
  await db.delete(venueBookingMatches).where(and(...));
}

// NEW:
const cancelledMatchIds = group.map((g) => g.matchId);
await db
  .delete(venueBookingMatches)
  .where(
    and(
      eq(venueBookingMatches.venueBookingId, existing.id),
      inArray(venueBookingMatches.matchId, cancelledMatchIds),
    ),
  );
```

**Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/venue-booking/venue-booking.service.test.ts`

---

### Task 7: Remove SyncOrchestrator class wrapper + dynamic import

The `SyncOrchestrator` class has no state. Convert to a plain exported function. Also replace the dynamic `import()` of venue-booking with a static import.

**Files:**
- Modify: `apps/api/src/services/sync/index.ts`
- Modify: `apps/api/src/workers/sync.worker.ts`
- Test: `apps/api/src/services/sync/index.test.ts`
- Test: `apps/api/src/workers/sync.worker.test.ts`

**Step 1: Convert class to function, static import venue-booking**

```typescript
import { reconcileAfterSync } from "../venue-booking/venue-booking.service";

// Remove: export class SyncOrchestrator { ... }
// Remove: export const syncOrchestrator = new SyncOrchestrator();

export async function fullSync(
  triggeredBy: "cron" | "manual",
  jobLogger?: (msg: string) => Promise<void> | void,
  syncRunId?: number,
): Promise<SyncResult> {
  // ... same body, just not inside a class
}
```

**Step 2: Update worker import**

In `sync.worker.ts`:
```typescript
// OLD: import { syncOrchestrator } from "../services/sync/index";
import { fullSync } from "../services/sync/index";

// In the worker processor:
// OLD: const fullResult = await syncOrchestrator.fullSync(triggeredBy, jobLogger, job.data.syncRunId);
const fullResult = await fullSync(triggeredBy, jobLogger, job.data.syncRunId);
```

**Step 3: Update tests for new import shape**

**Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/sync/index.test.ts`
Run: `pnpm --filter @dragons/api test -- --run apps/api/src/workers/sync.worker.test.ts`

---

### Task 8: Deduplicate score validation helpers in matches.sync.ts

Remove the duplicate `validScore` local function in `extractPeriodScores`, use the module-level `validScoreOrNull` instead.

**Files:**
- Modify: `apps/api/src/services/sync/matches.sync.ts:81-84,111-112`
- Test: `apps/api/src/services/sync/matches.sync.test.ts`

**Step 1: Remove the local `validScore` and use `validScoreOrNull`**

In `extractPeriodScores`, replace:
```typescript
// OLD (line 111-112):
const validScore = (score: number | undefined) =>
  score !== undefined && score >= 0 ? score : null;

// Remove it entirely. Replace all usages of validScore(...) with validScoreOrNull(...)
```

**Step 2: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/sync/matches.sync.test.ts`

---

### Final: Run full test suite

Run: `pnpm --filter @dragons/api test`
Run: `pnpm typecheck`

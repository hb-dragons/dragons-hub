# Configurable Referee Games Sync Schedule — Design Spec

## Goal

Make the referee games sync schedule user-configurable (enable/disable, interval) with full UI parity to the main sync: status cards showing next sync countdown, schedule config card with interval picker.

## Current State

- Main sync: cron-based schedule stored in `sync_schedule` table, configurable via admin UI (hour picker + timezone + enable/disable). UI shows 4 status cards including "Next Sync" countdown.
- Referee games sync: hardcoded 30-minute interval in `apps/api/src/workers/index.ts` line 82. No schedule persistence. UI shows 2 status cards (Current Status + Last Sync) — no "Next Sync" or "Schedule" cards. No schedule config UI.

## Design Decisions

1. **Interval-based scheduling** — referee sync uses a fixed interval (every N minutes) rather than a daily cron. Referee slots change throughout the day and need frequent checks.
2. **Single table, discriminated by `syncType`** — extend `sync_schedule` with a `sync_type` column and `interval_minutes` column rather than creating a separate table.
3. **Client-computed next run** — `nextRun = lastSync.completedAt + intervalMinutes`. No extra server state needed.

---

## 1. Database Schema Changes

### `sync_schedule` table modifications

Add two columns, make `cron_expression` nullable, add unique constraint on `sync_type`:

```sql
-- New columns
ALTER TABLE sync_schedule ADD COLUMN sync_type varchar(50) NOT NULL DEFAULT 'full';
ALTER TABLE sync_schedule ADD COLUMN interval_minutes integer;

-- Make cron_expression nullable (interval-based schedules don't use it)
ALTER TABLE sync_schedule ALTER COLUMN cron_expression DROP NOT NULL;
ALTER TABLE sync_schedule ALTER COLUMN cron_expression DROP DEFAULT;

-- Unique constraint: one schedule per sync type
ALTER TABLE sync_schedule ADD CONSTRAINT sync_schedule_sync_type_unique UNIQUE (sync_type);

-- Set existing row's sync_type explicitly
UPDATE sync_schedule SET sync_type = 'full' WHERE sync_type = 'full';

-- Seed referee-games schedule row
INSERT INTO sync_schedule (sync_type, enabled, interval_minutes, timezone)
VALUES ('referee-games', true, 30, 'Europe/Berlin');
```

### Drizzle schema update (`packages/db/src/schema/sync-runs.ts`)

```typescript
export const syncSchedule = pgTable("sync_schedule", {
  id: serial("id").primaryKey(),
  syncType: varchar("sync_type", { length: 50 }).notNull().default("full").unique(),
  enabled: boolean("enabled").notNull().default(true),
  cronExpression: varchar("cron_expression", { length: 100 }),
  intervalMinutes: integer("interval_minutes"),
  timezone: varchar("timezone", { length: 100 }).notNull().default("Europe/Berlin"),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }),
  lastUpdatedBy: varchar("last_updated_by", { length: 255 }),
});
```

Note: `cronExpression` loses its `.notNull()` and `.default("0 4 * * *")`. Existing rows already have values, so no data loss.

---

## 2. Backend Changes

### `apps/api/src/workers/queues.ts`

**`initializeScheduledJobs()`** — Read both schedule rows. For the referee row, set up BullMQ repeatable job with `repeat: { every: intervalMinutes * 60 * 1000 }`. Remove the hardcoded 30-min job from `index.ts`.

```typescript
// In initializeScheduledJobs():
// After setting up main sync (existing logic)...

// Referee games sync — interval-based
const [refereeSchedule] = await db
  .select()
  .from(syncSchedule)
  .where(eq(syncSchedule.syncType, "referee-games"))
  .limit(1);

const refInterval = refereeSchedule?.intervalMinutes ?? 30;
const refEnabled = refereeSchedule?.enabled ?? true;

if (refEnabled) {
  await syncQueue.add(
    "referee-games-sync-scheduled",
    { type: "referee-games" },
    {
      repeat: { every: refInterval * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  logger.info({ intervalMinutes: refInterval }, "Referee games sync scheduled");
} else {
  logger.info("Referee games sync schedule is disabled");
}
```

**New `updateRefereeSyncSchedule()`** — Mirrors `updateSyncSchedule()`:

```typescript
export async function updateRefereeSyncSchedule(
  enabled: boolean,
  intervalMinutes: number,
) {
  // Remove existing referee scheduled jobs
  const repeatableJobs = await syncQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "referee-games-sync-scheduled") {
      await syncQueue.removeRepeatableByKey(job.key);
    }
  }

  if (enabled) {
    await syncQueue.add(
      "referee-games-sync-scheduled",
      { type: "referee-games" },
      {
        repeat: { every: intervalMinutes * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    logger.info({ intervalMinutes }, "Referee sync schedule updated");
  } else {
    logger.info("Referee sync schedule disabled");
  }
}
```

### `apps/api/src/workers/index.ts`

**Remove** the hardcoded referee sync scheduling (lines 81-87):
```typescript
// DELETE these lines:
await syncQueue.add("referee-games-sync-scheduled", { type: "referee-games" }, {
  repeat: { every: 30 * 60 * 1000 },
  removeOnComplete: true,
  removeOnFail: 100,
});
```

This is now handled by `initializeScheduledJobs()`.

### `apps/api/src/services/admin/sync-admin.service.ts`

**`getSchedule(syncType?)`** — Accept optional syncType parameter:

```typescript
export async function getSchedule(syncType: string = "full") {
  const [schedule] = await db
    .select()
    .from(syncSchedule)
    .where(eq(syncSchedule.syncType, syncType))
    .limit(1);

  if (!schedule) {
    // Return defaults based on syncType
    if (syncType === "referee-games") {
      return {
        id: null,
        syncType: "referee-games",
        enabled: true,
        cronExpression: null,
        intervalMinutes: 30,
        timezone: "Europe/Berlin",
        lastUpdatedAt: null,
        lastUpdatedBy: null,
      };
    }
    return {
      id: null,
      syncType: "full",
      enabled: true,
      cronExpression: "0 4 * * *",
      intervalMinutes: null,
      timezone: "Europe/Berlin",
      lastUpdatedAt: null,
      lastUpdatedBy: null,
    };
  }

  return schedule;
}
```

**`upsertSchedule(data)`** — Become syncType-aware. When syncType is `"referee-games"`, call `updateRefereeSyncSchedule()` instead of `updateSyncSchedule()`.

### `apps/api/src/routes/admin/sync.routes.ts`

**`GET /admin/sync/schedule`** — Pass `syncType` query param through:
```typescript
async (c) => {
  const syncType = c.req.query("syncType") ?? "full";
  const schedule = await getSchedule(syncType);
  return c.json(schedule);
}
```

**`PUT /admin/sync/schedule`** — Accept `syncType` and `intervalMinutes` in body.

### `apps/api/src/routes/admin/sync.schemas.ts`

Extend `updateScheduleBodySchema`:
```typescript
export const updateScheduleBodySchema = z.object({
  syncType: z.string().optional(),
  enabled: z.boolean().optional(),
  cronExpression: z.string().regex(...).optional().nullable(),
  intervalMinutes: z.number().int().min(5).max(120).optional(),
  timezone: z.string().min(1).optional(),
  updatedBy: z.string().optional(),
});
```

---

## 3. Shared Types

### `packages/shared/src/sync.ts`

Update `SyncScheduleData`:
```typescript
export interface SyncScheduleData {
  id: number | null;
  syncType: string;
  enabled: boolean;
  cronExpression: string | null;
  intervalMinutes: number | null;
  timezone: string;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
}
```

---

## 4. Frontend Changes

### `apps/web/src/components/admin/sync/use-sync.ts`

**New hook `useRefereeSyncSchedule()`:**
```typescript
export function useRefereeSyncSchedule() {
  const { data, error, mutate } = useSWR<SyncScheduleData>(
    SWR_KEYS.refereeSyncSchedule,
    apiFetcher,
  );
  return { schedule: data ?? null, error, mutate };
}
```

Add SWR key: `refereeSyncSchedule: "/admin/sync/schedule?syncType=referee-games"` in `swr-keys.ts`.

### `apps/web/src/components/admin/sync/referee-sync-status-cards.tsx`

Expand from 2-column grid to 4-column grid. Add two new cards:

**Next Sync card:**
- Compute: `nextRun = new Date(lastSync.completedAt).getTime() + schedule.intervalMinutes * 60 * 1000`
- Display countdown: "in X minutes" or "disabled"
- Edge case: if no sync has completed yet and schedule is enabled, show "starting soon"
- Show interval info below: "Every 30 min"

**Schedule card:**
- Show enabled/disabled status
- Show interval: "Every 30 min"

### `apps/web/src/components/admin/sync/referee-sync-schedule-config.tsx` (new file)

Schedule configuration card with:
- **Enable/disable toggle** — same as main sync
- **Interval dropdown** — options: 5, 10, 15, 30, 45, 60 minutes
- **Save button** — calls `PUT /admin/sync/schedule` with `syncType: "referee-games"` and `intervalMinutes`
- No timezone or hour picker (not needed for interval-based)

### `apps/web/src/components/admin/sync/referee-sync-tab.tsx`

Add `<RefereeSyncScheduleConfig />` after the status cards section.

---

## 5. i18n Keys

New translation keys needed (in `refereeGames` or `sync` namespace):
- `sync.refereeSchedule.title` — "Referee Sync Schedule"
- `sync.refereeSchedule.description` — "Configure how often referee games are synced"
- `sync.refereeSchedule.intervalLabel` — "Sync interval"
- `sync.refereeSchedule.intervalDescription` — "How often to check for referee game updates"
- `sync.refereeSchedule.everyNMinutes` — "Every {minutes} min"
- `sync.status.inMinutesShort` — "in {minutes} min" (for next sync card countdown)

---

## 6. Files Touched

### Create
- `referee-sync-schedule-config.tsx` — new schedule config component

### Modify
- `packages/db/src/schema/sync-runs.ts` — add `syncType`, `intervalMinutes` columns
- `packages/shared/src/sync.ts` — update `SyncScheduleData` type
- `apps/api/src/workers/queues.ts` — read referee schedule, add `updateRefereeSyncSchedule()`
- `apps/api/src/workers/index.ts` — remove hardcoded 30-min schedule
- `apps/api/src/services/admin/sync-admin.service.ts` — syncType-aware `getSchedule`/`upsertSchedule`
- `apps/api/src/routes/admin/sync.routes.ts` — pass syncType query param
- `apps/api/src/routes/admin/sync.schemas.ts` — add `syncType`, `intervalMinutes` to schema
- `apps/web/src/components/admin/sync/use-sync.ts` — add `useRefereeSyncSchedule()` hook
- `apps/web/src/components/admin/sync/referee-sync-status-cards.tsx` — add Next Sync + Schedule cards
- `apps/web/src/components/admin/sync/referee-sync-tab.tsx` — add schedule config section
- `apps/web/src/lib/swr-keys.ts` — add `refereeSyncSchedule` key
- i18n message files — add new translation keys
- Drizzle migration file (generated)

### No changes
- `apps/api/src/services/sync/referee-games.sync.ts` — sync logic unchanged
- `apps/web/src/components/referee/referee-games-list.tsx` — unaffected

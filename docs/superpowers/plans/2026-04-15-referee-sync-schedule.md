# Referee Sync Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the referee games sync schedule user-configurable with full UI parity to the main sync (next sync countdown, schedule config card).

**Architecture:** Extend the existing `sync_schedule` table with `syncType` discriminator and `intervalMinutes` column. Backend reads the referee schedule row on startup and configures BullMQ accordingly. Frontend adds Next Sync + Schedule cards and an interval config component.

**Tech Stack:** Drizzle ORM, BullMQ, Hono, Next.js 16, SWR, shadcn/ui, next-intl

**Spec:** `docs/superpowers/specs/2026-04-15-referee-sync-schedule-design.md`

---

### Task 1: Database schema — add `syncType` and `intervalMinutes` to `sync_schedule`

**Files:**
- Modify: `packages/db/src/schema/sync-runs.ts:73-80`
- Generated: `packages/db/drizzle/XXXX_*.sql` (migration)

- [ ] **Step 1: Update Drizzle schema**

In `packages/db/src/schema/sync-runs.ts`, replace the `syncSchedule` table definition:

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

Changes from current:
- Add `syncType` with `.notNull().default("full").unique()`
- Add `intervalMinutes` (nullable integer)
- Remove `.notNull()` and `.default("0 4 * * *")` from `cronExpression`

- [ ] **Step 2: Generate migration**

Run: `pnpm --filter @dragons/db db:generate`

- [ ] **Step 3: Edit the generated migration to seed referee-games row**

The generated SQL will handle the column additions. Append at the end of the migration file:

```sql
--> statement-breakpoint
UPDATE "sync_schedule" SET "sync_type" = 'full' WHERE "sync_type" = 'full';
--> statement-breakpoint
INSERT INTO "sync_schedule" ("sync_type", "enabled", "interval_minutes", "timezone")
VALUES ('referee-games', true, 30, 'Europe/Berlin')
ON CONFLICT ("sync_type") DO NOTHING;
```

- [ ] **Step 4: Run migration**

Run: `pnpm --filter @dragons/db db:migrate`
Expected: Migration applies successfully. Two rows in `sync_schedule`: one for `full`, one for `referee-games`.

- [ ] **Step 5: Verify**

Run: `psql $DATABASE_URL -c "SELECT id, sync_type, enabled, cron_expression, interval_minutes FROM sync_schedule;"`
Expected: Two rows — `full` with `cron_expression = '0 4 * * *'` and `referee-games` with `interval_minutes = 30`.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/sync-runs.ts packages/db/drizzle/
git commit -m "feat(db): add syncType and intervalMinutes to sync_schedule"
```

---

### Task 2: Shared types — update `SyncScheduleData`

**Files:**
- Modify: `packages/shared/src/sync.ts:102-109`

- [ ] **Step 1: Update the interface**

In `packages/shared/src/sync.ts`, replace the `SyncScheduleData` interface:

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

Changes from current:
- Add `syncType: string`
- Change `cronExpression: string` to `cronExpression: string | null`
- Add `intervalMinutes: number | null`

- [ ] **Step 2: Run typecheck to find breakages**

Run: `pnpm typecheck`
Expected: Some errors in `sync-admin.service.ts` (getSchedule default return) and `sync-schedule-config.tsx` (cronExpression assumed non-null). These will be fixed in later tasks. Note the errors but proceed.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/sync.ts
git commit -m "feat(shared): add syncType and intervalMinutes to SyncScheduleData"
```

---

### Task 3: Backend — syncType-aware schedule service and routes

**Files:**
- Modify: `apps/api/src/services/admin/sync-admin.service.ts:183-234`
- Modify: `apps/api/src/routes/admin/sync.routes.ts:373-400`
- Modify: `apps/api/src/routes/admin/sync.schemas.ts:49-57`

- [ ] **Step 1: Update `sync.schemas.ts` — extend `updateScheduleBodySchema`**

Replace the `updateScheduleBodySchema` in `apps/api/src/routes/admin/sync.schemas.ts`:

```typescript
export const updateScheduleBodySchema = z.object({
  syncType: z.string().optional(),
  enabled: z.boolean().optional(),
  cronExpression: z
    .string()
    .regex(/^[\d*,\-/]+\s[\d*,\-/]+\s[\d*,\-/]+\s[\d*,\-/]+\s[\d*,\-/]+$/, "Invalid cron expression")
    .optional()
    .nullable(),
  intervalMinutes: z.number().int().min(5).max(120).optional(),
  timezone: z.string().min(1).optional(),
  updatedBy: z.string().optional(),
});
```

Changes: add `syncType`, `intervalMinutes`, make `cronExpression` nullable.

- [ ] **Step 2: Update `sync-admin.service.ts` — make `getSchedule` syncType-aware**

Replace the `getSchedule` function:

```typescript
export async function getSchedule(syncType: string = "full") {
  const [schedule] = await db
    .select()
    .from(syncSchedule)
    .where(eq(syncSchedule.syncType, syncType))
    .limit(1);

  if (!schedule) {
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

- [ ] **Step 3: Update `sync-admin.service.ts` — make `upsertSchedule` syncType-aware**

Replace the `upsertSchedule` function. Add the `updateRefereeSyncSchedule` import at the top (will be created in Task 4, use a placeholder import for now):

```typescript
import { updateSyncSchedule, updateRefereeSyncSchedule } from "../../workers/queues";
```

Replace the function body:

```typescript
export async function upsertSchedule(data: UpdateScheduleBody) {
  const syncType = data.syncType ?? "full";
  const [existing] = await db
    .select()
    .from(syncSchedule)
    .where(eq(syncSchedule.syncType, syncType))
    .limit(1);

  let schedule;
  if (existing) {
    [schedule] = await db
      .update(syncSchedule)
      .set({
        enabled: data.enabled ?? existing.enabled,
        cronExpression: data.cronExpression !== undefined ? data.cronExpression : existing.cronExpression,
        intervalMinutes: data.intervalMinutes ?? existing.intervalMinutes,
        timezone: data.timezone ?? existing.timezone,
        lastUpdatedAt: new Date(),
        lastUpdatedBy: data.updatedBy ?? null,
      })
      .where(eq(syncSchedule.id, existing.id))
      .returning();
  } else {
    [schedule] = await db
      .insert(syncSchedule)
      .values({
        syncType,
        enabled: data.enabled ?? true,
        cronExpression: data.cronExpression ?? (syncType === "full" ? "0 4 * * *" : null),
        intervalMinutes: data.intervalMinutes ?? (syncType === "referee-games" ? 30 : null),
        timezone: data.timezone ?? "Europe/Berlin",
        lastUpdatedAt: new Date(),
        lastUpdatedBy: data.updatedBy ?? null,
      })
      .returning();
  }

  if (schedule) {
    if (syncType === "referee-games") {
      await updateRefereeSyncSchedule(schedule.enabled, schedule.intervalMinutes ?? 30);
    } else {
      await updateSyncSchedule(schedule.enabled, schedule.cronExpression ?? "0 4 * * *", schedule.timezone);
    }
  }

  return schedule;
}
```

- [ ] **Step 4: Update `sync.routes.ts` — pass syncType to getSchedule**

In the `GET /admin/sync/schedule` handler, change:

```typescript
async (c) => {
  const syncType = c.req.query("syncType") ?? "full";
  const schedule = await getSchedule(syncType);
  return c.json(schedule);
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/sync.schemas.ts apps/api/src/services/admin/sync-admin.service.ts apps/api/src/routes/admin/sync.routes.ts
git commit -m "feat(api): make sync schedule endpoints syncType-aware"
```

---

### Task 4: Backend — BullMQ scheduling from DB, remove hardcoded interval

**Files:**
- Modify: `apps/api/src/workers/queues.ts:88-126`
- Modify: `apps/api/src/workers/index.ts:81-87`

- [ ] **Step 1: Add `updateRefereeSyncSchedule` to `queues.ts`**

Add this function after `updateSyncSchedule` (after line ~205):

```typescript
export async function updateRefereeSyncSchedule(
  enabled: boolean,
  intervalMinutes: number,
) {
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

- [ ] **Step 2: Update `initializeScheduledJobs` to also set up referee schedule**

In `queues.ts`, at the end of `initializeScheduledJobs()` (after the main sync block, before the closing `}`), add:

```typescript
  // Referee games sync — interval-based
  try {
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
  } catch {
    logger.warn("Could not read referee schedule from DB, using 30-min default");
    await syncQueue.add(
      "referee-games-sync-scheduled",
      { type: "referee-games" },
      {
        repeat: { every: 30 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
```

The file already imports `syncSchedule` from `@dragons/db/schema` and `db` from `../../config/database`. Add `eq` from `drizzle-orm`:

```typescript
import { eq } from "drizzle-orm";
```

- [ ] **Step 3: Remove hardcoded referee schedule from `index.ts`**

In `apps/api/src/workers/index.ts`, delete lines 81-87:

```typescript
// DELETE:
  // Referee games sync — scheduled every 30 minutes
  await syncQueue.add("referee-games-sync-scheduled", { type: "referee-games" }, {
    repeat: { every: 30 * 60 * 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  });
  logger.info("Referee games sync scheduled (every 30 minutes)");
```

This is now handled by `initializeScheduledJobs()`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (or only frontend errors from Task 2's type change, which are fixed in Task 5+).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/queues.ts apps/api/src/workers/index.ts
git commit -m "feat(api): read referee sync schedule from DB, remove hardcoded interval"
```

---

### Task 5: Frontend — add SWR key and schedule hook

**Files:**
- Modify: `apps/web/src/lib/swr-keys.ts`
- Modify: `apps/web/src/components/admin/sync/use-sync.ts`

Note: The `feat/referee-notifications` branch already added `refereeSyncStatus` and `refereeSyncLogs` SWR keys. This task is on a separate worktree from `main`, so we need to add all referee-related SWR keys. Check what exists first and add only what's missing.

- [ ] **Step 1: Add `refereeSyncSchedule` SWR key**

In `apps/web/src/lib/swr-keys.ts`, add inside the `SWR_KEYS` object:

```typescript
  refereeSyncSchedule: "/admin/sync/schedule?syncType=referee-games",
```

Also add these if they don't exist (they may be on the feature branch):
```typescript
  refereeSyncStatus: "/admin/sync/status?syncType=referee-games",
  refereeSyncLogs: (limit: number, offset: number) =>
    `/admin/sync/logs?limit=${limit}&offset=${offset}&syncType=referee-games`,
```

- [ ] **Step 2: Add `useRefereeSyncSchedule` hook**

In `apps/web/src/components/admin/sync/use-sync.ts`, add after the existing `useRefereeSyncLogs` function:

```typescript
export function useRefereeSyncSchedule() {
  const { data, error, mutate } = useSWR<SyncScheduleData>(
    SWR_KEYS.refereeSyncSchedule,
    apiFetcher,
  );

  return { schedule: data ?? null, error, mutate };
}
```

Make sure `SyncScheduleData` is imported in the `use-sync.ts` types import (it should already be via the `types.ts` re-export).

- [ ] **Step 3: Fix `sync-schedule-config.tsx` type error**

The `SyncScheduleData.cronExpression` is now `string | null`. In `apps/web/src/components/admin/sync/sync-schedule-config.tsx`, the `cronToHour` function and its callers assume non-null. Fix by defaulting:

Replace `cronToHour(schedule?.cronExpression ?? "0 4 * * *")` — this pattern already handles null since `??` converts null to the default. But check if there are places where `schedule.cronExpression` is accessed without `??`. If the existing code already uses `??` fallbacks, no changes needed.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/swr-keys.ts apps/web/src/components/admin/sync/use-sync.ts apps/web/src/components/admin/sync/sync-schedule-config.tsx
git commit -m "feat(web): add referee sync schedule SWR key and hook"
```

---

### Task 6: Frontend — expand referee status cards with Next Sync + Schedule

**Files:**
- Modify: `apps/web/src/components/admin/sync/referee-sync-status-cards.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire content of `referee-sync-status-cards.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useTranslations, useFormatter } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Activity, Clock, Timer, Calendar } from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";
import { useRefereeSyncStatus, useRefereeSyncSchedule } from "./use-sync";
import { formatDuration } from "./utils";
import type { SyncScheduleData } from "./types";

function getNextRunLabel(
  lastSync: { completedAt: string | null; status: string } | null,
  schedule: SyncScheduleData | null,
  t: ReturnType<typeof useTranslations>,
): string {
  if (!schedule?.enabled) return t("sync.status.disabled");
  if (!schedule.intervalMinutes) return t("sync.status.disabled");

  if (!lastSync?.completedAt) return t("sync.refereeSchedule.startingSoon");

  const lastCompleted = new Date(lastSync.completedAt).getTime();
  const nextRun = lastCompleted + schedule.intervalMinutes * 60 * 1000;
  const now = Date.now();
  const diffMs = nextRun - now;

  if (diffMs <= 0) return t("sync.refereeSchedule.startingSoon");

  const diffMinutes = Math.ceil(diffMs / (1000 * 60));
  return t("sync.status.inMinutes", { minutes: String(diffMinutes) });
}

export function RefereeSyncStatusCards() {
  const t = useTranslations();
  const format = useFormatter();
  const { status, isRunning } = useRefereeSyncStatus();
  const { schedule } = useRefereeSyncSchedule();
  const lastSync = status?.lastSync;

  // Tick relative times every 30s so they stay fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Current Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("sync.status.current")}</CardTitle>
          <Activity
            className={cn(
              "h-4 w-4 text-muted-foreground",
              isRunning && "animate-pulse text-blue-500",
            )}
          />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {isRunning ? (
              <span className="text-blue-500">{t("sync.status.running")}</span>
            ) : (
              t("sync.status.idle")
            )}
          </div>
          {isRunning && lastSync && (
            <p className="text-xs text-muted-foreground">
              {t("sync.status.type", { type: lastSync.syncType })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Last Sync */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("sync.status.lastSync")}</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {lastSync && lastSync.status !== "running" ? (
            <>
              <div
                className={cn(
                  "text-2xl font-bold",
                  lastSync.status === "completed"
                    ? "text-green-600"
                    : lastSync.status === "failed"
                      ? "text-red-600"
                      : "",
                )}
              >
                {lastSync.status === "completed"
                  ? t("sync.status.success")
                  : lastSync.status === "failed"
                    ? t("sync.status.failed")
                    : lastSync.status}
              </div>
              <p className="text-xs text-muted-foreground">
                {format.dateTime(new Date(lastSync.startedAt), "full")} &middot;{" "}
                {formatDuration(lastSync.durationMs)}
              </p>
              {(lastSync.recordsCreated != null ||
                lastSync.recordsUpdated != null ||
                lastSync.recordsSkipped != null) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {[
                    lastSync.recordsCreated != null &&
                      t("sync.live.created", { count: String(lastSync.recordsCreated) }),
                    lastSync.recordsUpdated != null &&
                      t("sync.live.updated", { count: String(lastSync.recordsUpdated) }),
                    lastSync.recordsSkipped != null &&
                      t("sync.live.skipped", { count: String(lastSync.recordsSkipped) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </>
          ) : (
            <div className="text-2xl font-bold text-muted-foreground">
              {t("sync.status.never")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next Sync */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("sync.status.nextSync")}</CardTitle>
          <Timer className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "text-2xl font-bold",
              schedule?.enabled ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {getNextRunLabel(lastSync ?? null, schedule, t)}
          </div>
          {schedule?.enabled && schedule.intervalMinutes && (
            <p className="text-xs text-muted-foreground">
              {t("sync.refereeSchedule.everyNMinutes", { minutes: String(schedule.intervalMinutes) })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("sync.status.schedule")}</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "text-2xl font-bold",
              schedule?.enabled ? "text-green-600" : "text-muted-foreground",
            )}
          >
            {schedule?.enabled ? t("sync.status.enabled") : t("sync.status.disabled")}
          </div>
          {schedule?.intervalMinutes && (
            <p className="text-xs text-muted-foreground">
              {t("sync.refereeSchedule.everyNMinutes", { minutes: String(schedule.intervalMinutes) })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/sync/referee-sync-status-cards.tsx
git commit -m "feat(web): add Next Sync and Schedule cards to referee sync tab"
```

---

### Task 7: Frontend — referee sync schedule config component

**Files:**
- Create: `apps/web/src/components/admin/sync/referee-sync-schedule-config.tsx`
- Modify: `apps/web/src/components/admin/sync/referee-sync-tab.tsx`
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

- [ ] **Step 1: Add i18n keys to `en.json`**

In the `sync` object, add a `refereeSchedule` sub-object:

```json
"refereeSchedule": {
  "title": "Referee Sync Schedule",
  "description": "Configure how often referee games are synced from the federation",
  "intervalLabel": "Sync Interval",
  "intervalDescription": "How often to check for referee game updates",
  "everyNMinutes": "Every {minutes} min",
  "startingSoon": "starting soon"
}
```

- [ ] **Step 2: Add i18n keys to `de.json`**

```json
"refereeSchedule": {
  "title": "SR-Spiele Sync-Zeitplan",
  "description": "Konfigurieren, wie oft SR-Spiele vom Verband synchronisiert werden",
  "intervalLabel": "Sync-Intervall",
  "intervalDescription": "Wie oft nach Änderungen bei SR-Spielen geprüft wird",
  "everyNMinutes": "Alle {minutes} Min.",
  "startingSoon": "startet bald"
}
```

- [ ] **Step 3: Create `referee-sync-schedule-config.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Button } from "@dragons/ui/components/button";
import { Label } from "@dragons/ui/components/label";
import { Switch } from "@dragons/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import type { SyncScheduleData } from "./types";
import { useRefereeSyncSchedule } from "./use-sync";

const INTERVALS = [
  { value: "5", label: "5" },
  { value: "10", label: "10" },
  { value: "15", label: "15" },
  { value: "30", label: "30" },
  { value: "45", label: "45" },
  { value: "60", label: "60" },
];

export function RefereeSyncScheduleConfig() {
  const t = useTranslations();
  const { schedule, mutate: scheduleMutate } = useRefereeSyncSchedule();
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [interval, setInterval] = useState(
    String(schedule?.intervalMinutes ?? 30),
  );
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">("idle");

  const hasChanges =
    enabled !== (schedule?.enabled ?? true) ||
    interval !== String(schedule?.intervalMinutes ?? 30);

  async function handleSave() {
    try {
      setSaving(true);
      setSaveState("idle");

      const updated = await fetchAPI<SyncScheduleData>(
        "/admin/sync/schedule",
        {
          method: "PUT",
          body: JSON.stringify({
            syncType: "referee-games",
            enabled,
            intervalMinutes: parseInt(interval, 10),
          }),
        },
      );

      await scheduleMutate(updated, { revalidate: false });
      setSaveState("success");
      toast.success(t("sync.schedule.toast.updated"));
    } catch {
      setSaveState("error");
      toast.error(t("sync.schedule.toast.updateFailed"));
    } finally {
      setSaving(false);
      setTimeout(() => setSaveState("idle"), 2000);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sync.refereeSchedule.title")}</CardTitle>
        <CardDescription>
          {t("sync.refereeSchedule.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="referee-schedule-enabled">
              {t("sync.schedule.enabledLabel")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("sync.refereeSchedule.intervalDescription")}
            </p>
          </div>
          <Switch
            id="referee-schedule-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Interval */}
        <div className="space-y-2">
          <Label>{t("sync.refereeSchedule.intervalLabel")}</Label>
          <Select value={interval} onValueChange={setInterval} disabled={!enabled}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t("sync.refereeSchedule.everyNMinutes", { minutes: opt.label })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : saveState === "success" ? (
              <Check className="mr-2 h-4 w-4" />
            ) : saveState === "error" ? (
              <AlertCircle className="mr-2 h-4 w-4" />
            ) : null}
            {saving
              ? t("common.saving")
              : saveState === "success"
                ? t("common.saved")
                : saveState === "error"
                  ? t("common.failed")
                  : t("common.saveChanges")}
          </Button>
          {hasChanges && (
            <span className="text-sm text-yellow-600">{t("common.unsavedChanges")}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Add schedule config to `referee-sync-tab.tsx`**

In `apps/web/src/components/admin/sync/referee-sync-tab.tsx`, add the import at the top:

```typescript
import { RefereeSyncScheduleConfig } from "./referee-sync-schedule-config";
```

Then add the component inside the `<div className="space-y-6">` block, after `<RefereeSyncHistoryTable />`:

```tsx
        <RefereeSyncScheduleConfig />
```

- [ ] **Step 5: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 6: Start dev server and verify in browser**

Run: `pnpm dev`

Navigate to the admin sync page's referee tab. Verify:
1. Four status cards display (Current Status, Last Sync, Next Sync, Schedule)
2. Next Sync shows a countdown (e.g., "in 23m") or "starting soon"
3. Schedule card shows "Enabled" with "Every 30 min"
4. Schedule config card appears with enable/disable toggle and interval dropdown
5. Changing interval and saving updates the cards
6. Disabling schedule shows "Disabled" in both Next Sync and Schedule cards

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/admin/sync/referee-sync-schedule-config.tsx apps/web/src/components/admin/sync/referee-sync-tab.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): add referee sync schedule config UI with interval picker"
```

---

### Task 8: Tests — sync-admin service and queues

**Files:**
- Modify or create: `apps/api/src/services/admin/sync-admin.service.test.ts`
- Modify or create: `apps/api/src/workers/queues.test.ts`

- [ ] **Step 1: Check if test files exist**

Run: `ls apps/api/src/services/admin/sync-admin.service.test.ts apps/api/src/workers/queues.test.ts 2>/dev/null`

If they don't exist, create them. If they do, add tests to the existing files.

- [ ] **Step 2: Test `getSchedule` returns correct defaults by syncType**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: () => ({ from: mockFrom }),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  syncSchedule: { id: "id", syncType: "sync_type", enabled: "enabled" },
}));

vi.mock("../../workers/queues", () => ({
  updateSyncSchedule: vi.fn(),
  updateRefereeSyncSchedule: vi.fn(),
}));

describe("getSchedule", () => {
  it("returns full sync defaults when no row exists", async () => {
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);

    const { getSchedule } = await import("./sync-admin.service");
    const result = await getSchedule("full");

    expect(result).toMatchObject({
      syncType: "full",
      cronExpression: "0 4 * * *",
      intervalMinutes: null,
    });
  });

  it("returns referee-games defaults when no row exists", async () => {
    mockLimit.mockResolvedValue([]);

    const { getSchedule } = await import("./sync-admin.service");
    const result = await getSchedule("referee-games");

    expect(result).toMatchObject({
      syncType: "referee-games",
      cronExpression: null,
      intervalMinutes: 30,
    });
  });
});
```

Adapt mocking patterns to match the project's existing test conventions (check `apps/api/src/services/sync/referee-games.sync.test.ts` for patterns).

- [ ] **Step 3: Test `updateRefereeSyncSchedule` removes old jobs and adds new one**

```typescript
describe("updateRefereeSyncSchedule", () => {
  it("removes existing referee jobs and adds new repeatable job", async () => {
    const mockGetRepeatableJobs = vi.fn().mockResolvedValue([
      { name: "referee-games-sync-scheduled", key: "ref-key-1" },
      { name: "daily-sync", key: "daily-key-1" },
    ]);
    const mockRemoveRepeatableByKey = vi.fn();
    const mockAdd = vi.fn();

    // ... mock syncQueue with these methods

    const { updateRefereeSyncSchedule } = await import("./queues");
    await updateRefereeSyncSchedule(true, 15);

    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith("ref-key-1");
    expect(mockRemoveRepeatableByKey).not.toHaveBeenCalledWith("daily-key-1");
    expect(mockAdd).toHaveBeenCalledWith(
      "referee-games-sync-scheduled",
      { type: "referee-games" },
      expect.objectContaining({
        repeat: { every: 15 * 60 * 1000 },
      }),
    );
  });

  it("only removes jobs when disabled", async () => {
    // ... similar setup
    await updateRefereeSyncSchedule(false, 30);
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test`
Expected: PASS

- [ ] **Step 5: Run coverage**

Run: `pnpm --filter @dragons/api coverage`
Expected: Coverage thresholds met.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/admin/sync-admin.service.test.ts apps/api/src/workers/queues.test.ts
git commit -m "test: add tests for syncType-aware schedule service and queue updates"
```

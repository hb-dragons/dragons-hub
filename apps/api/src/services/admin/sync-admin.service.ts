import { db } from "../../config/database";
import { syncRuns, syncRunEntries, syncSchedule, matches, matchRemoteVersions, matchChanges, user } from "@dragons/db/schema";
import { desc, eq, sql, and, or, ilike, inArray } from "drizzle-orm";
import { updateSyncSchedule, updateRefereeSyncSchedule } from "../../workers/queues";
import { escapeLikePattern } from "../utils/sql";
import type { EntityType, EntryAction } from "@dragons/shared";

export interface SyncLogsQuery {
  limit: number;
  offset: number;
  status?: "running" | "completed" | "failed";
  syncType?: string;
}

export interface SyncEntriesQuery {
  limit: number;
  offset: number;
  entityType?: EntityType;
  action?: EntryAction;
  search?: string;
}

export interface UpdateScheduleBody {
  syncType?: string;
  enabled?: boolean;
  cronExpression?: string | null;
  intervalMinutes?: number;
  timezone?: string;
  updatedBy?: string;
}

/**
 * Resolve triggeredBy user IDs to display names.
 * Values like "cron" or "manual" pass through as-is.
 */
async function resolveTriggeredByNames(
  runs: (typeof syncRuns.$inferSelect)[],
): Promise<Map<string, string>> {
  const userIds = [...new Set(
    runs.map((r) => r.triggeredBy).filter((v) => v !== "cron" && v !== "manual"),
  )];
  if (userIds.length === 0) return new Map();

  const users = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, userIds));

  return new Map(users.map((u) => [u.id, u.name]));
}

function addTriggeredByName(
  run: typeof syncRuns.$inferSelect,
  nameMap: Map<string, string>,
) {
  return {
    ...run,
    triggeredByName: nameMap.get(run.triggeredBy) ?? null,
  };
}

export async function getSyncStatus(syncType?: string) {
  const [lastSync] = await db
    .select()
    .from(syncRuns)
    .where(syncType ? eq(syncRuns.syncType, syncType) : undefined)
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  const [runningSync] = await db
    .select()
    .from(syncRuns)
    .where(
      syncType
        ? and(eq(syncRuns.status, "running"), eq(syncRuns.syncType, syncType))
        : eq(syncRuns.status, "running"),
    )
    .limit(1);

  const runs = [lastSync, runningSync].filter(Boolean) as (typeof syncRuns.$inferSelect)[];
  const nameMap = await resolveTriggeredByNames(runs);

  return {
    lastSync: lastSync ? addTriggeredByName(lastSync, nameMap) : null,
    isRunning: !!runningSync,
  };
}

export async function getSyncLogs(params: SyncLogsQuery) {
  const { limit, offset, status, syncType } = params;

  let query = db.select().from(syncRuns).$dynamic();
  let countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(syncRuns)
    .$dynamic();

  const conditions = [];
  if (status) {
    conditions.push(eq(syncRuns.status, status));
  }
  if (syncType) {
    conditions.push(eq(syncRuns.syncType, syncType));
  }
  if (conditions.length > 0) {
    const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions)!;
    query = query.where(whereClause);
    countQuery = countQuery.where(whereClause);
  }

  const [logs, countResult] = await Promise.all([
    query.orderBy(desc(syncRuns.startedAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  const total = countResult[0]?.count ?? 0;
  const nameMap = await resolveTriggeredByNames(logs);

  return {
    items: logs.map((r) => addTriggeredByName(r, nameMap)),
    total,
    limit,
    offset,
    hasMore: offset + logs.length < total,
  };
}

export async function getSyncRun(id: number) {
  const [syncRun] = await db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.id, id))
    .limit(1);

  return syncRun || null;
}

export async function getSyncRunEntries(syncRunId: number, params: SyncEntriesQuery) {
  const { limit, offset, entityType, action, search } = params;

  const conditions = [eq(syncRunEntries.syncRunId, syncRunId)];

  if (entityType) {
    conditions.push(eq(syncRunEntries.entityType, entityType));
  }

  if (action) {
    conditions.push(eq(syncRunEntries.action, action));
  }

  if (search) {
    const words = search.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const pattern = `%${escapeLikePattern(word)}%`;
      conditions.push(
        or(
          ilike(syncRunEntries.entityName, pattern),
          ilike(syncRunEntries.entityId, pattern),
        )!,
      );
    }
  }

  const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  const [entries, countResult] = await Promise.all([
    db
      .select()
      .from(syncRunEntries)
      .where(whereClause)
      .orderBy(desc(syncRunEntries.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(syncRunEntries)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const summaryCounts = await db
    .select({
      action: syncRunEntries.action,
      count: sql<number>`count(*)::int`,
    })
    .from(syncRunEntries)
    .where(eq(syncRunEntries.syncRunId, syncRunId))
    .groupBy(syncRunEntries.action);

  const summary = {
    created: summaryCounts.find((s) => s.action === "created")?.count ?? 0,
    updated: summaryCounts.find((s) => s.action === "updated")?.count ?? 0,
    skipped: summaryCounts.find((s) => s.action === "skipped")?.count ?? 0,
    failed: summaryCounts.find((s) => s.action === "failed")?.count ?? 0,
  };

  return {
    items: entries,
    total,
    limit,
    offset,
    hasMore: offset + entries.length < total,
    summary,
  };
}

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

export async function getMatchChangesForEntry(syncRunId: number, apiMatchId: number) {
  const [match] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.apiMatchId, apiMatchId))
    .limit(1);

  if (!match) return null;

  const [version] = await db
    .select({ versionNumber: matchRemoteVersions.versionNumber })
    .from(matchRemoteVersions)
    .where(
      and(
        eq(matchRemoteVersions.matchId, match.id),
        eq(matchRemoteVersions.syncRunId, syncRunId),
      ),
    )
    .limit(1);

  if (!version) return null;

  const changes = await db
    .select({
      fieldName: matchChanges.fieldName,
      oldValue: matchChanges.oldValue,
      newValue: matchChanges.newValue,
    })
    .from(matchChanges)
    .where(
      and(
        eq(matchChanges.matchId, match.id),
        eq(matchChanges.versionNumber, version.versionNumber),
        eq(matchChanges.track, "remote"),
      ),
    );

  return { changes };
}

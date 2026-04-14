import { db } from "../../config/database";
import { syncRuns, syncRunEntries, syncSchedule, matches, matchRemoteVersions, matchChanges, user } from "@dragons/db/schema";
import { desc, eq, sql, and, or, ilike, inArray } from "drizzle-orm";
import { updateSyncSchedule } from "../../workers/queues";
import type { SyncLogsQuery, SyncEntriesQuery, UpdateScheduleBody } from "../../routes/admin/sync.schemas";

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

export async function getSyncStatus() {
  const [lastSync] = await db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  const [runningSync] = await db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.status, "running"))
    .limit(1);

  const runs = [lastSync, runningSync].filter(Boolean) as (typeof syncRuns.$inferSelect)[];
  const nameMap = await resolveTriggeredByNames(runs);

  return {
    lastSync: lastSync ? addTriggeredByName(lastSync, nameMap) : null,
    isRunning: !!runningSync,
  };
}

export async function getSyncLogs(params: SyncLogsQuery) {
  const { limit, offset, status } = params;

  let query = db.select().from(syncRuns).$dynamic();
  let countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(syncRuns)
    .$dynamic();

  if (status) {
    query = query.where(eq(syncRuns.status, status));
    countQuery = countQuery.where(eq(syncRuns.status, status));
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
      const pattern = `%${word}%`;
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

export async function getSchedule() {
  const [schedule] = await db.select().from(syncSchedule).limit(1);

  if (!schedule) {
    return {
      id: null,
      enabled: true,
      cronExpression: "0 4 * * *",
      timezone: "Europe/Berlin",
      lastUpdatedAt: null,
      lastUpdatedBy: null,
    };
  }

  return schedule;
}

export async function upsertSchedule(data: UpdateScheduleBody) {
  const [existingSchedule] = await db.select().from(syncSchedule).limit(1);

  let schedule;
  if (existingSchedule) {
    [schedule] = await db
      .update(syncSchedule)
      .set({
        enabled: data.enabled ?? existingSchedule.enabled,
        cronExpression: data.cronExpression ?? existingSchedule.cronExpression,
        timezone: data.timezone ?? existingSchedule.timezone,
        lastUpdatedAt: new Date(),
        lastUpdatedBy: data.updatedBy ?? null,
      })
      .where(eq(syncSchedule.id, existingSchedule.id))
      .returning();
  } else {
    [schedule] = await db
      .insert(syncSchedule)
      .values({
        enabled: data.enabled ?? true,
        cronExpression: data.cronExpression ?? "0 4 * * *",
        timezone: data.timezone ?? "Europe/Berlin",
        lastUpdatedAt: new Date(),
        lastUpdatedBy: data.updatedBy ?? null,
      })
      .returning();
  }

  if (schedule) {
    await updateSyncSchedule(schedule.enabled, schedule.cronExpression, schedule.timezone);
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

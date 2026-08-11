/**
 * Sync job orchestration: what gets enqueued, when, and under which lock.
 *
 * Queue *configuration* (the BullMQ `Queue` instances and their defaults) stays
 * in `workers/queues.ts`; this module owns the behaviour layered on top —
 * `sync_runs` bookkeeping, the Redis trigger locks, and the repeatable-job
 * schedules read from `sync_schedule`.
 */
import { eq } from "drizzle-orm";
import { syncRuns, syncSchedule } from "@dragons/db/schema";
import { getDb } from "../config/database";
import { getRedis } from "../config/redis";
import { logger } from "../config/logger";
import { captureTrace } from "../config/log-context";
import {
  clearRepeatables,
  outboxPollQueue,
  pushReceiptQueue,
  syncQueue,
  taskRemindersQueue,
} from "../workers/queues";
import { SyncAlreadyQueuedError, SyncJobNotFailedError } from "./sync-jobs.errors";

interface SyncJobPayload {
  type: "full" | "referee-games";
  triggeredBy?: string;
  syncRunId?: number;
}

const DAILY_SYNC_JOB = "daily-sync";
const REFEREE_SCHEDULED_JOB = "referee-games-sync-scheduled";
const MANUAL_SYNC_JOB_ID = "manual-sync";
const DEFAULT_REFEREE_INTERVAL_MINUTES = 30;

/**
 * Enqueue a sync job, stamping the enqueuing request's trace onto the job data
 * so the worker can re-establish it (CC6). Cron-scheduled enqueues have no trace
 * and just pass the payload through unchanged.
 */
function addSyncJob(
  name: string,
  data: SyncJobPayload,
  opts?: Parameters<typeof syncQueue.add>[2],
): ReturnType<typeof syncQueue.add> {
  const trace = captureTrace();
  return syncQueue.add(name, trace ? { ...data, trace } : data, opts);
}

// Short-lived Redis lock that serializes the check-then-insert critical section
// of the manual sync triggers. The check-and-enqueue is sub-second; the TTL is a
// crash safety net (a trigger that dies mid-section self-heals). Acquired before
// the queue-state guards so two concurrent triggers can't both pass the guard and
// each write a sync_runs row.
const SYNC_LOCK_TTL_SECONDS = 30;

async function acquireSyncLock(key: string): Promise<boolean> {
  const acquired = await getRedis().set(key, "1", "EX", SYNC_LOCK_TTL_SECONDS, "NX");
  return acquired === "OK";
}

async function releaseSyncLock(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch (err) {
    logger.warn({ err, key }, "Failed to release sync lock (will expire via TTL)");
  }
}

export async function triggerRefereeGamesSync(
  triggeredBy?: string,
): Promise<{ syncRunId: number; status: string } | null> {
  const lockKey = "lock:sync:referee-games";
  if (!(await acquireSyncLock(lockKey))) {
    logger.info("Referee games sync trigger lost the lock race, skipping");
    return null;
  }
  try {
    const activeJobs = await syncQueue.getJobs(["active", "waiting"], 0, 100, false);
    const hasPending = activeJobs.some((job) => job.data?.type === "referee-games");
    if (hasPending) {
      logger.info("Referee games sync already queued, skipping");
      return null;
    }

    const [syncRun] = await getDb()
      .insert(syncRuns)
      .values({
        syncType: "referee-games",
        triggeredBy: triggeredBy ?? "manual",
        status: "pending",
        startedAt: new Date(),
      })
      .returning();

    await addSyncJob(
      "referee-games-sync",
      { type: "referee-games", syncRunId: syncRun!.id },
      {
        jobId: `referee-games-sync-${syncRun!.id}`,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    return { syncRunId: syncRun!.id, status: "queued" };
  } finally {
    await releaseSyncLock(lockKey);
  }
}

// NOTE: syncRuns and syncRunEntries tables grow unbounded.
// Consider adding a periodic cleanup job or retention policy for old sync data.

export async function initializeScheduledJobs() {
  // Remove existing scheduled jobs to avoid duplicates
  await clearRepeatables(syncQueue);

  // Read schedule from DB (preserves custom schedules across restarts)
  let cronExpression = "0 4 * * *";
  let timezone = "Europe/Berlin";
  let enabled = true;

  try {
    const [schedule] = await getDb()
      .select()
      .from(syncSchedule)
      .where(eq(syncSchedule.syncType, "full"))
      .limit(1);
    if (schedule) {
      cronExpression = schedule.cronExpression ?? cronExpression;
      timezone = schedule.timezone;
      enabled = schedule.enabled;
    }
  } catch {
    logger.warn("Could not read schedule from DB, using defaults");
  }

  if (enabled) {
    await addSyncJob(
      DAILY_SYNC_JOB,
      { type: "full" },
      {
        repeat: {
          pattern: cronExpression,
          tz: timezone,
        },
      },
    );
    logger.info({ cronExpression, timezone }, "Scheduled jobs initialized");
  } else {
    logger.info("Sync schedule is disabled");
  }

  // Referee games sync — interval-based
  try {
    const [refereeSchedule] = await getDb()
      .select()
      .from(syncSchedule)
      .where(eq(syncSchedule.syncType, "referee-games"))
      .limit(1);

    const refInterval = refereeSchedule?.intervalMinutes ?? DEFAULT_REFEREE_INTERVAL_MINUTES;
    const refEnabled = refereeSchedule?.enabled ?? true;

    if (refEnabled) {
      await addRefereeRepeatable(refInterval);
      logger.info({ intervalMinutes: refInterval }, "Referee games sync scheduled");
    } else {
      logger.info("Referee games sync schedule is disabled");
    }
  } catch {
    logger.warn("Could not read referee schedule from DB, using 30-min default");
    await addRefereeRepeatable(DEFAULT_REFEREE_INTERVAL_MINUTES);
  }

  // Push receipt reconcile — every 15 minutes
  await clearRepeatables(pushReceiptQueue);
  await pushReceiptQueue.add(
    "reconcile",
    {},
    {
      jobId: "push-receipt-reconcile-cron",
      repeat: { every: 15 * 60 * 1000 },
    },
  );
  logger.info("Push receipt reconcile scheduled (every 15m)");

  // Outbox poller — every 30 seconds
  await clearRepeatables(outboxPollQueue);
  await outboxPollQueue.add(
    "poll",
    {},
    { jobId: "outbox-poll-cron", repeat: { every: 30_000 }, removeOnComplete: true, removeOnFail: 100 },
  );
  logger.info("Outbox poll scheduled (every 30s)");
}

function addRefereeRepeatable(intervalMinutes: number): ReturnType<typeof addSyncJob> {
  return addSyncJob(
    REFEREE_SCHEDULED_JOB,
    { type: "referee-games" },
    {
      repeat: { every: intervalMinutes * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

/**
 * Queue a manual full sync.
 *
 * Throws {@link SyncAlreadyQueuedError} when one is already active, waiting or
 * delayed — the central error handler turns that into a 409, so callers get a
 * single success shape back and never inspect an error envelope.
 */
export async function triggerManualSync(userId?: string) {
  const lockKey = "lock:sync:full";
  if (!(await acquireSyncLock(lockKey))) {
    throw new SyncAlreadyQueuedError();
  }
  try {
    const existing = await syncQueue.getJob(MANUAL_SYNC_JOB_ID);
    if (existing) {
      const state = await existing.getState();
      if (state === "active" || state === "waiting" || state === "delayed") {
        throw new SyncAlreadyQueuedError();
      }
      await existing.remove();
    }

    const dailyActive = await syncQueue.getJobs(["active", "waiting"], 0, 100, false);
    if (dailyActive.some((j) => j.name === DAILY_SYNC_JOB && j.data?.type === "full")) {
      throw new SyncAlreadyQueuedError();
    }

    const [syncRun] = await getDb()
      .insert(syncRuns)
      .values({ syncType: "full", triggeredBy: userId ?? "manual", status: "pending", startedAt: new Date() })
      .returning();

    const job = await addSyncJob(
      MANUAL_SYNC_JOB_ID,
      { type: "full", triggeredBy: userId, syncRunId: syncRun!.id },
      { jobId: MANUAL_SYNC_JOB_ID },
    );

    return {
      jobId: job.id,
      syncRunId: syncRun!.id,
      status: "queued",
      message: "Sync job has been queued",
    };
  } finally {
    await releaseSyncLock(lockKey);
  }
}

export async function getJobStatus(jobId: string) {
  const job = await syncQueue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  const progress = job.progress;

  return {
    jobId: job.id,
    state,
    progress,
    result: job.returnvalue,
    error: job.failedReason,
  };
}

/**
 * Retry a failed queue job.
 *
 * Returns `null` when no such job exists (the route renders that as a 404, the
 * same shape {@link getJobStatus} gets). Throws {@link SyncJobNotFailedError}
 * for a job in any other state — "only a failed job may be retried" is a rule
 * about sync jobs, not about HTTP, so it lives here and carries its own 400 to
 * the central error handler.
 */
export async function retrySyncJob(jobId: string): Promise<{ status: "retried" } | null> {
  const job = await syncQueue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  if (state !== "failed") {
    throw new SyncJobNotFailedError(state);
  }

  await job.retry();
  return { status: "retried" };
}

export async function updateSyncSchedule(
  enabled: boolean,
  cronExpression: string,
  timezone: string,
) {
  await clearRepeatables(syncQueue, DAILY_SYNC_JOB);

  if (enabled) {
    await addSyncJob(
      DAILY_SYNC_JOB,
      { type: "full" },
      {
        repeat: {
          pattern: cronExpression,
          tz: timezone,
        },
      },
    );
    logger.info({ cronExpression, timezone }, "Sync schedule updated");
  } else {
    logger.info("Sync schedule disabled");
  }
}

export async function updateRefereeSyncSchedule(
  enabled: boolean,
  intervalMinutes: number,
) {
  await clearRepeatables(syncQueue, REFEREE_SCHEDULED_JOB);

  if (enabled) {
    await addRefereeRepeatable(intervalMinutes);
    logger.info({ intervalMinutes }, "Referee sync schedule updated");
  } else {
    logger.info("Referee sync schedule disabled");
  }
}

export async function initTaskReminders(): Promise<void> {
  await clearRepeatables(taskRemindersQueue);
  await taskRemindersQueue.add(
    "sweep",
    {},
    {
      jobId: "task-reminder-sweep-cron",
      repeat: { every: 15 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  logger.info("Task reminder sweep scheduled (every 15m)");
}

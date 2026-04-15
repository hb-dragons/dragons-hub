import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { db } from "../config/database";
import { syncSchedule, syncRuns } from "@dragons/db/schema";

export const domainEventsQueue = new Queue("domain-events", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 1, // events are idempotent; outbox poller handles retries
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const digestQueue = new Queue("digest", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export const syncQueue = new Queue("sync", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// NOTE: syncRuns and syncRunEntries tables grow unbounded.
// Consider adding a periodic cleanup job or retention policy for old sync data.

export async function initializeScheduledJobs() {
  // Remove existing scheduled jobs to avoid duplicates
  const repeatableJobs = await syncQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await syncQueue.removeRepeatableByKey(job.key);
  }

  // Read schedule from DB (preserves custom schedules across restarts)
  let cronExpression = "0 4 * * *";
  let timezone = "Europe/Berlin";
  let enabled = true;

  try {
    const [schedule] = await db
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
    await syncQueue.add(
      "daily-sync",
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
}

export async function triggerManualSync(userId?: string) {
  // Prevent duplicate sync jobs
  const activeJobs = await syncQueue.getJobs(["active", "waiting"], 0, 100, false);
  const hasPendingSync = activeJobs.some(
    (job) => job.name === "manual-sync" || (job.name === "daily-sync" && job.data?.type === "full"),
  );

  if (hasPendingSync) {
    return {
      error: "Sync already in progress or queued",
      code: "SYNC_ALREADY_QUEUED",
    };
  }

  const [syncRun] = await db
    .insert(syncRuns)
    .values({ syncType: "full", triggeredBy: userId ?? "manual", status: "pending", startedAt: new Date() })
    .returning();

  const job = await syncQueue.add("manual-sync", {
    type: "full",
    triggeredBy: userId,
    syncRunId: syncRun!.id,
  });

  return {
    jobId: job.id,
    syncRunId: syncRun!.id,
    status: "queued",
    message: "Sync job has been queued",
  };
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

export async function updateSyncSchedule(
  enabled: boolean,
  cronExpression: string,
  timezone: string,
) {
  // Remove existing scheduled jobs
  const repeatableJobs = await syncQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "daily-sync") {
      await syncQueue.removeRepeatableByKey(job.key);
    }
  }

  if (enabled) {
    await syncQueue.add(
      "daily-sync",
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

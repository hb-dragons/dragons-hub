import { Queue } from "bullmq";
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

export const refereeRemindersQueue = new Queue("referee-reminders", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
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
    const [schedule] = await db.select().from(syncSchedule).limit(1);
    if (schedule) {
      cronExpression = schedule.cronExpression;
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

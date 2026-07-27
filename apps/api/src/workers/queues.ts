/**
 * BullMQ queue configuration.
 *
 * This module declares the queues and their defaults, nothing else. Anything
 * that decides *what* to enqueue — `sync_runs` bookkeeping, trigger locks,
 * repeatable schedules read from the database — lives in
 * `services/sync-jobs.service.ts`.
 */
import { Queue } from "bullmq";
import { env } from "../config/env";

export const domainEventsQueue = new Queue("domain-events", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    // Retry transient processing failures fast (downstream notification_log /
    // digest_buffer unique constraints make re-delivery idempotent). If all
    // attempts are exhausted the event keeps processed_at = NULL, so the outbox
    // poller reclaims it after the lease and retries again — at-least-once.
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
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

export const pushReceiptQueue = new Queue("push-receipt", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 1, // reconcile is idempotent; next cycle retries naturally
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

export const taskRemindersQueue = new Queue("task-reminders", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
});

export const outboxPollQueue = new Queue("outbox-poll", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
  defaultJobOptions: { removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } },
});

/**
 * Drop repeatable jobs from a queue before re-registering them, so a restart or
 * a schedule edit cannot leave two cron entries running side by side.
 *
 * Pass `jobName` to clear only that schedule; omit it to clear the whole queue.
 */
export async function clearRepeatables(queue: Queue, jobName?: string): Promise<void> {
  const repeatables = await queue.getRepeatableJobs();
  for (const job of repeatables) {
    if (jobName === undefined || job.name === jobName) {
      await queue.removeRepeatableByKey(job.key);
    }
  }
}

// Re-exported for `services/admin/sync-admin.service.ts`, which drives the
// schedule from the admin UI and imports both through this path. The
// implementations moved to the sync-jobs service.
export { updateSyncSchedule, updateRefereeSyncSchedule } from "../services/sync-jobs.service";

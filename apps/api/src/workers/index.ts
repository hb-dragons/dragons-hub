import { syncWorker } from "./sync.worker";
import { eventWorker } from "./event.worker";
import { digestWorker } from "./digest.worker";
import { refereeReminderWorker } from "./referee-reminder.worker";
import { pushReceiptWorker } from "./push-receipt.worker";
import { taskReminderWorker } from "./task-reminder.worker";
import { outboxPollWorker } from "./outbox-poll.worker";
import { initializeScheduledJobs, initTaskReminders, triggerRefereeGamesSync, syncQueue, digestQueue, domainEventsQueue, refereeRemindersQueue, pushReceiptQueue, taskRemindersQueue, outboxPollQueue } from "./queues";
import { seedRefereeNotificationConfig } from "../services/notifications/seed-referee-watch-rule";
import { getDb } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  syncRuns,
  syncRunEntries,
  domainEvents,
  notificationLog,
  digestBuffer,
  channelConfigs,
} from "@dragons/db/schema";
import { eq, lt, and, inArray } from "drizzle-orm";
import { startHeartbeat, stopHeartbeat, isInstanceAlive, INSTANCE_ID } from "./instance-heartbeat";

export async function initializeWorkers() {
  logger.info("Initializing workers...");

  // Write this instance's heartbeat before probing others, so our own runs
  // are protected if another instance starts up at the same time.
  startHeartbeat();

  // Reclaim "running" sync runs whose owner instance is no longer alive.
  // Runs owned by a live instance (rolling deploy) are left untouched.
  const candidateRuns = await getDb()
    .select({ id: syncRuns.id, ownerInstanceId: syncRuns.ownerInstanceId })
    .from(syncRuns)
    .where(eq(syncRuns.status, "running"));

  const deadRunIds: number[] = [];
  for (const run of candidateRuns) {
    const alive = await isInstanceAlive(run.ownerInstanceId);
    if (!alive) {
      deadRunIds.push(run.id);
    }
  }

  if (deadRunIds.length > 0) {
    await getDb()
      .update(syncRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: "Stale: worker restarted",
      })
      .where(inArray(syncRuns.id, deadRunIds));

    logger.warn(
      { count: deadRunIds.length, ids: deadRunIds },
      "Marked stale running sync runs as failed",
    );
  }

  try {
    const cleaned = await cleanupOldSyncRuns(env.SYNC_RUN_RETENTION_DAYS);
    if (cleaned > 0) {
      logger.info({ count: cleaned }, "Cleaned up old sync runs");
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to cleanup old sync runs");
  }

  try {
    const cleaned = await cleanupOldDomainEvents(env.DOMAIN_EVENT_RETENTION_DAYS);
    if (cleaned.events > 0) {
      logger.info(cleaned, "Cleaned up old domain events");
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to cleanup old domain events");
  }

  await initializeScheduledJobs();

  // Task reminder sweep — every 15 minutes
  try {
    await initTaskReminders();
  } catch (error) {
    logger.warn({ err: error }, "Failed to initialize task reminders");
  }

  // Initialize scheduled digest jobs for channels with digestMode = "scheduled"
  try {
    await initializeScheduledDigests();
  } catch (error) {
    logger.warn({ err: error }, "Failed to initialize scheduled digests");
  }

  // Seed referee notification channel config + watch rule (idempotent)
  try {
    await seedRefereeNotificationConfig();
  } catch (error) {
    logger.warn({ err: error }, "Failed to seed referee notification config");
  }

  // Trigger referee games sync after main sync completes. Enqueue via the queue
  // (not a direct in-process call) so the run is tracked with a syncRunId, shows
  // in admin history, and is deduped against the scheduled/manual referee runs.
  syncWorker.on("completed", (job) => {
    if (job?.data?.type !== "referee-games") {
      void (async () => {
        try {
          await triggerRefereeGamesSync("post-full-sync");
        } catch (error) {
          logger.warn({ err: error }, "Failed to enqueue referee games sync after main sync");
        }
      })();
    }
  });

  // Workers are automatically started when imported
  logger.info("Sync worker started");
  logger.info("Event worker started");
  logger.info("Digest worker started");
  logger.info("Referee reminder worker started");
  logger.info("Push receipt worker started");
  logger.info("Task reminder worker started");
  logger.info("Outbox poll worker started");
  logger.info("Workers initialized");
}

export async function cleanupOldSyncRuns(retentionDays: number = 90): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const oldRuns = await getDb()
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(lt(syncRuns.startedAt, cutoff));

  if (oldRuns.length === 0) return 0;

  const oldRunIds = oldRuns.map((r) => r.id);

  // Delete entries first (FK dependency), then runs
  await getDb().delete(syncRunEntries).where(inArray(syncRunEntries.syncRunId, oldRunIds));
  await getDb().delete(syncRuns).where(inArray(syncRuns.id, oldRunIds));

  return oldRuns.length;
}

const CLEANUP_BATCH_SIZE = 500;

export async function cleanupOldDomainEvents(
  retentionDays: number = 365,
): Promise<{ notifications: number; digestEntries: number; events: number }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  let totalNotifications = 0;
  let totalDigestEntries = 0;
  let totalEvents = 0;

  // Process in batches to avoid loading thousands of IDs into memory
  while (true) {
    const batch = await getDb()
      .select({ id: domainEvents.id })
      .from(domainEvents)
      .where(lt(domainEvents.occurredAt, cutoff))
      .limit(CLEANUP_BATCH_SIZE);

    if (batch.length === 0) break;

    const ids = batch.map((e) => e.id);

    // Delete FK-dependent rows first, then the events
    const deletedNotifications = await getDb()
      .delete(notificationLog)
      .where(inArray(notificationLog.eventId, ids))
      .returning({ id: notificationLog.id });

    const deletedDigest = await getDb()
      .delete(digestBuffer)
      .where(inArray(digestBuffer.eventId, ids))
      .returning({ id: digestBuffer.id });

    await getDb().delete(domainEvents).where(inArray(domainEvents.id, ids));

    totalNotifications += deletedNotifications.length;
    totalDigestEntries += deletedDigest.length;
    totalEvents += batch.length;

    // If we got fewer than batch size, we're done
    if (batch.length < CLEANUP_BATCH_SIZE) break;
  }

  return {
    notifications: totalNotifications,
    digestEntries: totalDigestEntries,
    events: totalEvents,
  };
}

/**
 * Set up BullMQ repeatable jobs for channel configs with digestMode = "scheduled".
 * Removes stale repeatable digest jobs first, then creates one per scheduled channel.
 */
export async function initializeScheduledDigests(): Promise<void> {
  // Remove existing repeatable digest jobs to avoid duplicates
  const repeatableJobs = await digestQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await digestQueue.removeRepeatableByKey(job.key);
  }

  const scheduledChannels = await getDb()
    .select()
    .from(channelConfigs)
    .where(
      and(
        eq(channelConfigs.enabled, true),
        eq(channelConfigs.digestMode, "scheduled"),
      ),
    );

  for (const channel of scheduledChannels) {
    if (!channel.digestCron) {
      logger.warn(
        { channelConfigId: channel.id },
        "Channel has digestMode=scheduled but no digestCron, skipping",
      );
      continue;
    }

    await digestQueue.add(
      `scheduled-digest:${channel.id}`,
      {
        channelConfigId: channel.id,
        digestRunId: Date.now(),
      },
      {
        repeat: {
          pattern: channel.digestCron,
          tz: channel.digestTimezone,
        },
      },
    );

    logger.info(
      {
        channelConfigId: channel.id,
        cron: channel.digestCron,
        timezone: channel.digestTimezone,
      },
      "Scheduled digest job initialized",
    );
  }

  if (scheduledChannels.length > 0) {
    logger.info(
      { count: scheduledChannels.length },
      "Scheduled digest jobs initialized",
    );
  }
}

export async function shutdownWorkers() {
  logger.info("Shutting down workers...");

  stopHeartbeat();

  try {
    // Mark only this instance's running sync runs as failed
    await getDb()
      .update(syncRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: "Server shutdown",
      })
      .where(and(eq(syncRuns.status, "running"), eq(syncRuns.ownerInstanceId, INSTANCE_ID)));
  } catch (error) {
    logger.error({ err: error }, "Failed to mark running syncs as failed");
  }

  await outboxPollWorker.close();
  await outboxPollQueue.close();
  await refereeReminderWorker.close();
  await refereeRemindersQueue.close();
  await pushReceiptWorker.close();
  await pushReceiptQueue.close();
  await taskReminderWorker.close();
  await taskRemindersQueue.close();
  await digestWorker.close();
  await eventWorker.close();
  await syncWorker.close();
  await domainEventsQueue.close();
  await digestQueue.close();
  await syncQueue.close();

  logger.info("Worker shutdown complete");
}

export { syncWorker };
export { eventWorker };
export { digestWorker };
export { refereeReminderWorker };
export { pushReceiptWorker };
export { taskReminderWorker };
export { outboxPollWorker };
export * from "./queues";

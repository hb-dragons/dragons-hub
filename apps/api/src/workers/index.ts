import { syncWorker } from "./sync.worker";
import { eventWorker } from "./event.worker";
import { digestWorker } from "./digest.worker";
import { refereeReminderWorker } from "./referee-reminder.worker";
import { pushReceiptWorker } from "./push-receipt.worker";
import { taskReminderWorker } from "./task-reminder.worker";
import { initializeScheduledJobs, initTaskReminders, syncQueue, digestQueue, domainEventsQueue, refereeRemindersQueue, pushReceiptQueue, taskRemindersQueue } from "./queues";
import { startOutboxPoller, stopOutboxPoller } from "../services/events/outbox-poller";
import { seedRefereeNotificationConfig } from "../services/notifications/seed-referee-watch-rule";
import { syncRefereeGames } from "../services/sync/referee-games.sync";
import { db } from "../config/database";
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

export async function initializeWorkers() {
  logger.info("Initializing workers...");

  // Mark any stale "running" sync runs as failed (from previous crash/deploy)
  const staleRuns = await db
    .update(syncRuns)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorMessage: "Stale: worker restarted",
    })
    .where(eq(syncRuns.status, "running"))
    .returning({ id: syncRuns.id });

  if (staleRuns.length > 0) {
    logger.warn(
      { count: staleRuns.length, ids: staleRuns.map((r) => r.id) },
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

  // Start outbox poller for domain events
  startOutboxPoller();

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

  // Trigger referee games sync after main sync completes
  syncWorker.on("completed", async (job) => {
    if (job?.data?.type !== "referee-games") {
      try {
        await syncRefereeGames();
      } catch (error) {
        logger.warn({ err: error }, "Failed to run referee games sync after main sync");
      }
    }
  });

  // Workers are automatically started when imported
  logger.info("Sync worker started");
  logger.info("Event worker started");
  logger.info("Digest worker started");
  logger.info("Referee reminder worker started");
  logger.info("Push receipt worker started");
  logger.info("Task reminder worker started");
  logger.info("Workers initialized");
}

export async function cleanupOldSyncRuns(retentionDays: number = 90): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const oldRuns = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(lt(syncRuns.startedAt, cutoff));

  if (oldRuns.length === 0) return 0;

  const oldRunIds = oldRuns.map((r) => r.id);

  // Delete entries first (FK dependency), then runs
  await db.delete(syncRunEntries).where(inArray(syncRunEntries.syncRunId, oldRunIds));
  await db.delete(syncRuns).where(inArray(syncRuns.id, oldRunIds));

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
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await db
      .select({ id: domainEvents.id })
      .from(domainEvents)
      .where(lt(domainEvents.occurredAt, cutoff))
      .limit(CLEANUP_BATCH_SIZE);

    if (batch.length === 0) break;

    const ids = batch.map((e) => e.id);

    // Delete FK-dependent rows first, then the events
    const deletedNotifications = await db
      .delete(notificationLog)
      .where(inArray(notificationLog.eventId, ids))
      .returning({ id: notificationLog.id });

    const deletedDigest = await db
      .delete(digestBuffer)
      .where(inArray(digestBuffer.eventId, ids))
      .returning({ id: digestBuffer.id });

    await db.delete(domainEvents).where(inArray(domainEvents.id, ids));

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

  const scheduledChannels = await db
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

  try {
    // Mark any running sync runs as failed
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: "Server shutdown",
      })
      .where(eq(syncRuns.status, "running"));
  } catch (error) {
    logger.error({ err: error }, "Failed to mark running syncs as failed");
  }

  stopOutboxPoller();
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
export * from "./queues";

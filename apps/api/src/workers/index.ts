import { syncWorker } from "./sync.worker";
import { eventWorker } from "./event.worker";
import { digestWorker } from "./digest.worker";
import { initializeScheduledJobs, syncQueue } from "./queues";
import { startOutboxPoller, stopOutboxPoller } from "../services/events/outbox-poller";
import { db } from "../config/database";
import { logger } from "../config/logger";
import {
  syncRuns,
  syncRunEntries,
  domainEvents,
  notificationLog,
  digestBuffer,
} from "@dragons/db/schema";
import { eq, lt, inArray } from "drizzle-orm";

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

  // Cleanup old sync runs (retention policy)
  try {
    const cleaned = await cleanupOldSyncRuns();
    if (cleaned > 0) {
      logger.info({ count: cleaned }, "Cleaned up old sync runs");
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to cleanup old sync runs");
  }

  // Cleanup old domain events (1 year retention)
  try {
    const cleaned = await cleanupOldDomainEvents(365);
    if (cleaned.events > 0) {
      logger.info(cleaned, "Cleaned up old domain events");
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to cleanup old domain events");
  }

  await initializeScheduledJobs();

  // Start outbox poller for domain events
  startOutboxPoller();

  // Workers are automatically started when imported
  logger.info("Sync worker started");
  logger.info("Event worker started");
  logger.info("Digest worker started");
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

export async function cleanupOldDomainEvents(
  retentionDays: number = 365,
): Promise<{ notifications: number; digestEntries: number; events: number }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const oldEventIds = await db
    .select({ id: domainEvents.id })
    .from(domainEvents)
    .where(lt(domainEvents.occurredAt, cutoff));

  if (oldEventIds.length === 0) {
    return { notifications: 0, digestEntries: 0, events: 0 };
  }

  const ids = oldEventIds.map((e) => e.id);

  // Delete notification_log entries referencing old domain events
  const deletedNotifications = await db
    .delete(notificationLog)
    .where(inArray(notificationLog.eventId, ids))
    .returning({ id: notificationLog.id });

  // Delete digest_buffer entries referencing old domain events
  const deletedDigest = await db
    .delete(digestBuffer)
    .where(inArray(digestBuffer.eventId, ids))
    .returning({ id: digestBuffer.id });

  // Delete the domain events themselves
  await db.delete(domainEvents).where(inArray(domainEvents.id, ids));

  return {
    notifications: deletedNotifications.length,
    digestEntries: deletedDigest.length,
    events: oldEventIds.length,
  };
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
  await digestWorker.close();
  await eventWorker.close();
  await syncWorker.close();
  await syncQueue.close();

  logger.info("Worker shutdown complete");
}

export { syncWorker };
export { eventWorker };
export { digestWorker };
export * from "./queues";

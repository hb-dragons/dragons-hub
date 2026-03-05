import { syncWorker } from "./sync.worker";
import { initializeScheduledJobs, syncQueue } from "./queues";
import { db } from "../config/database";
import { logger } from "../config/logger";
import { syncRuns } from "@dragons/db/schema";
import { eq } from "drizzle-orm";

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

  await initializeScheduledJobs();

  // Workers are automatically started when imported
  logger.info("Sync worker started");
  logger.info("Workers initialized");
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

  await syncWorker.close();
  await syncQueue.close();

  logger.info("Worker shutdown complete");
}

export { syncWorker };
export * from "./queues";

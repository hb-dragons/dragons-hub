import { syncWorker } from "./sync.worker";
import { initializeScheduledJobs, syncQueue } from "./queues";
import { db } from "../config/database";
import { syncRuns } from "@dragons/db/schema";
import { eq } from "drizzle-orm";

export async function initializeWorkers() {
  console.log("[Workers] Initializing workers...");

  await initializeScheduledJobs();

  // Workers are automatically started when imported
  console.log("[Workers] Sync worker started");
  console.log("[Workers] Workers initialized");
}

export async function shutdownWorkers() {
  console.log("[Workers] Shutting down...");

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
    console.error("[Workers] Failed to mark running syncs as failed:", error);
  }

  await syncWorker.close();
  await syncQueue.close();

  console.log("[Workers] Shutdown complete");
}

export { syncWorker };
export * from "./queues";

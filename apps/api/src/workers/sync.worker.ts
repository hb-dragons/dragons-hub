import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { syncRuns } from "@dragons/db/schema";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { runWithTrace, type TraceCarrier } from "../config/log-context";
import { getDb } from "../config/database";
import { fullSync } from "../services/sync/index";
import { INSTANCE_ID } from "./instance-heartbeat";

interface SyncJobData {
  type: "full" | "leagues" | "matches" | "standings" | "referee-games";
  triggeredBy?: string;
  syncRunId?: number;
  /** Trace of the request that enqueued this job, restored below. */
  trace?: TraceCarrier;
}

export const syncWorker = new Worker<SyncJobData>(
  "sync",
  (job: Job<SyncJobData>) =>
    // Re-establish the enqueuing request's trace so job logs (and the SDK calls
    // it makes) correlate to it instead of being anonymous in the trace tree.
    runWithTrace(job.data.trace, async () => {
    const log = logger.child({ jobId: job.id });
    log.info({ jobName: job.name }, "Starting sync job");

    const triggeredBy: "cron" | "manual" =
      job.name === "daily-sync" || job.name === "referee-games-sync-scheduled"
        ? "cron"
        : "manual";

    try {
      const jobLogger = async (msg: string) => {
        await job.log(msg);
      };

      switch (job.data.type) {
        case "full": {
          const fullResult = await fullSync(triggeredBy, jobLogger, job.data.syncRunId);
          return { completed: true, type: job.data.type, result: fullResult };
        }
        case "referee-games": {
          const { syncRefereeGames } = await import("../services/sync/referee-games.sync");
          const { createSyncLogger } = await import("../services/sync/sync-logger");

          // For scheduled jobs, create a syncRun record so the UI can track history
          let syncRunId = job.data.syncRunId;
          if (!syncRunId) {
            const [created] = await getDb()
              .insert(syncRuns)
              .values({
                syncType: "referee-games",
                triggeredBy,
                status: "pending",
                startedAt: new Date(),
              })
              .returning();
            syncRunId = created!.id;
          }

          const syncLogger = createSyncLogger(syncRunId);

          await getDb()
            .update(syncRuns)
            .set({ status: "running", ownerInstanceId: INSTANCE_ID })
            .where(eq(syncRuns.id, syncRunId));

          const startTime = Date.now();
          try {
            const result = await syncRefereeGames(syncLogger, syncRunId);
            await syncLogger.close();
            await getDb()
              .update(syncRuns)
              .set({
                status: "completed",
                recordsCreated: result.created,
                recordsUpdated: result.updated,
                recordsSkipped: result.unchanged,
                recordsFailed: 0,
                durationMs: Date.now() - startTime,
                completedAt: new Date(),
              })
              .where(eq(syncRuns.id, syncRunId));
            return { completed: true, type: job.data.type, ...result };
          } catch (err) {
            await syncLogger.close();
            await getDb()
              .update(syncRuns)
              .set({
                status: "failed",
                errorMessage: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - startTime,
                completedAt: new Date(),
              })
              .where(eq(syncRuns.id, syncRunId));
            throw err;
          }
        }
        default:
          throw new Error(`Unsupported sync type: ${job.data.type}`);
      }
    } catch (error) {
      log.error({ err: error }, "Sync job failed");
      throw error;
    }
    }),
  {
    prefix: "{bull}",
    connection: { url: env.REDIS_URL },
    concurrency: 1,
  },
);

syncWorker.on("completed", (job) => {
  void (async () => {
    logger.info({ jobId: job.id }, "Sync job completed");

    if (job.data.syncRunId) {
      try {
        const [run] = await getDb()
          .select({ status: syncRuns.status })
          .from(syncRuns)
          .where(eq(syncRuns.id, job.data.syncRunId));
        if (run && run.status === "running") {
          logger.warn(
            { syncRunId: job.data.syncRunId },
            "Sync run still running after job completed, marking as completed",
          );
          await getDb()
            .update(syncRuns)
            .set({ status: "completed", completedAt: new Date() })
            .where(eq(syncRuns.id, job.data.syncRunId));
        }
      } catch (err) {
        logger.error(
          { jobId: job.id, syncRunId: job.data.syncRunId, err },
          "Failed to reconcile sync run on completion",
        );
      }
    }
  })();
});

syncWorker.on("failed", (job, err) => {
  void (async () => {
    logger.error({ jobId: job?.id, err }, "Sync job failed");

    if (job?.data.syncRunId) {
      try {
        await getDb()
          .update(syncRuns)
          .set({
            status: "failed",
            completedAt: new Date(),
            errorMessage: err.message,
          })
          .where(eq(syncRuns.id, job.data.syncRunId));
      } catch (updateErr) {
        logger.error(
          { jobId: job.id, syncRunId: job.data.syncRunId, err: updateErr },
          "Failed to mark sync run as failed",
        );
      }
    }
  })();
});

syncWorker.on("error", (err) => {
  logger.error({ err }, "Worker error");
});

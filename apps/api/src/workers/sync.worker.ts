import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { syncRuns } from "@dragons/db/schema";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { db } from "../config/database";
import { fullSync } from "../services/sync/index";

interface SyncJobData {
  type: "full" | "leagues" | "matches" | "standings" | "referee-games";
  triggeredBy?: string;
  syncRunId?: number;
}

export const syncWorker = new Worker<SyncJobData>(
  "sync",
  async (job: Job<SyncJobData>) => {
    const log = logger.child({ jobId: job.id });
    log.info({ jobName: job.name }, "Starting sync job");

    const triggeredBy = job.name === "daily-sync" ? "cron" : ("manual" as const);

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
          const result = await syncRefereeGames();
          return { completed: true, type: job.data.type, ...result };
        }
        default:
          throw new Error(`Unsupported sync type: ${job.data.type}`);
      }
    } catch (error) {
      log.error({ err: error }, "Sync job failed");
      throw error;
    }
  },
  {
    prefix: "{bull}",
    connection: { url: env.REDIS_URL },
    concurrency: 1,
  },
);

syncWorker.on("completed", async (job) => {
  logger.info({ jobId: job.id }, "Sync job completed");

  if (job.data.syncRunId) {
    const [run] = await db
      .select({ status: syncRuns.status })
      .from(syncRuns)
      .where(eq(syncRuns.id, job.data.syncRunId));
    if (run && run.status === "running") {
      logger.warn(
        { syncRunId: job.data.syncRunId },
        "Sync run still running after job completed, marking as completed",
      );
      await db
        .update(syncRuns)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(syncRuns.id, job.data.syncRunId));
    }
  }
});

syncWorker.on("failed", async (job, err) => {
  logger.error({ jobId: job?.id, err }, "Sync job failed");

  if (job?.data.syncRunId) {
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: err.message,
      })
      .where(eq(syncRuns.id, job.data.syncRunId));
  }
});

syncWorker.on("error", (err) => {
  logger.error({ err }, "Worker error");
});

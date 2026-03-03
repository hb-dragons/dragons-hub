import { Worker, Job } from "bullmq";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { syncOrchestrator } from "../services/sync/index";

interface SyncJobData {
  type: "full" | "leagues" | "matches" | "standings";
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
          const fullResult = await syncOrchestrator.fullSync(triggeredBy, jobLogger, job.data.syncRunId);
          return { completed: true, type: job.data.type, result: fullResult };
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

syncWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Sync job completed");
});

syncWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Sync job failed");
});

syncWorker.on("error", (err) => {
  logger.error({ err }, "Worker error");
});

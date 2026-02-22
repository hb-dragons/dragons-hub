import { Worker, Job } from "bullmq";
import { env } from "../config/env";
import { syncOrchestrator } from "../services/sync/index";

interface SyncJobData {
  type: "full" | "leagues" | "matches" | "standings";
  triggeredBy?: string;
  syncRunId?: number;
}

export const syncWorker = new Worker<SyncJobData>(
  "sync",
  async (job: Job<SyncJobData>) => {
    console.log(`[Sync Worker] Starting job ${job.id}: ${job.name}`);

    const triggeredBy = job.name === "daily-sync" ? "cron" : ("manual" as const);

    try {
      const logger = async (msg: string) => {
        await job.log(msg);
      };

      switch (job.data.type) {
        case "full": {
          const fullResult = await syncOrchestrator.fullSync(triggeredBy, logger, job.data.syncRunId);
          return { completed: true, type: job.data.type, result: fullResult };
        }
        default:
          throw new Error(`Unsupported sync type: ${job.data.type}`);
      }
    } catch (error) {
      console.error(`[Sync Worker] Job ${job.id} failed:`, error);
      throw error;
    }
  },
  {
    connection: { url: env.REDIS_URL },
    concurrency: 1,
  },
);

syncWorker.on("completed", (job) => {
  console.log(`[Sync Worker] Job ${job.id} completed`);
});

syncWorker.on("failed", (job, err) => {
  console.error(`[Sync Worker] Job ${job?.id} failed:`, err.message);
});

syncWorker.on("error", (err) => {
  console.error("[Sync Worker] Worker error:", err);
});

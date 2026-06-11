import { Worker, type Job } from "bullmq";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { runWithTrace } from "../config/log-context";
import { pollOutbox } from "../services/events/outbox-poller";

const log = logger.child({ worker: "outbox-poll" });

/**
 * BullMQ Worker — polls the domain-events outbox on each repeatable job fire.
 * Queue is defined in `workers/queues.ts`. Schedule is created in
 * `workers/queues.ts` via `initializeScheduledJobs()`.
 *
 * runWithTrace(undefined, ...) is safe: when no carrier is present the function
 * calls fn() directly without establishing a log context.
 */
export const outboxPollWorker = new Worker<unknown>(
  "outbox-poll",
  (_job: Job<unknown>) =>
    runWithTrace(undefined, async () => {
      const enqueued = await pollOutbox();
      if (enqueued > 0) log.debug({ enqueued }, "outbox poll enqueued events");
      return { enqueued };
    }),
  { prefix: "{bull}", connection: { url: env.REDIS_URL }, concurrency: 1 },
);

/* v8 ignore next 3 */
outboxPollWorker.on("failed", (job, err) => {
  log.error({ jobId: job?.id, err }, "outbox poll job failed");
});

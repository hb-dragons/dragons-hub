import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { domainEvents } from "@dragons/db/schema";
import { EVENT_TYPES } from "@dragons/shared";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { db } from "../config/database";
import { processEvent } from "../services/notifications/notification-pipeline";
import { digestQueue } from "./queues";

interface EventJobData {
  eventId: string;
  type: string;
  urgency: string;
  entityType: string;
  entityId: number;
}

/** Generate a unique digest run ID using current timestamp */
function nextDigestRunId(): number {
  return Date.now();
}

export const eventWorker = new Worker<EventJobData>(
  "domain-events",
  async (job: Job<EventJobData>) => {
    const log = logger.child({ jobId: job.id, eventId: job.data.eventId });
    log.info({ eventType: job.data.type }, "Processing domain event");

    // Load the full event from DB
    const [event] = await db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.id, job.data.eventId))
      .limit(1);

    if (!event) {
      log.warn("Event not found in database, skipping");
      return { skipped: true, reason: "event_not_found" };
    }

    // Run through notification pipeline (returns configs for reuse)
    const result = await processEvent(event);

    // Trigger per_sync digests when a sync completes — reuse configs from pipeline
    if (event.type === EVENT_TYPES.SYNC_COMPLETED) {
      await triggerPerSyncDigests(result.configs, log);
    }

    log.info(
      {
        dispatched: result.dispatched,
        buffered: result.buffered,
        coalesced: result.coalesced,
        muted: result.muted,
      },
      "Domain event processed",
    );

    return { dispatched: result.dispatched, buffered: result.buffered };
  },
  {
    prefix: "{bull}",
    connection: { url: env.REDIS_URL },
    concurrency: 5,
  },
);

/**
 * Enqueue a digest job for every enabled channel config with digestMode = "per_sync".
 */
async function triggerPerSyncDigests(
  configs: { id: number; digestMode: string; enabled: boolean }[],
  log: Pick<typeof logger, "info" | "error">,
): Promise<void> {
  const perSyncConfigs = configs.filter(
    (c) => c.enabled && c.digestMode === "per_sync",
  );

  if (perSyncConfigs.length === 0) return;

  const digestRunId = nextDigestRunId();
  log.info(
    { digestRunId, channelCount: perSyncConfigs.length },
    "Triggering per_sync digests",
  );

  for (const config of perSyncConfigs) {
    try {
      await digestQueue.add(`digest:${config.id}`, {
        channelConfigId: config.id,
        digestRunId,
      });
    } catch (error) {
      log.error(
        { channelConfigId: config.id, error },
        "Failed to enqueue per_sync digest job",
      );
    }
  }
}

/* v8 ignore next 3 */
eventWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "Event job completed");
});

/* v8 ignore next 3 */
eventWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Event job failed");
});

/* v8 ignore next 3 */
eventWorker.on("error", (err) => {
  logger.error({ err }, "Event worker error");
});

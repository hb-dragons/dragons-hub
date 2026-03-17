import { db } from "../../config/database";
import { domainEvents } from "@dragons/db/schema";
import { isNull, eq } from "drizzle-orm";
import { domainEventsQueue } from "../../workers/queues";
import { logger } from "../../config/logger";

/**
 * Poll the domain_events table for events that have not yet been enqueued
 * to BullMQ (enqueuedAt IS NULL) and enqueue them.
 *
 * Returns the number of events successfully enqueued.
 */
export async function pollOutbox(): Promise<number> {
  const pending = await db
    .select({
      id: domainEvents.id,
      type: domainEvents.type,
      urgency: domainEvents.urgency,
      entityType: domainEvents.entityType,
      entityId: domainEvents.entityId,
    })
    .from(domainEvents)
    .where(isNull(domainEvents.enqueuedAt))
    .limit(100);

  if (pending.length === 0) return 0;

  // Process in batches of 10 for better throughput
  const BATCH_SIZE = 10;
  let enqueued = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (event) => {
        await domainEventsQueue.add(event.type, {
          eventId: event.id,
          type: event.type,
          urgency: event.urgency,
          entityType: event.entityType,
          entityId: event.entityId,
        });

        await db
          .update(domainEvents)
          .set({ enqueuedAt: new Date() })
          .where(eq(domainEvents.id, event.id));

        return event.id;
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        enqueued++;
      } else {
        logger.error(
          { error: result.reason },
          "Outbox poller failed to enqueue event",
        );
      }
    }
  }

  if (enqueued > 0) {
    logger.info({ enqueued, total: pending.length }, "Outbox poller processed events");
  }

  return enqueued;
}

let pollerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the outbox poller on a fixed interval.
 */
export function startOutboxPoller(intervalMs = 30_000): void {
  if (pollerInterval) {
    logger.warn("Outbox poller already running");
    return;
  }

  logger.info({ intervalMs }, "Starting outbox poller");
  pollerInterval = setInterval(() => {
    pollOutbox().catch((error) => {
      logger.error({ error }, "Outbox poller iteration failed");
    });
  }, intervalMs);
}

/**
 * Stop the outbox poller.
 */
export function stopOutboxPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    logger.info("Outbox poller stopped");
  }
}

import { db } from "../../config/database";
import { domainEvents } from "@dragons/db/schema";
import { isNull, eq, and, lte, sql } from "drizzle-orm";
import { domainEventsQueue } from "../../workers/queues";
import { logger } from "../../config/logger";

/**
 * Poll the domain_events table for events that have not yet been enqueued
 * to BullMQ (enqueuedAt IS NULL) and enqueue them.
 *
 * Uses a transaction with FOR UPDATE SKIP LOCKED to prevent concurrent
 * poller instances (multiple API servers) from processing the same events.
 *
 * Returns the number of events successfully enqueued.
 */
export async function pollOutbox(): Promise<number> {
  // Use a 1-second delay to avoid picking up rows from uncommitted transactions.
  const oneSecondAgo = new Date(Date.now() - 1000);

  return await db.transaction(async (tx) => {
    // SELECT ... FOR UPDATE SKIP LOCKED prevents concurrent pollers from
    // grabbing the same rows. Drizzle doesn't support this natively, so
    // we use a raw query for the selection and then process with the ORM.
    const pending = await tx.execute<{
      id: string;
      type: string;
      urgency: string;
      entity_type: string;
      entity_id: number;
    }>(sql`
      SELECT id, type, urgency, entity_type, entity_id
      FROM domain_events
      WHERE enqueued_at IS NULL
        AND created_at <= ${oneSecondAgo}
      ORDER BY created_at ASC
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    `);

    if (pending.rows.length === 0) return 0;

    // Process in batches of 10 for better throughput
    const BATCH_SIZE = 10;
    let enqueued = 0;
    const rows = pending.rows;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (event) => {
          await domainEventsQueue.add(event.type, {
            eventId: event.id,
            type: event.type,
            urgency: event.urgency,
            entityType: event.entity_type,
            entityId: event.entity_id,
          });

          await tx
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
      logger.info({ enqueued, total: rows.length }, "Outbox poller processed events");
    }

    return enqueued;
  });
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

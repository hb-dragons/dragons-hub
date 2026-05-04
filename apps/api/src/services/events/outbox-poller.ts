import { db } from "../../config/database";
import { domainEvents } from "@dragons/db/schema";
import { sql } from "drizzle-orm";
import { domainEventsQueue } from "../../workers/queues";
import { logger } from "../../config/logger";

interface ClaimedEvent extends Record<string, unknown> {
  id: string;
  type: string;
  urgency: string;
  entity_type: string;
  entity_id: number;
}

const BATCH_LIMIT = 100;
const ENQUEUE_CONCURRENCY = 10;

async function claimBatch(): Promise<ClaimedEvent[]> {
  const oneSecondAgo = new Date(Date.now() - 1000);
  return await db.transaction(async (tx) => {
    const result = await tx.execute<ClaimedEvent>(sql`
      WITH claimed AS (
        SELECT id
        FROM domain_events
        WHERE enqueued_at IS NULL
          AND created_at <= ${oneSecondAgo}
        ORDER BY created_at ASC
        LIMIT ${BATCH_LIMIT}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE domain_events
      SET enqueued_at = NOW()
      FROM claimed
      WHERE domain_events.id = claimed.id
      RETURNING domain_events.id, domain_events.type, domain_events.urgency,
                domain_events.entity_type, domain_events.entity_id
    `);
    return [...result.rows];
  });
}

async function releaseClaim(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.execute(sql`
    UPDATE domain_events
    SET enqueued_at = NULL
    WHERE id IN ${sql.raw(`(${ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")})`)}
  `);
}

export async function pollOutbox(): Promise<number> {
  const claimed = await claimBatch();
  if (claimed.length === 0) return 0;

  const failed: string[] = [];
  let enqueued = 0;

  for (let i = 0; i < claimed.length; i += ENQUEUE_CONCURRENCY) {
    const batch = claimed.slice(i, i + ENQUEUE_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((event) =>
        domainEventsQueue.add(event.type, {
          eventId: event.id,
          type: event.type,
          urgency: event.urgency,
          entityType: event.entity_type,
          entityId: event.entity_id,
        }),
      ),
    );
    for (let j = 0; j < results.length; j++) {
      const result = results[j]!;
      if (result.status === "fulfilled") {
        enqueued++;
      } else {
        failed.push(batch[j]!.id);
        logger.error(
          { error: result.reason, eventId: batch[j]!.id },
          "Outbox poller failed to enqueue event",
        );
      }
    }
  }

  if (failed.length > 0) {
    await releaseClaim(failed).catch((error) => {
      logger.error({ error, failedCount: failed.length }, "Outbox poller failed to release claim");
    });
  }

  if (enqueued > 0 || failed.length > 0) {
    logger.info({ enqueued, failed: failed.length, total: claimed.length }, "Outbox poller processed events");
  }

  return enqueued;
}

let pollerInterval: ReturnType<typeof setInterval> | null = null;

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

export function stopOutboxPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    logger.info("Outbox poller stopped");
  }
}

export { domainEvents };

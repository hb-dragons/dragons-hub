import { getDb } from "../../config/database";
import { domainEvents } from "@dragons/db/schema";
import { inArray, sql } from "drizzle-orm";
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

// How long an enqueued-but-unprocessed event is left alone before the poller
// reclaims it. Must comfortably exceed the worker's retry window (attempts ×
// backoff) so a job that is still retrying isn't enqueued a second time.
const CLAIM_LEASE_MS = 5 * 60 * 1000;

async function claimBatch(): Promise<ClaimedEvent[]> {
  const oneSecondAgo = new Date(Date.now() - 1000);
  const leaseExpiry = new Date(Date.now() - CLAIM_LEASE_MS);
  return await getDb().transaction(async (tx) => {
    // Claim events that are not yet processed AND are either never enqueued or
    // whose lease has expired (the prior delivery attempt failed or was lost).
    // enqueued_at acts as the lease stamp; processed_at is the done flag.
    const result = await tx.execute<ClaimedEvent>(sql`
      WITH claimed AS (
        SELECT id
        FROM domain_events
        WHERE processed_at IS NULL
          AND created_at <= ${oneSecondAgo}
          AND (enqueued_at IS NULL OR enqueued_at <= ${leaseExpiry})
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
  await getDb()
    .update(domainEvents)
    .set({ enqueuedAt: null })
    .where(inArray(domainEvents.id, ids));
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

export { domainEvents };

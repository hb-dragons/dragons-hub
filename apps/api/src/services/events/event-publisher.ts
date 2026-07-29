import { ulid } from "ulid";
import { getDb } from "../../config/database";
import { domainEvents } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import type {
  EventSource,
  EventEntityType,
  EventType,
  SystemEventType,
} from "@dragons/shared";
import { validateEventPayload } from "@dragons/shared";
import { classifyUrgency } from "./event-types";
import { domainEventsQueue } from "../../workers/queues";
import { logger } from "../../config/logger";

export interface BuildDomainEventParams {
  type: EventType;
  source: EventSource;
  occurredAt?: Date;
  actor?: string | null;
  syncRunId?: number | null;
  entityType: EventEntityType;
  entityId: number;
  entityName: string;
  deepLinkPath: string;
  payload: Record<string, unknown>;
}

export interface DomainEvent {
  id: string;
  type: EventType;
  source: EventSource;
  urgency: "immediate" | "routine";
  occurredAt: Date;
  actor: string | null;
  syncRunId: number | null;
  entityType: EventEntityType;
  entityId: number;
  entityName: string;
  deepLinkPath: string;
  payload: Record<string, unknown>;
}

/**
 * Build a domain event object with a ULID and classified urgency.
 * Does not persist or enqueue -- pure data construction.
 */
export function buildDomainEvent(params: BuildDomainEventParams): DomainEvent {
  const validation = validateEventPayload(params.type, params.payload);
  if (!validation.valid) {
    logger.warn(
      { type: params.type, issues: validation.issues, entityId: params.entityId },
      "Domain event payload failed schema validation; publishing anyway",
    );
  }
  return {
    id: ulid(),
    type: params.type,
    source: params.source,
    urgency: classifyUrgency(params.type, params.payload),
    occurredAt: params.occurredAt ?? new Date(),
    actor: params.actor ?? null,
    syncRunId: params.syncRunId ?? null,
    entityType: params.entityType,
    entityId: params.entityId,
    entityName: params.entityName,
    deepLinkPath: params.deepLinkPath,
    payload: params.payload,
  };
}

export type TransactionClient = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

/**
 * Insert a domain event into the database.
 * Accepts an optional Drizzle transaction client so the insert can
 * participate in the same transaction as the entity change (outbox pattern).
 */
export async function insertDomainEvent(
  event: DomainEvent,
  tx?: TransactionClient,
): Promise<void> {
  await insertEventRow(
    {
      id: event.id,
      type: event.type,
      source: event.source,
      urgency: event.urgency,
      occurredAt: event.occurredAt,
      actor: event.actor,
      syncRunId: event.syncRunId,
      entityType: event.entityType,
      entityId: event.entityId,
      entityName: event.entityName,
      deepLinkPath: event.deepLinkPath,
      payload: event.payload,
    },
    tx,
  );
}

async function insertEventRow(
  values: typeof domainEvents.$inferInsert,
  tx?: TransactionClient,
): Promise<void> {
  const client = tx ?? getDb();
  await client.insert(domainEvents).values(values);
}

/**
 * An event that exists only to anchor rows the schema requires an event for,
 * never to notify anyone.
 *
 * The type itself now lives in `@dragons/shared` alongside the domain
 * vocabulary, because the admin listing's response type has to name it (#154).
 * It remains deliberately outside `EVENT_TYPES`: the pipeline finds no rule and
 * no role default for it and does nothing, which is the intent — the push
 * itself was already sent directly by the route.
 */
export type { SystemEventType };

export interface PublishSystemEventParams {
  /** Caller-chosen id. The route encodes its own scoping prefix into it. */
  id: string;
  type: SystemEventType;
  occurredAt: Date;
  /** The admin who triggered it. */
  actor: string;
  entityName: string;
  deepLinkPath: string;
  payload: Record<string, unknown>;
}

/**
 * Persist a system event through the events service rather than having a route
 * hand-write the `domain_events` columns (issue #79).
 *
 * `publishDomainEvent` is the path for anything real: it mints the ULID,
 * classifies urgency, validates the payload against the event's schema and
 * enqueues. None of that applies to a synthetic anchor — its id is chosen by
 * the caller, its type has no payload schema, and nothing should be dispatched
 * for it — so it gets its own narrow entry point instead of loopholes in that
 * one. `entity_type`/`entity_id` are fixed here because a system event is about
 * an account action, not a tracked entity; `source: "manual"` because a human
 * pressed a button.
 *
 * Takes the caller's transaction so the event and whatever references it land
 * atomically. As with a transactional `publishDomainEvent`, nothing is enqueued
 * here; the outbox poller picks the row up after the commit.
 */
export async function publishSystemEvent(
  params: PublishSystemEventParams,
  tx?: TransactionClient,
): Promise<void> {
  await insertEventRow(
    {
      id: params.id,
      type: params.type,
      source: "manual",
      urgency: "immediate",
      occurredAt: params.occurredAt,
      actor: params.actor,
      entityType: "user",
      entityId: 0,
      entityName: params.entityName,
      deepLinkPath: params.deepLinkPath,
      payload: params.payload,
    },
    tx,
  );
}

/**
 * Enqueue a domain event to BullMQ for processing. On success, marks
 * `enqueuedAt` in the database. Failures are logged but not thrown --
 * the outbox poller will catch up later.
 */
export async function enqueueDomainEvent(event: DomainEvent): Promise<void> {
  try {
    await domainEventsQueue.add(event.type, {
      eventId: event.id,
      type: event.type,
      urgency: event.urgency,
      entityType: event.entityType,
      entityId: event.entityId,
    });

    await getDb()
      .update(domainEvents)
      .set({ enqueuedAt: new Date() })
      .where(eq(domainEvents.id, event.id));
  } catch (error) {
    logger.warn(
      { eventId: event.id, error },
      "Failed to enqueue domain event; outbox poller will retry",
    );
  }
}

/**
 * High-level publish: insert into DB (in the provided transaction)
 * then fire-and-forget enqueue to BullMQ.
 *
 * When a transaction client is provided, the enqueue is **not** fired
 * immediately because the row is not yet committed — the worker would
 * see "event not found" and skip it. Instead, the outbox poller picks
 * it up after the caller commits. For non-transactional inserts the
 * enqueue fires right away for near-instant processing.
 */
export async function publishDomainEvent(
  params: BuildDomainEventParams,
  tx?: TransactionClient,
): Promise<DomainEvent> {
  const event = buildDomainEvent(params);
  await insertDomainEvent(event, tx);

  if (!tx) {
    enqueueDomainEvent(event).catch(() => {
      // logged inside enqueueDomainEvent; outbox poller will retry
    });
  }
  // When tx is provided the row isn't committed yet — the outbox poller
  // (every 30s) will find the un-enqueued event and process it.

  return event;
}

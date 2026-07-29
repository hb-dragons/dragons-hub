import { getDb } from "../../config/database";
import { domainEvents, notificationLog } from "@dragons/db/schema";
import { and, desc, eq, gte, lte, ilike, count } from "drizzle-orm";
import type {
  DomainEventListResult,
  EventType,
  EventEntityType,
  EventSource,
  StoredEventEntityType,
  StoredEventType,
} from "@dragons/shared";
import {
  buildDomainEvent,
  insertDomainEvent,
  enqueueDomainEvent,
} from "../events/event-publisher";
import { escapeLikePattern } from "../utils/sql";

// ── listDomainEvents ────────────────────────────────────────────────────────

export async function listDomainEvents(params: {
  page?: number;
  limit?: number;
  type?: StoredEventType;
  entityType?: StoredEventEntityType;
  source?: EventSource;
  from?: string;
  to?: string;
  search?: string;
}): Promise<DomainEventListResult> {
  const { page = 1, limit = 20, type, entityType, source, from, to, search } = params;
  const offset = (page - 1) * limit;

  const conditions = [];

  if (type) {
    conditions.push(eq(domainEvents.type, type));
  }
  if (entityType) {
    conditions.push(eq(domainEvents.entityType, entityType));
  }
  if (source) {
    conditions.push(eq(domainEvents.source, source));
  }
  if (from) {
    conditions.push(gte(domainEvents.occurredAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(domainEvents.occurredAt, new Date(to)));
  }
  if (search) {
    conditions.push(ilike(domainEvents.entityName, `%${escapeLikePattern(search)}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await getDb()
    .select({ count: count() })
    .from(domainEvents)
    .where(where);

  const rows = await getDb()
    .select()
    .from(domainEvents)
    .where(where)
    .orderBy(desc(domainEvents.occurredAt))
    .limit(limit)
    .offset(offset);

  // No hand-narrowing left here. The three columns carry their stored unions
  // from the schema (#154): `domain_events.type` really does hold values outside
  // `EventType` — `publishSystemEvent` writes `type: "admin.test_push"` with
  // `entity_type: "user"` — and `DomainEventItem` now says so.
  return {
    events: rows.map((r) => ({
      id: r.id,
      type: r.type,
      source: r.source,
      urgency: r.urgency,
      occurredAt: r.occurredAt.toISOString(),
      actor: r.actor,
      syncRunId: r.syncRunId,
      entityType: r.entityType,
      entityId: r.entityId,
      entityName: r.entityName,
      deepLinkPath: r.deepLinkPath,
      enqueuedAt: r.enqueuedAt?.toISOString() ?? null,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    })),
    total: Number(totalRow!.count),
  };
}

// ── triggerManualEvent ──────────────────────────────────────────────────────

export interface TriggerEventParams {
  type: EventType;
  entityType: string;
  entityId: number;
  entityName: string;
  deepLinkPath: string;
  payload: Record<string, unknown>;
  urgencyOverride?: "immediate" | "routine";
  actor: string;
}

export async function triggerManualEvent(params: TriggerEventParams) {
  // Build the event first so we can override urgency before persisting
  const event = buildDomainEvent({
    type: params.type,
    source: "manual",
    entityType: params.entityType as EventEntityType,
    entityId: params.entityId,
    entityName: params.entityName,
    deepLinkPath: params.deepLinkPath,
    payload: params.payload,
    actor: params.actor,
  });

  // Apply urgency override before persisting — the DB stores the actual urgency
  if (params.urgencyOverride) {
    event.urgency = params.urgencyOverride;
  }

  await insertDomainEvent(event);
  void enqueueDomainEvent(event);

  return {
    eventId: event.id,
    type: event.type,
    urgency: event.urgency,
    entityType: event.entityType,
    entityId: event.entityId,
  };
}

// ── listFailedNotifications ─────────────────────────────────────────────────

export async function listFailedNotifications(params: {
  page?: number;
  limit?: number;
}) {
  const { page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  const [totalRow] = await getDb()
    .select({ count: count() })
    .from(notificationLog)
    .where(eq(notificationLog.status, "failed"));

  const rows = await getDb()
    .select({
      id: notificationLog.id,
      eventId: notificationLog.eventId,
      watchRuleId: notificationLog.watchRuleId,
      channelConfigId: notificationLog.channelConfigId,
      recipientId: notificationLog.recipientId,
      title: notificationLog.title,
      body: notificationLog.body,
      locale: notificationLog.locale,
      status: notificationLog.status,
      errorMessage: notificationLog.errorMessage,
      retryCount: notificationLog.retryCount,
      createdAt: notificationLog.createdAt,
      // Join event data for context
      eventType: domainEvents.type,
      entityName: domainEvents.entityName,
      deepLinkPath: domainEvents.deepLinkPath,
    })
    .from(notificationLog)
    .innerJoin(domainEvents, eq(notificationLog.eventId, domainEvents.id))
    .where(eq(notificationLog.status, "failed"))
    .orderBy(desc(notificationLog.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    notifications: rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      watchRuleId: r.watchRuleId,
      channelConfigId: r.channelConfigId,
      recipientId: r.recipientId,
      title: r.title,
      body: r.body,
      locale: r.locale,
      status: r.status,
      errorMessage: r.errorMessage,
      retryCount: r.retryCount,
      createdAt: r.createdAt.toISOString(),
      eventType: r.eventType,
      entityName: r.entityName,
      deepLinkPath: r.deepLinkPath,
    })),
    total: Number(totalRow!.count),
  };
}

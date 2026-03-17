import { db } from "../../config/database";
import { domainEvents, notificationLog } from "@dragons/db/schema";
import { and, desc, eq, gte, lte, ilike, count } from "drizzle-orm";
import type { DomainEventListResult, EventType, EventEntityType } from "@dragons/shared";
import { publishDomainEvent } from "../events/event-publisher";

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeLikePattern(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

// ── listDomainEvents ────────────────────────────────────────────────────────

export async function listDomainEvents(params: {
  page?: number;
  limit?: number;
  type?: string;
  entityType?: string;
  source?: string;
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

  const [totalRow] = await db
    .select({ count: count() })
    .from(domainEvents)
    .where(where);

  const rows = await db
    .select()
    .from(domainEvents)
    .where(where)
    .orderBy(desc(domainEvents.occurredAt))
    .limit(limit)
    .offset(offset);

  return {
    events: rows.map((r) => ({
      id: r.id,
      type: r.type as DomainEventListResult["events"][number]["type"],
      source: r.source as DomainEventListResult["events"][number]["source"],
      urgency: r.urgency as DomainEventListResult["events"][number]["urgency"],
      occurredAt: r.occurredAt.toISOString(),
      actor: r.actor,
      syncRunId: r.syncRunId,
      entityType: r.entityType as DomainEventListResult["events"][number]["entityType"],
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
  type: string;
  entityType: string;
  entityId: number;
  entityName: string;
  deepLinkPath: string;
  payload: Record<string, unknown>;
  urgencyOverride?: "immediate" | "routine";
  actor: string;
}

export async function triggerManualEvent(params: TriggerEventParams) {
  const event = await publishDomainEvent({
    type: params.type as EventType,
    source: "manual",
    entityType: params.entityType as EventEntityType,
    entityId: params.entityId,
    entityName: params.entityName,
    deepLinkPath: params.deepLinkPath,
    payload: params.payload,
    actor: params.actor,
  });

  return {
    eventId: event.id,
    type: event.type,
    urgency: params.urgencyOverride ?? event.urgency,
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

  const [totalRow] = await db
    .select({ count: count() })
    .from(notificationLog)
    .where(eq(notificationLog.status, "failed"));

  const rows = await db
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

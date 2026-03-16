import { db } from "../../config/database";
import { domainEvents } from "@dragons/db/schema";
import { and, desc, eq, gte, lte, ilike, count } from "drizzle-orm";
import type { DomainEventListResult } from "@dragons/shared";

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
    conditions.push(ilike(domainEvents.entityName, `%${search}%`));
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

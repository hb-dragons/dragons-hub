import { db } from "../../config/database";
import { watchRules } from "@dragons/db/schema";
import { eq, desc, count } from "drizzle-orm";
import type {
  WatchRuleItem,
  WatchRuleListResult,
  CreateWatchRuleBody,
  UpdateWatchRuleBody,
  FilterCondition,
  ChannelTarget,
} from "@dragons/shared";

// ── helpers ─────────────────────────────────────────────────────────────────

function toItem(r: typeof watchRules.$inferSelect): WatchRuleItem {
  return {
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    createdBy: r.createdBy,
    eventTypes: r.eventTypes,
    filters: r.filters as FilterCondition[],
    channels: r.channels as ChannelTarget[],
    urgencyOverride: r.urgencyOverride,
    templateOverride: r.templateOverride,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ── listWatchRules ──────────────────────────────────────────────────────────

export async function listWatchRules(params: {
  page?: number;
  limit?: number;
}): Promise<WatchRuleListResult> {
  const { page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  const [totalRow] = await db
    .select({ count: count() })
    .from(watchRules);

  const rows = await db
    .select()
    .from(watchRules)
    .orderBy(desc(watchRules.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    rules: rows.map(toItem),
    total: Number(totalRow!.count),
  };
}

// ── getWatchRule ────────────────────────────────────────────────────────────

export async function getWatchRule(id: number): Promise<WatchRuleItem | null> {
  const [row] = await db
    .select()
    .from(watchRules)
    .where(eq(watchRules.id, id));

  return row ? toItem(row) : null;
}

// ── createWatchRule ─────────────────────────────────────────────────────────

export async function createWatchRule(
  data: CreateWatchRuleBody,
  userId: string,
): Promise<WatchRuleItem> {
  const [row] = await db
    .insert(watchRules)
    .values({
      name: data.name,
      enabled: data.enabled ?? true,
      createdBy: userId,
      eventTypes: data.eventTypes,
      filters: data.filters ?? [],
      channels: data.channels,
      urgencyOverride: data.urgencyOverride ?? null,
      templateOverride: data.templateOverride ?? null,
    })
    .returning();

  return toItem(row!);
}

// ── updateWatchRule ─────────────────────────────────────────────────────────

export async function updateWatchRule(
  id: number,
  data: UpdateWatchRuleBody,
): Promise<WatchRuleItem | null> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.enabled !== undefined) updates.enabled = data.enabled;
  if (data.eventTypes !== undefined) updates.eventTypes = data.eventTypes;
  if (data.filters !== undefined) updates.filters = data.filters;
  if (data.channels !== undefined) updates.channels = data.channels;
  if (data.urgencyOverride !== undefined) updates.urgencyOverride = data.urgencyOverride;
  if (data.templateOverride !== undefined) updates.templateOverride = data.templateOverride;

  const [row] = await db
    .update(watchRules)
    .set(updates)
    .where(eq(watchRules.id, id))
    .returning();

  return row ? toItem(row) : null;
}

// ── deleteWatchRule ─────────────────────────────────────────────────────────

export async function deleteWatchRule(id: number): Promise<boolean> {
  const [deleted] = await db
    .delete(watchRules)
    .where(eq(watchRules.id, id))
    .returning({ id: watchRules.id });

  return !!deleted;
}

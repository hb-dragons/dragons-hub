import { db } from "../../config/database";
import { channelConfigs } from "@dragons/db/schema";
import { eq, desc, count } from "drizzle-orm";
import type {
  ChannelConfigItem,
  ChannelConfigListResult,
  CreateChannelConfigBody,
  UpdateChannelConfigBody,
  ChannelType,
  DigestMode,
} from "@dragons/shared";

// ── helpers ─────────────────────────────────────────────────────────────────

function toItem(r: typeof channelConfigs.$inferSelect): ChannelConfigItem {
  return {
    id: r.id,
    name: r.name,
    type: r.type as ChannelType,
    enabled: r.enabled,
    config: r.config,
    digestMode: r.digestMode as DigestMode,
    digestCron: r.digestCron,
    digestTimezone: r.digestTimezone,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ── listChannelConfigs ──────────────────────────────────────────────────────

export async function listChannelConfigs(params: {
  page?: number;
  limit?: number;
}): Promise<ChannelConfigListResult> {
  const { page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  const [totalRow] = await db
    .select({ count: count() })
    .from(channelConfigs);

  const rows = await db
    .select()
    .from(channelConfigs)
    .orderBy(desc(channelConfigs.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    configs: rows.map(toItem),
    total: Number(totalRow!.count),
  };
}

// ── getChannelConfig ────────────────────────────────────────────────────────

export async function getChannelConfig(id: number): Promise<ChannelConfigItem | null> {
  const [row] = await db
    .select()
    .from(channelConfigs)
    .where(eq(channelConfigs.id, id));

  return row ? toItem(row) : null;
}

// ── createChannelConfig ─────────────────────────────────────────────────────

export async function createChannelConfig(
  data: CreateChannelConfigBody,
): Promise<ChannelConfigItem> {
  const [row] = await db
    .insert(channelConfigs)
    .values({
      name: data.name,
      type: data.type,
      enabled: data.enabled ?? true,
      config: data.config,
      digestMode: data.digestMode ?? "per_sync",
      digestCron: data.digestCron ?? null,
      digestTimezone: data.digestTimezone ?? "Europe/Berlin",
    })
    .returning();

  return toItem(row!);
}

// ── updateChannelConfig ─────────────────────────────────────────────────────

export async function updateChannelConfig(
  id: number,
  data: UpdateChannelConfigBody,
): Promise<ChannelConfigItem | null> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.enabled !== undefined) updates.enabled = data.enabled;
  if (data.config !== undefined) updates.config = data.config;
  if (data.digestMode !== undefined) updates.digestMode = data.digestMode;
  if (data.digestCron !== undefined) updates.digestCron = data.digestCron;
  if (data.digestTimezone !== undefined) updates.digestTimezone = data.digestTimezone;

  const [row] = await db
    .update(channelConfigs)
    .set(updates)
    .where(eq(channelConfigs.id, id))
    .returning();

  return row ? toItem(row) : null;
}

// ── deleteChannelConfig ─────────────────────────────────────────────────────

export async function deleteChannelConfig(id: number): Promise<boolean> {
  const [deleted] = await db
    .delete(channelConfigs)
    .where(eq(channelConfigs.id, id))
    .returning({ id: channelConfigs.id });

  return !!deleted;
}

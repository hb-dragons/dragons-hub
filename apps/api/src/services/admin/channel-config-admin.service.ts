import { getDb } from "../../config/database";
import { channelConfigs, digestBuffer } from "@dragons/db/schema";
import { and, eq, desc, count, isNull } from "drizzle-orm";
import type {
  ChannelConfigItem,
  ChannelConfigListResult,
  ChannelType,
  DigestMode,
} from "@dragons/shared";
import type {
  ChannelConfigCreateBodyParsed,
  ChannelConfigUpdateBodyParsed,
} from "@dragons/contracts";

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Retired channel configs stay in the table so `notification_log` keeps its
 * foreign key (and the delivered notifications it records). Every read path
 * therefore has to exclude them — see `channelConfigs.deletedAt`.
 */
const notDeleted = isNull(channelConfigs.deletedAt);

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

  const [totalRow] = await getDb()
    .select({ count: count() })
    .from(channelConfigs)
    .where(notDeleted);

  const rows = await getDb()
    .select()
    .from(channelConfigs)
    .where(notDeleted)
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
  const [row] = await getDb()
    .select()
    .from(channelConfigs)
    .where(and(eq(channelConfigs.id, id), notDeleted));

  return row ? toItem(row) : null;
}

// ── createChannelConfig ─────────────────────────────────────────────────────

export async function createChannelConfig(
  data: ChannelConfigCreateBodyParsed,
): Promise<ChannelConfigItem> {
  const [row] = await getDb()
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
  data: ChannelConfigUpdateBodyParsed,
): Promise<ChannelConfigItem | null> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.enabled !== undefined) updates.enabled = data.enabled;
  if (data.config !== undefined) updates.config = data.config;
  if (data.digestMode !== undefined) updates.digestMode = data.digestMode;
  if (data.digestCron !== undefined) updates.digestCron = data.digestCron;
  if (data.digestTimezone !== undefined) updates.digestTimezone = data.digestTimezone;

  const [row] = await getDb()
    .update(channelConfigs)
    .set(updates)
    .where(and(eq(channelConfigs.id, id), notDeleted))
    .returning();

  return row ? toItem(row) : null;
}

// ── deleteChannelConfig ─────────────────────────────────────────────────────

/**
 * Retires a channel config.
 *
 * A hard `DELETE` raised Postgres 23503 for any config that had ever delivered
 * a notification, because `notification_log.channel_config_id` is NOT NULL and
 * references this table — an unhandled 500 on `DELETE /admin/channel-configs/:id`.
 * `ON DELETE SET NULL` is not available on a NOT NULL column, and cascading
 * would delete users' in-app notifications (notification_log *is* the inbox) to
 * retire a delivery route. So the row is marked deleted and disabled instead:
 * the audit trail survives, the FK holds, and every read path filters it out.
 *
 * Buffered digest entries are different — they are unsent work for a route that
 * no longer exists — so they are purged.
 *
 * Returns false when the id does not exist or was already retired, which the
 * route turns into a 404.
 */
export async function deleteChannelConfig(id: number): Promise<boolean> {
  const [retired] = await getDb()
    .update(channelConfigs)
    .set({ deletedAt: new Date(), enabled: false, updatedAt: new Date() })
    .where(and(eq(channelConfigs.id, id), notDeleted))
    .returning({ id: channelConfigs.id });

  if (!retired) return false;

  await getDb().delete(digestBuffer).where(eq(digestBuffer.channelConfigId, id));

  return true;
}

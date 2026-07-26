import {
  boolean,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { ChannelConfig } from "@dragons/shared";

export const channelConfigs = pgTable(
  "channel_configs",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config")
      .notNull()
      .$type<ChannelConfig>(),
    digestMode: text("digest_mode").notNull().default("per_sync"),
    digestCron: text("digest_cron"),
    digestTimezone: text("digest_timezone").notNull().default("Europe/Berlin"),
    /**
     * Soft-delete marker. `notification_log` is both the delivery audit trail
     * and the in-app inbox, and its `channel_config_id` is NOT NULL — so a
     * channel config can be neither hard-deleted (FK violation, Postgres 23503)
     * nor detached (`ON DELETE SET NULL` is impossible). Cascading would destroy
     * delivered user notifications to retire a route, so retiring a route marks
     * it here instead. Every read path filters `deleted_at IS NULL`.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    deletedAtIdx: index("channel_configs_deleted_at_idx").on(table.deletedAt),
  }),
);

export type ChannelConfigRow = typeof channelConfigs.$inferSelect;
export type ChannelConfigInsert = typeof channelConfigs.$inferInsert;

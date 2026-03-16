import {
  boolean,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const channelConfigs = pgTable("channel_configs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config")
    .notNull()
    .$type<Record<string, unknown>>()
    .default({}),
  digestMode: text("digest_mode").notNull().default("per_sync"),
  digestCron: text("digest_cron"),
  digestTimezone: text("digest_timezone").notNull().default("Europe/Berlin"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ChannelConfigRow = typeof channelConfigs.$inferSelect;
export type ChannelConfigInsert = typeof channelConfigs.$inferInsert;

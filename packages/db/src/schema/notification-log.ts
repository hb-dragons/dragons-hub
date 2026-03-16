import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { domainEvents } from "./domain-events";
import { watchRules } from "./watch-rules";
import { channelConfigs } from "./channel-configs";

export const notificationLog = pgTable(
  "notification_log",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => domainEvents.id),
    watchRuleId: integer("watch_rule_id").references(() => watchRules.id),
    channelConfigId: integer("channel_config_id")
      .notNull()
      .references(() => channelConfigs.id),
    recipientId: text("recipient_id"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    locale: text("locale").notNull().default("de"),
    status: text("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    digestRunId: integer("digest_run_id"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusIdx: index("notification_log_status_idx").on(table.status),
    recipientIdx: index("notification_log_recipient_idx").on(
      table.recipientId,
    ),
    digestRunIdx: index("notification_log_digest_run_idx").on(
      table.digestRunId,
    ),
  }),
);

export type NotificationLogRow = typeof notificationLog.$inferSelect;
export type NotificationLogInsert = typeof notificationLog.$inferInsert;

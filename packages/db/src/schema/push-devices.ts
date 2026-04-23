import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";

export const pushDevices = pgTable(
  "push_devices",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    token: text("token").notNull(),
    platform: varchar("platform", { length: 10 }).notNull(),
    locale: text("locale"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("push_devices_user_idx").on(table.userId),
    tokenUnique: unique("push_devices_token_unique").on(table.token),
  }),
);

export type PushDevice = typeof pushDevices.$inferSelect;
export type NewPushDevice = typeof pushDevices.$inferInsert;

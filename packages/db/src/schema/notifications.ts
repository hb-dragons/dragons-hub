import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    recipientId: text("recipient_id").notNull(),
    channel: varchar("channel", { length: 20 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    body: text("body").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    recipientIdx: index("notifications_recipient_idx").on(table.recipientId),
    statusIdx: index("notifications_status_idx").on(table.status),
  }),
);

export const userNotificationPreferences = pgTable(
  "user_notification_preferences",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().unique(),
    whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
    whatsappNumber: varchar("whatsapp_number", { length: 20 }),
    notifyOnTaskAssigned: boolean("notify_on_task_assigned")
      .notNull()
      .default(true),
    notifyOnBookingNeedsAction: boolean("notify_on_booking_needs_action")
      .notNull()
      .default(true),
    notifyOnTaskComment: boolean("notify_on_task_comment")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type UserNotificationPreference =
  typeof userNotificationPreferences.$inferSelect;
export type NewUserNotificationPreference =
  typeof userNotificationPreferences.$inferInsert;

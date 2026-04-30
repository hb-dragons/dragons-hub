import {
  pgTable,
  text,
  integer,
  boolean,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { matches } from "./matches";

export const broadcastConfigs = pgTable("broadcast_configs", {
  deviceId: text("device_id").primaryKey(),
  matchId: integer("match_id").references(() => matches.id),
  isLive: boolean("is_live").notNull().default(false),
  homeAbbr: varchar("home_abbr", { length: 8 }),
  guestAbbr: varchar("guest_abbr", { length: 8 }),
  homeColorOverride: varchar("home_color_override", { length: 20 }),
  guestColorOverride: varchar("guest_color_override", { length: 20 }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type BroadcastConfigRow = typeof broadcastConfigs.$inferSelect;
export type NewBroadcastConfigRow = typeof broadcastConfigs.$inferInsert;

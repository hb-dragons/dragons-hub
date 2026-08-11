import {
  pgTable,
  text,
  integer,
  boolean,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { matches } from "./matches";

export const broadcastConfigs = pgTable(
  "broadcast_configs",
  {
    deviceId: text("device_id").primaryKey(),
    // The device's own configuration outlives any match it happened to be
    // pointed at, so deleting a match unbinds the device instead of deleting it.
    matchId: integer("match_id").references(() => matches.id, { onDelete: "set null" }),
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
  },
  (table) => ({
    matchIdx: index("broadcast_configs_match_id_idx").on(table.matchId),
  }),
);

export type BroadcastConfigRow = typeof broadcastConfigs.$inferSelect;
export type NewBroadcastConfigRow = typeof broadcastConfigs.$inferInsert;

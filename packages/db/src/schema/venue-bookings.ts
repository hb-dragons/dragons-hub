import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  date,
  time,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { venues } from "./venues";

export const venueBookings = pgTable(
  "venue_bookings",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id),
    date: date("date").notNull(),
    calculatedStartTime: time("calculated_start_time").notNull(),
    calculatedEndTime: time("calculated_end_time").notNull(),
    overrideStartTime: time("override_start_time"),
    overrideEndTime: time("override_end_time"),
    overrideReason: text("override_reason"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    needsReconfirmation: boolean("needs_reconfirmation")
      .notNull()
      .default(false),
    notes: text("notes"),
    confirmedBy: text("confirmed_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    venueDateUniq: uniqueIndex("venue_bookings_venue_date_uniq").on(
      table.venueId,
      table.date,
    ),
    dateIdx: index("venue_bookings_date_idx").on(table.date),
    statusIdx: index("venue_bookings_status_idx").on(table.status),
  }),
);

export type VenueBooking = typeof venueBookings.$inferSelect;
export type NewVenueBooking = typeof venueBookings.$inferInsert;

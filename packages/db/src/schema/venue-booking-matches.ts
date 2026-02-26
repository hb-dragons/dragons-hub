import {
  pgTable,
  serial,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { venueBookings } from "./venue-bookings";
import { matches } from "./matches";

export const venueBookingMatches = pgTable(
  "venue_booking_matches",
  {
    id: serial("id").primaryKey(),
    venueBookingId: integer("venue_booking_id")
      .notNull()
      .references(() => venueBookings.id, { onDelete: "cascade" }),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    bookingMatchUniq: uniqueIndex("venue_booking_matches_uniq").on(
      table.venueBookingId,
      table.matchId,
    ),
    matchIdx: index("venue_booking_matches_match_idx").on(table.matchId),
  }),
);

export type VenueBookingMatch = typeof venueBookingMatches.$inferSelect;
export type NewVenueBookingMatch = typeof venueBookingMatches.$inferInsert;

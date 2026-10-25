import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  date,
  time,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import type { HallTimeKind, HallTimeSource } from "@dragons/shared";
import { venues } from "./venues";

/**
 * Hall times (Hallenzeiten): one row per venue and club-zone day, the time
 * window the club holds the hall per its Mietantrag ("Anlage T") or the
 * city's closure note for that day. A day the club asked for nothing has
 * no row. Whether a home game day is covered by its hall time is computed at
 * read time (hall occupancy), never stored.
 */
export const venueHallTimes = pgTable(
  "venue_hall_times",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    kind: varchar("kind", { length: 10 }).notNull().$type<HallTimeKind>(),
    note: text("note"),
    source: varchar("source", { length: 10 }).notNull().$type<HallTimeSource>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    venueDateUniq: uniqueIndex("venue_hall_times_venue_date_uniq").on(
      table.venueId,
      table.date,
    ),
    dateIdx: index("venue_hall_times_date_idx").on(table.date),
    openHasWindow: check(
      "venue_hall_times_open_has_window",
      sql`${table.kind} <> 'open' OR (${table.startTime} IS NOT NULL AND ${table.endTime} IS NOT NULL)`,
    ),
    windowOrdered: check(
      "venue_hall_times_window_ordered",
      sql`${table.startTime} IS NULL OR ${table.endTime} IS NULL OR ${table.startTime} < ${table.endTime}`,
    ),
  }),
);

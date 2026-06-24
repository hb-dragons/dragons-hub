import {
  pgTable,
  serial,
  integer,
  varchar,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { SeasonStatus } from "@dragons/shared";

export const seasons = pgTable(
  "seasons",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    sdkSeasonId: integer("sdk_season_id"),
    status: varchar("status", { length: 20 }).notNull().$type<SeasonStatus>(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // At most one active season. Partial unique index over a constant filter.
    oneActive: uniqueIndex("seasons_one_active_uniq")
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
  }),
);

export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;

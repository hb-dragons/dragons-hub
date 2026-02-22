import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { leagues } from "./leagues";
import { teams } from "./teams";

export const standings = pgTable(
  "standings",
  {
    id: serial("id").primaryKey(),
    leagueId: integer("league_id")
      .notNull()
      .references(() => leagues.id),
    teamApiId: integer("team_api_id").notNull().references(() => teams.apiTeamPermanentId),
    position: integer("position").notNull(),
    played: integer("played").notNull().default(0),
    won: integer("won").notNull().default(0),
    lost: integer("lost").notNull().default(0),
    pointsFor: integer("points_for").notNull().default(0),
    pointsAgainst: integer("points_against").notNull().default(0),
    pointsDiff: integer("points_diff").notNull().default(0),
    leaguePoints: integer("league_points").notNull().default(0),
    dataHash: varchar("data_hash", { length: 64 }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    leagueIdIdx: index("standings_league_id_idx").on(table.leagueId),
    leagueTeamUnique: unique("standings_league_team_unique").on(table.leagueId, table.teamApiId),
  }),
);

export type Standing = typeof standings.$inferSelect;
export type NewStanding = typeof standings.$inferInsert;

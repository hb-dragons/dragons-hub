import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { teams } from "./teams";
import { seasons } from "./seasons";
import { leagues } from "./leagues";

/**
 * A Team entry: one club team fielded in one season (see CONTEXT.md).
 * Owns the club-facing team data for that season and the connected league.
 * `leagueId` NULL means "not connected". Exactly one league per entry —
 * cardinality is the single column, enforced by design (ADR 0004).
 */
export const teamEntries = pgTable(
  "team_entries",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    leagueId: integer("league_id").references(() => leagues.id),
    // 'seeded' | 'manual' — federation evidence supersedes both; the value
    // exists so the supersession of a manual link can be logged honestly.
    linkSource: varchar("link_source", { length: 10 }).notNull().default("seeded"),
    customName: varchar("custom_name", { length: 50 }),
    badgeColor: varchar("badge_color", { length: 20 }),
    estimatedGameDuration: integer("estimated_game_duration"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    teamSeasonUnique: unique("team_entries_team_season_unique").on(
      table.teamId,
      table.seasonId,
    ),
    seasonOrderIdx: index("team_entries_season_order_idx").on(
      table.seasonId,
      table.displayOrder,
    ),
  }),
);

export type TeamEntry = typeof teamEntries.$inferSelect;
export type NewTeamEntry = typeof teamEntries.$inferInsert;

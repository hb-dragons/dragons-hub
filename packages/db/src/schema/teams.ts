import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const teams = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    apiTeamPermanentId: integer("api_team_permanent_id").notNull().unique(),
    seasonTeamId: integer("season_team_id").notNull(),
    teamCompetitionId: integer("team_competition_id").notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    nameShort: varchar("name_short", { length: 100 }),
    customName: varchar("custom_name", { length: 50 }),
    clubId: integer("club_id").notNull(),
    isOwnClub: boolean("is_own_club").default(false),
    verzicht: boolean("verzicht").default(false),
    estimatedGameDuration: integer("estimated_game_duration"),
    badgeColor: varchar("badge_color", { length: 20 }),
    displayOrder: integer("display_order").notNull().default(0),
    dataHash: varchar("data_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    clubIdIdx: index("teams_club_id_idx").on(table.clubId),
    ownOrderIdx: index("teams_own_order_idx").on(table.isOwnClub, table.displayOrder),
  }),
);

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

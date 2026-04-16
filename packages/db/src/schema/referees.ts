import {
  pgTable,
  serial,
  integer,
  smallint,
  varchar,
  boolean,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { matches } from "./matches";

export const referees = pgTable("referees", {
  id: serial("id").primaryKey(),
  apiId: integer("api_id").notNull().unique(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  licenseNumber: integer("license_number"),
  allowAllHomeGames: boolean("allow_all_home_games").notNull().default(false),
  allowAwayGames: boolean("allow_away_games").notNull().default(false),
  dataHash: varchar("data_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const refereeRoles = pgTable("referee_roles", {
  id: serial("id").primaryKey(),
  apiId: integer("api_id").notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  shortName: varchar("short_name", { length: 20 }),
  dataHash: varchar("data_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const matchReferees = pgTable(
  "match_referees",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    refereeId: integer("referee_id")
      .notNull()
      .references(() => referees.id),
    roleId: integer("role_id")
      .notNull()
      .references(() => refereeRoles.id),
    slotNumber: smallint("slot_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    matchIdIdx: index("match_referees_match_id_idx").on(table.matchId),
    refereeIdIdx: index("match_referees_referee_id_idx").on(table.refereeId),
    matchSlotUnique: unique("match_referees_slot_unique").on(
      table.matchId,
      table.slotNumber,
    ),
  }),
);

export const refereeAssignmentIntents = pgTable(
  "referee_assignment_intents",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    refereeId: integer("referee_id")
      .notNull()
      .references(() => referees.id),
    slotNumber: smallint("slot_number").notNull(),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedBySyncAt: timestamp("confirmed_by_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    matchRefereeSlotUnique: unique("referee_intent_unique").on(
      table.matchId,
      table.refereeId,
      table.slotNumber,
    ),
    matchIdIdx: index("referee_intent_match_id_idx").on(table.matchId),
    refereeIdIdx: index("referee_intent_referee_id_idx").on(table.refereeId),
  }),
);

export type RefereeAssignmentIntent = typeof refereeAssignmentIntents.$inferSelect;
export type NewRefereeAssignmentIntent = typeof refereeAssignmentIntents.$inferInsert;

export type Referee = typeof referees.$inferSelect;
export type NewReferee = typeof referees.$inferInsert;
export type RefereeRole = typeof refereeRoles.$inferSelect;
export type NewRefereeRole = typeof refereeRoles.$inferInsert;
export type MatchReferee = typeof matchReferees.$inferSelect;
export type NewMatchReferee = typeof matchReferees.$inferInsert;

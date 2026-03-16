import {
  pgTable,
  serial,
  integer,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { referees } from "./referees";
import { teams } from "./teams";

export const refereeAssignmentRules = pgTable(
  "referee_assignment_rules",
  {
    id: serial("id").primaryKey(),
    refereeId: integer("referee_id")
      .notNull()
      .references(() => referees.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    deny: boolean("deny").notNull().default(false),
    allowSr1: boolean("allow_sr1").notNull().default(false),
    allowSr2: boolean("allow_sr2").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    refereeTeamUnique: unique("referee_assignment_rules_referee_team_unique").on(
      table.refereeId,
      table.teamId,
    ),
  }),
);

export type RefereeAssignmentRule = typeof refereeAssignmentRules.$inferSelect;
export type NewRefereeAssignmentRule = typeof refereeAssignmentRules.$inferInsert;

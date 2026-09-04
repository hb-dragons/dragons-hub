import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import type { TeamStaffRole } from "@dragons/shared";
import { teamEntries } from "./team-entries";
import { staffPeople } from "./staff-people";

/**
 * The assignment of a staff person to one Team entry in a role (ADR 0009) —
 * the Hub is the source of truth for people in club roles (ADR 0008). The human
 * lives in `staff_people`; this row only says which team they work with, in
 * what role, and whether referees are pointed at them.
 *
 * Attached to the entry, not the squad, so assignments are per season and
 * carried forward at rollover the way badge color is — with the same person id,
 * never a copy of the person.
 *
 * `role` is a varchar narrowed by `TeamStaffRole`, matching `seasons.status`:
 * the value set is decided once in `@dragons/shared` and enforced at the API
 * boundary by the zod contract.
 */
export const teamStaff = pgTable(
  "team_staff",
  {
    id: serial("id").primaryKey(),
    teamEntryId: integer("team_entry_id")
      .notNull()
      .references(() => teamEntries.id, { onDelete: "cascade" }),
    // `restrict`, not `cascade`: a person attached to a team is that team's
    // contact, and deleting them out from under it would silently empty the
    // staff block. `deleteStaffPerson` answers 409 while assignments exist, and
    // this is the same rule at the database level.
    personId: integer("person_id")
      .notNull()
      .references(() => staffPeople.id, { onDelete: "restrict" }),
    role: varchar("role", { length: 20 }).notNull().$type<TeamStaffRole>(),
    refereeContact: boolean("referee_contact").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    entryIdx: index("team_staff_entry_idx").on(table.teamEntryId),
    personIdx: index("team_staff_person_idx").on(table.personId),
    // One person holds at most one assignment per entry, so no team ever shows
    // the same human twice and no dedupe is needed downstream.
    entryPerson: unique("team_staff_entry_person_key").on(table.teamEntryId, table.personId),
  }),
);

export type TeamStaff = typeof teamStaff.$inferSelect;
export type NewTeamStaff = typeof teamStaff.$inferInsert;

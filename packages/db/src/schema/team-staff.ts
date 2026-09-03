import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { TeamStaffRole } from "@dragons/shared";
import { teamEntries } from "./team-entries";

/**
 * A staff member of one Team entry — the Hub is the source of truth for people
 * in club roles (ADR 0008). Attached to the entry, not the squad, so staff are
 * per season and carried forward at rollover the way badge color is.
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
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    role: varchar("role", { length: 20 }).notNull().$type<TeamStaffRole>(),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 255 }),
    licence: varchar("licence", { length: 100 }),
    // Object name in the media bucket. The upload endpoint arrives with #310;
    // the column exists now so staff carry-forward has nothing to backfill.
    photoFilename: varchar("photo_filename", { length: 255 }),
    refereeContact: boolean("referee_contact").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    entryIdx: index("team_staff_entry_idx").on(table.teamEntryId),
  }),
);

export type TeamStaff = typeof teamStaff.$inferSelect;
export type NewTeamStaff = typeof teamStaff.$inferInsert;

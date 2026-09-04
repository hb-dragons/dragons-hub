import { pgTable, serial, varchar, timestamp, index } from "drizzle-orm/pg-core";

/**
 * A person the club holds staff contact data on (ADR 0009). One row per human,
 * whatever the number of teams they are attached to — the assignment lives in
 * `team_staff`, the contact data lives here, so correcting a phone number is
 * one write and a coach on two teams has one portrait.
 *
 * Season-independent on purpose: rollover copies assignments, never people.
 */
export const staffPeople = pgTable(
  "staff_people",
  {
    id: serial("id").primaryKey(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 255 }),
    licence: varchar("licence", { length: 100 }),
    /** Object name in the media bucket, owned by the person, not by a team. */
    photoFilename: varchar("photo_filename", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: index("staff_people_name_idx").on(table.lastName, table.firstName),
  }),
);

export type StaffPerson = typeof staffPeople.$inferSelect;
export type NewStaffPerson = typeof staffPeople.$inferInsert;

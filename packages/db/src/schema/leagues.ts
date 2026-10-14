import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { seasons } from "./seasons";

export const leagues = pgTable("leagues", {
  id: serial("id").primaryKey(),
  apiLigaId: integer("api_liga_id").notNull().unique(),
  ligaNr: integer("liga_nr").notNull(),
  name: varchar("name", { length: 150 }).notNull(),
  seasonId: integer("season_id").notNull(),
  seasonName: varchar("season_name", { length: 100 }).notNull(),
  skName: varchar("sk_name", { length: 100 }),
  akName: varchar("ak_name", { length: 100 }),
  geschlecht: varchar("geschlecht", { length: 20 }),
  verbandId: integer("verband_id"),
  verbandName: varchar("verband_name", { length: 100 }),
  seasonRefId: integer("season_ref_id")
    .notNull()
    .references(() => seasons.id),
  vorabliga: boolean("vorabliga").notNull().default(false),
  // A cup (Pokal) runs alongside a squad's regular league in the same season.
  // It never becomes a team entry's league (ADR 0004): seeding and the sync
  // only fall back to a cup when a squad has no other league. The federation
  // does not type its competitions, so this is set by the admin, prefilled
  // from the name. The league sync never writes it.
  isCup: boolean("is_cup").notNull().default(false),
  isActive: boolean("is_active").default(true),
  isTracked: boolean("is_tracked").default(true),
  ownClubRefs: boolean("own_club_refs").default(false),
  dataHash: varchar("data_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;

import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  date,
  time,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { leagues } from "./leagues";
import { venues } from "./venues";
import { teams } from "./teams";

export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    apiMatchId: integer("api_match_id").notNull().unique(),

    // Remote fields (from basketball-bund.net API)
    matchNo: integer("match_no").notNull(),
    matchDay: integer("match_day").notNull(),
    kickoffDate: date("kickoff_date").notNull(),
    kickoffTime: time("kickoff_time").notNull(),
    leagueId: integer("league_id").references(() => leagues.id),
    homeTeamApiId: integer("home_team_api_id").notNull().references(() => teams.apiTeamPermanentId),
    guestTeamApiId: integer("guest_team_api_id").notNull().references(() => teams.apiTeamPermanentId),
    venueId: integer("venue_id").references(() => venues.id),

    // Status flags
    isConfirmed: boolean("is_confirmed").default(false),
    isForfeited: boolean("is_forfeited").default(false),
    isCancelled: boolean("is_cancelled").default(false),

    // Results — scalar scores
    homeScore: integer("home_score"),
    guestScore: integer("guest_score"),
    homeHalftimeScore: integer("home_halftime_score"),
    guestHalftimeScore: integer("guest_halftime_score"),

    // Period format: 'quarters' | 'achtel' | null
    periodFormat: varchar("period_format", { length: 10 }),

    // Per-period delta scores (Q1–Q8 for achtel, Q1–Q4 for quarters)
    homeQ1: integer("home_q1"),
    guestQ1: integer("guest_q1"),
    homeQ2: integer("home_q2"),
    guestQ2: integer("guest_q2"),
    homeQ3: integer("home_q3"),
    guestQ3: integer("guest_q3"),
    homeQ4: integer("home_q4"),
    guestQ4: integer("guest_q4"),
    homeQ5: integer("home_q5"),
    guestQ5: integer("guest_q5"),
    homeQ6: integer("home_q6"),
    guestQ6: integer("guest_q6"),
    homeQ7: integer("home_q7"),
    guestQ7: integer("guest_q7"),
    homeQ8: integer("home_q8"),
    guestQ8: integer("guest_q8"),

    // Per-overtime delta scores
    homeOt1: integer("home_ot1"),
    guestOt1: integer("guest_ot1"),
    homeOt2: integer("home_ot2"),
    guestOt2: integer("guest_ot2"),

    // Display-only venue name override (local-only, not a remote field)
    venueNameOverride: varchar("venue_name_override", { length: 200 }),

    // Kampfgericht (local only)
    anschreiber: varchar("anschreiber", { length: 100 }),
    zeitnehmer: varchar("zeitnehmer", { length: 100 }),
    shotclock: varchar("shotclock", { length: 100 }),

    // Notes
    internalNotes: text("internal_notes"),
    publicComment: text("public_comment"),

    // Versioning + diff
    currentRemoteVersion: integer("current_remote_version").notNull().default(0),
    currentLocalVersion: integer("current_local_version").notNull().default(0),
    remoteDataHash: varchar("remote_data_hash", { length: 64 }),
    lastRemoteSync: timestamp("last_remote_sync", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    leagueKickoffIdx: index("matches_league_kickoff_idx").on(table.leagueId, table.kickoffDate),
    homeTeamIdx: index("matches_home_team_idx").on(table.homeTeamApiId),
    guestTeamIdx: index("matches_guest_team_idx").on(table.guestTeamApiId),
    kickoffDateIdx: index("matches_kickoff_date_idx").on(table.kickoffDate),
  }),
);

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;

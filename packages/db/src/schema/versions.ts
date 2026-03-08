import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { matches } from "./matches";

export const matchRemoteVersions = pgTable(
  "match_remote_versions",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    syncRunId: integer("sync_run_id"),
    snapshot: jsonb("snapshot").notNull().$type<LegacyRemoteSnapshot | CurrentRemoteSnapshot>(),
    dataHash: varchar("data_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    matchVersionUnique: unique("match_remote_versions_unique").on(
      table.matchId,
      table.versionNumber,
    ),
  }),
);

export const matchLocalVersions = pgTable(
  "match_local_versions",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    changedBy: text("changed_by"),
    changeReason: text("change_reason"),
    snapshot: jsonb("snapshot").notNull(),
    dataHash: varchar("data_hash", { length: 64 }).notNull(),
    baseRemoteVersion: integer("base_remote_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    matchVersionUnique: unique("match_local_versions_unique").on(
      table.matchId,
      table.versionNumber,
    ),
  }),
);

export const matchChanges = pgTable(
  "match_changes",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    track: varchar("track", { length: 10 }).notNull().$type<"remote" | "local">(),
    versionNumber: integer("version_number").notNull(),
    fieldName: varchar("field_name", { length: 100 }).notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedBy: text("changed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    matchIdIdx: index("match_changes_match_id_idx").on(table.matchId),
    createdAtIdx: index("match_changes_created_at_idx").on(table.createdAt),
  }),
);

export type MatchRemoteVersion = typeof matchRemoteVersions.$inferSelect;
export type NewMatchRemoteVersion = typeof matchRemoteVersions.$inferInsert;
export type MatchLocalVersion = typeof matchLocalVersions.$inferSelect;
export type NewMatchLocalVersion = typeof matchLocalVersions.$inferInsert;
export type MatchChange = typeof matchChanges.$inferSelect;
export type NewMatchChange = typeof matchChanges.$inferInsert;

/**
 * Legacy remote snapshot format (pre-migration 0005).
 * Old snapshots stored quarterScores/overtimeScores as JSONB objects.
 * These are NOT migrated — read logic must handle both formats.
 */
export interface LegacyRemoteSnapshot {
  matchNo: number;
  matchDay: number;
  kickoffDate: string;
  kickoffTime: string;
  leagueId: number | null;
  homeTeamApiId: number;
  guestTeamApiId: number;
  venueApiId: number | null;
  isConfirmed: boolean;
  isForfeited: boolean;
  isCancelled: boolean;
  homeScore: number | null;
  guestScore: number | null;
  homeHalftimeScore: number | null;
  guestHalftimeScore: number | null;
  quarterScores: Record<string, number | undefined> | null;
  overtimeScores: {
    ot1Home?: number;
    ot1Guest?: number;
    ot2Home?: number;
    ot2Guest?: number;
  } | null;
}

/** Current remote snapshot format (post-migration 0005). Typed period score columns. */
export interface CurrentRemoteSnapshot {
  matchNo: number;
  matchDay: number;
  kickoffDate: string;
  kickoffTime: string;
  leagueId: number | null;
  homeTeamApiId: number;
  guestTeamApiId: number;
  venueApiId: number | null;
  isConfirmed: boolean;
  isForfeited: boolean;
  isCancelled: boolean;
  homeScore: number | null;
  guestScore: number | null;
  homeHalftimeScore: number | null;
  guestHalftimeScore: number | null;
  periodFormat: "quarters" | "achtel" | null;
  homeQ1: number | null;
  guestQ1: number | null;
  homeQ2: number | null;
  guestQ2: number | null;
  homeQ3: number | null;
  guestQ3: number | null;
  homeQ4: number | null;
  guestQ4: number | null;
  homeQ5: number | null;
  guestQ5: number | null;
  homeQ6: number | null;
  guestQ6: number | null;
  homeQ7: number | null;
  guestQ7: number | null;
  homeQ8: number | null;
  guestQ8: number | null;
  homeOt1: number | null;
  guestOt1: number | null;
  homeOt2: number | null;
  guestOt2: number | null;
}

/** Discriminator: check if a snapshot uses the legacy JSONB format */
export function isLegacySnapshot(snapshot: unknown): snapshot is LegacyRemoteSnapshot {
  return snapshot != null
    && typeof snapshot === "object"
    && "quarterScores" in snapshot;
}

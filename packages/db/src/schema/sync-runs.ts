import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  jsonb,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import type {
  SyncRunSummary,
  SyncStatus,
  EntityType,
  EntryAction,
} from "@dragons/shared";
// Re-export SyncRunSummary from shared as the single source of truth
export type { SyncRunSummary } from "@dragons/shared";

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    syncType: varchar("sync_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().$type<SyncStatus>(),
    triggeredBy: varchar("triggered_by", { length: 50 }).notNull(),
    recordsProcessed: integer("records_processed").default(0),
    recordsCreated: integer("records_created").default(0),
    recordsUpdated: integer("records_updated").default(0),
    recordsFailed: integer("records_failed").default(0),
    recordsSkipped: integer("records_skipped").default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    errorStack: text("error_stack"),
    summary: jsonb("summary").$type<SyncRunSummary>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    startedAtIdx: index("sync_runs_started_at_idx").on(table.startedAt),
  }),
);

export const syncRunEntries = pgTable(
  "sync_run_entries",
  {
    id: serial("id").primaryKey(),
    syncRunId: integer("sync_run_id")
      .notNull()
      .references(() => syncRuns.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 20 }).notNull().$type<EntityType>(),
    entityId: varchar("entity_id", { length: 100 }).notNull(),
    entityName: varchar("entity_name", { length: 255 }),
    action: varchar("action", { length: 20 }).notNull().$type<EntryAction>(),
    message: text("message"),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    syncRunEntityIdx: index("sync_run_entries_run_entity_idx").on(
      table.syncRunId,
      table.entityType,
    ),
    syncRunActionIdx: index("sync_run_entries_run_action_idx").on(
      table.syncRunId,
      table.action,
    ),
  }),
);

export const syncSchedule = pgTable("sync_schedule", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  cronExpression: varchar("cron_expression", { length: 100 }).notNull().default("0 4 * * *"),
  timezone: varchar("timezone", { length: 100 }).notNull().default("Europe/Berlin"),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }),
  lastUpdatedBy: varchar("last_updated_by", { length: 255 }),
});

export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;
export type SyncRunEntry = typeof syncRunEntries.$inferSelect;
export type NewSyncRunEntry = typeof syncRunEntries.$inferInsert;
export type SyncSchedule = typeof syncSchedule.$inferSelect;
export type NewSyncSchedule = typeof syncSchedule.$inferInsert;

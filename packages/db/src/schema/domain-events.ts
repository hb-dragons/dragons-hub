import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { syncRuns } from "./sync-runs";

// NOTE: A partial outbox index exists (migration 0040) but cannot be expressed in Drizzle schema.
// If regenerating migrations, manually re-add:
// CREATE INDEX "domain_events_outbox_idx" ON "domain_events" ("created_at") WHERE "processed_at" IS NULL;
export const domainEvents = pgTable(
  "domain_events",
  {
    id: text("id").primaryKey(), // ULID
    type: text("type").notNull(),
    source: text("source").notNull(), // "sync" | "manual" | "reconciliation"
    urgency: text("urgency").notNull(), // "immediate" | "routine"
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    actor: text("actor"),
    syncRunId: integer("sync_run_id").references(() => syncRuns.id),
    entityType: text("entity_type").notNull(), // "match" | "booking" | "referee"
    entityId: integer("entity_id").notNull(),
    entityName: text("entity_name").notNull(),
    deepLinkPath: text("deep_link_path").notNull(),
    // Lease timestamp: set when the outbox poller hands the event to the queue.
    // The poller reclaims rows whose lease has expired and are still unprocessed.
    enqueuedAt: timestamp("enqueued_at", { withTimezone: true }),
    // Set by the event worker once the notification pipeline has run successfully.
    // NULL means "not yet delivered" — the source of truth for at-least-once delivery.
    processedAt: timestamp("processed_at", { withTimezone: true }),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    typeIdx: index("domain_events_type_idx").on(table.type),
    entityIdx: index("domain_events_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
    occurredAtIdx: index("domain_events_occurred_at_idx").on(table.occurredAt),
    syncRunIdx: index("domain_events_sync_run_idx").on(table.syncRunId),
  }),
);

export type DomainEventRow = typeof domainEvents.$inferSelect;
export type DomainEventInsert = typeof domainEvents.$inferInsert;

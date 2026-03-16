import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { syncRuns } from "./sync-runs";

// NOTE: A partial outbox index exists in migration 0019 but cannot be expressed in Drizzle schema.
// If regenerating migrations, manually re-add:
// CREATE INDEX "domain_events_outbox_idx" ON "domain_events" ("enqueued_at") WHERE "enqueued_at" IS NULL;
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
    enqueuedAt: timestamp("enqueued_at", { withTimezone: true }),
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

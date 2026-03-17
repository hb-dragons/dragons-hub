CREATE INDEX IF NOT EXISTS "domain_events_outbox_idx" ON "domain_events" ("enqueued_at") WHERE "enqueued_at" IS NULL;

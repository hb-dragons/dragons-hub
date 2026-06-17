ALTER TABLE "domain_events" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: every row that was already enqueued under the old model is considered
-- delivered, so it is not re-claimed and re-sent on first poll after deploy.
UPDATE "domain_events" SET "processed_at" = "enqueued_at" WHERE "enqueued_at" IS NOT NULL;--> statement-breakpoint
-- The outbox scan is now over unprocessed rows (claimed-but-failed events must stay
-- visible), ordered by created_at. Replace the old enqueued_at-only partial index.
DROP INDEX IF EXISTS "domain_events_outbox_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "domain_events_outbox_idx" ON "domain_events" ("created_at") WHERE "processed_at" IS NULL;

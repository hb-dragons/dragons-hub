ALTER TABLE "sync_schedule" ALTER COLUMN "cron_expression" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sync_schedule" ALTER COLUMN "cron_expression" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_schedule" ADD COLUMN "sync_type" varchar(50) DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_schedule" ADD COLUMN "interval_minutes" integer;--> statement-breakpoint
ALTER TABLE "sync_schedule" ADD CONSTRAINT "sync_schedule_sync_type_unique" UNIQUE("sync_type");--> statement-breakpoint
INSERT INTO "sync_schedule" ("sync_type", "enabled", "cron_expression", "timezone")
VALUES ('full', true, '0 4 * * *', 'Europe/Berlin')
ON CONFLICT ("sync_type") DO NOTHING;--> statement-breakpoint
INSERT INTO "sync_schedule" ("sync_type", "enabled", "interval_minutes", "timezone")
VALUES ('referee-games', true, 30, 'Europe/Berlin')
ON CONFLICT ("sync_type") DO NOTHING;
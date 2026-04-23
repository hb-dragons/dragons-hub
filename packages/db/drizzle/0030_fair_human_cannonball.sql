ALTER TABLE "push_devices" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "push_devices" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_log" ADD COLUMN "provider_ticket_id" text;--> statement-breakpoint
ALTER TABLE "notification_log" ADD COLUMN "provider_receipt_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_log" ADD COLUMN "recipient_token" text;
--> statement-breakpoint
INSERT INTO "channel_configs" ("name", "type", "enabled", "config", "digest_mode", "digest_timezone")
SELECT 'Expo Push', 'push', true, '{"provider":"expo"}'::jsonb, 'immediate', 'Europe/Berlin'
WHERE NOT EXISTS (SELECT 1 FROM "channel_configs" WHERE "type" = 'push');
ALTER TABLE "venue_booking_matches" DROP CONSTRAINT "venue_booking_matches_match_id_matches_id_fk";
--> statement-breakpoint
ALTER TABLE "digest_buffer" DROP CONSTRAINT "digest_buffer_channel_config_id_channel_configs_id_fk";
--> statement-breakpoint
ALTER TABLE "referee_games" DROP CONSTRAINT "referee_games_match_id_matches_id_fk";
--> statement-breakpoint
ALTER TABLE "broadcast_configs" DROP CONSTRAINT "broadcast_configs_match_id_matches_id_fk";
--> statement-breakpoint
DROP INDEX "standings_league_id_idx";--> statement-breakpoint
-- Hand-added backfill: rows written before these columns had a default carry
-- NULL, and `SET NOT NULL` aborts on any of them. NULL always meant "not set",
-- which is what `false` means here.
UPDATE "matches" SET "is_confirmed" = false WHERE "is_confirmed" IS NULL;--> statement-breakpoint
UPDATE "matches" SET "is_forfeited" = false WHERE "is_forfeited" IS NULL;--> statement-breakpoint
UPDATE "matches" SET "is_cancelled" = false WHERE "is_cancelled" IS NULL;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "is_confirmed" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "is_forfeited" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "is_cancelled" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_configs" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venue_booking_matches" ADD CONSTRAINT "venue_booking_matches_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_buffer" ADD CONSTRAINT "digest_buffer_channel_config_id_channel_configs_id_fk" FOREIGN KEY ("channel_config_id") REFERENCES "public"."channel_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referee_games" ADD CONSTRAINT "referee_games_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_configs" ADD CONSTRAINT "broadcast_configs_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "standings_team_api_id_idx" ON "standings" USING btree ("team_api_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channel_configs_deleted_at_idx" ON "channel_configs" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "notification_log_channel_config_idx" ON "notification_log" USING btree ("channel_config_id");--> statement-breakpoint
CREATE INDEX "broadcast_configs_match_id_idx" ON "broadcast_configs" USING btree ("match_id");
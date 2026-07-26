ALTER TABLE "match_referees" DROP CONSTRAINT "match_referees_slot_unique";--> statement-breakpoint
ALTER TABLE "match_referees" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referee_games" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "match_referees_slot_unique" ON "match_referees" USING btree ("match_id","slot_number") WHERE "match_referees"."removed_at" is null;
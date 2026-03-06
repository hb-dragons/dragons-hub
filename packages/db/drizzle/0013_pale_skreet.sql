ALTER TABLE "match_referees" DROP CONSTRAINT "match_referees_unique";--> statement-breakpoint
-- Clear existing assignments (they'll be re-populated by next sync with correct slot numbers)
DELETE FROM "match_referees";--> statement-breakpoint
ALTER TABLE "match_referees" ADD COLUMN "slot_number" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "match_referees" ADD CONSTRAINT "match_referees_slot_unique" UNIQUE("match_id","slot_number");

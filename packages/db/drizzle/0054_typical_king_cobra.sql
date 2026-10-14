ALTER TABLE "leagues" ADD COLUMN "is_cup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Leagues tracked before the flag existed: prefill from the name, the same
-- rule the admin picker uses (ADR 0004).
UPDATE "leagues" SET "is_cup" = true WHERE "name" ILIKE '%pokal%' OR "sk_name" ILIKE '%pokal%';

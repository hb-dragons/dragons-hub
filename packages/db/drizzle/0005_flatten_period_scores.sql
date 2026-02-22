-- Migration: Flatten JSONB period scores into typed columns, replace local_* overrides with match_overrides table

-- ============================================================
-- 1. CREATE match_overrides TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS "match_overrides" (
  "id" serial PRIMARY KEY NOT NULL,
  "match_id" integer NOT NULL,
  "field_name" varchar(100) NOT NULL,
  "reason" text,
  "changed_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "match_overrides_match_field_unique" UNIQUE("match_id","field_name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_overrides_match_id_idx" ON "match_overrides" USING btree ("match_id");
--> statement-breakpoint
ALTER TABLE "match_overrides" ADD CONSTRAINT "match_overrides_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;

-- ============================================================
-- 2. ADD NEW COLUMNS to matches
-- ============================================================
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "period_format" varchar(10);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_q1" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "guest_q1" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_q2" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "guest_q2" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_q3" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "guest_q3" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_q4" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "guest_q4" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_q5" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "guest_q5" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_q6" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "guest_q6" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_q7" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "guest_q7" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_q8" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "guest_q8" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_ot1" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "guest_ot1" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_ot2" integer;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "guest_ot2" integer;

-- ============================================================
-- 3. DATA MIGRATION: Convert cumulative JSONB → delta columns
-- ============================================================

-- 3a. Set period format
--> statement-breakpoint
UPDATE matches SET period_format = CASE
  WHEN quarter_scores ? 'v5Home' THEN 'achtel'
  WHEN quarter_scores ? 'q1Home' THEN 'quarters'
  ELSE NULL
END WHERE quarter_scores IS NOT NULL;

-- 3b. Convert standard quarters (cumulative → delta)
--> statement-breakpoint
UPDATE matches SET
  home_q1  = (quarter_scores->>'q1Home')::int,
  guest_q1 = (quarter_scores->>'q1Guest')::int,
  home_q2  = (quarter_scores->>'q2Home')::int - (quarter_scores->>'q1Home')::int,
  guest_q2 = (quarter_scores->>'q2Guest')::int - (quarter_scores->>'q1Guest')::int,
  home_q3  = (quarter_scores->>'q3Home')::int - (quarter_scores->>'q2Home')::int,
  guest_q3 = (quarter_scores->>'q3Guest')::int - (quarter_scores->>'q2Guest')::int,
  home_q4  = (quarter_scores->>'q4Home')::int - (quarter_scores->>'q3Home')::int,
  guest_q4 = (quarter_scores->>'q4Guest')::int - (quarter_scores->>'q3Guest')::int
WHERE period_format = 'quarters';

-- 3c. Convert achtel format (cumulative → delta, q1-q8)
--> statement-breakpoint
UPDATE matches SET
  home_q1  = (quarter_scores->>'v1Home')::int,
  guest_q1 = (quarter_scores->>'v1Guest')::int,
  home_q2  = (quarter_scores->>'v2Home')::int - (quarter_scores->>'v1Home')::int,
  guest_q2 = (quarter_scores->>'v2Guest')::int - (quarter_scores->>'v1Guest')::int,
  home_q3  = (quarter_scores->>'v3Home')::int - (quarter_scores->>'v2Home')::int,
  guest_q3 = (quarter_scores->>'v3Guest')::int - (quarter_scores->>'v2Guest')::int,
  home_q4  = (quarter_scores->>'v4Home')::int - (quarter_scores->>'v3Home')::int,
  guest_q4 = (quarter_scores->>'v4Guest')::int - (quarter_scores->>'v3Guest')::int,
  home_q5  = (quarter_scores->>'v5Home')::int - (quarter_scores->>'v4Home')::int,
  guest_q5 = (quarter_scores->>'v5Guest')::int - (quarter_scores->>'v4Guest')::int,
  home_q6  = (quarter_scores->>'v6Home')::int - (quarter_scores->>'v5Home')::int,
  guest_q6 = (quarter_scores->>'v6Guest')::int - (quarter_scores->>'v5Guest')::int,
  home_q7  = (quarter_scores->>'v7Home')::int - (quarter_scores->>'v6Home')::int,
  guest_q7 = (quarter_scores->>'v7Guest')::int - (quarter_scores->>'v6Guest')::int,
  home_q8  = (quarter_scores->>'v8Home')::int - (quarter_scores->>'v7Home')::int,
  guest_q8 = (quarter_scores->>'v8Guest')::int - (quarter_scores->>'v7Guest')::int
WHERE period_format = 'achtel';

-- 3d. Convert overtime (cumulative → per-OT delta)
--> statement-breakpoint
UPDATE matches SET
  home_ot1  = (overtime_scores->>'ot1Home')::int
              - CASE WHEN period_format = 'achtel'
                  THEN (quarter_scores->>'v8Home')::int
                  ELSE (quarter_scores->>'q4Home')::int END,
  guest_ot1 = (overtime_scores->>'ot1Guest')::int
              - CASE WHEN period_format = 'achtel'
                  THEN (quarter_scores->>'v8Guest')::int
                  ELSE (quarter_scores->>'q4Guest')::int END,
  home_ot2  = (overtime_scores->>'ot2Home')::int - (overtime_scores->>'ot1Home')::int,
  guest_ot2 = (overtime_scores->>'ot2Guest')::int - (overtime_scores->>'ot1Guest')::int
WHERE overtime_scores IS NOT NULL AND quarter_scores IS NOT NULL;

-- ============================================================
-- 4. MIGRATE LOCAL OVERRIDES → match_overrides rows
-- ============================================================

-- 4a. Insert override rows for each non-null local_* column
--> statement-breakpoint
INSERT INTO match_overrides (match_id, field_name, changed_by, created_at, updated_at)
SELECT id, 'kickoffDate', 'migration', NOW(), NOW()
FROM matches WHERE local_kickoff_date IS NOT NULL;
--> statement-breakpoint
INSERT INTO match_overrides (match_id, field_name, changed_by, created_at, updated_at)
SELECT id, 'kickoffTime', 'migration', NOW(), NOW()
FROM matches WHERE local_kickoff_time IS NOT NULL;
--> statement-breakpoint
INSERT INTO match_overrides (match_id, field_name, changed_by, created_at, updated_at)
SELECT id, 'isForfeited', 'migration', NOW(), NOW()
FROM matches WHERE local_is_forfeited IS NOT NULL;
--> statement-breakpoint
INSERT INTO match_overrides (match_id, field_name, changed_by, created_at, updated_at)
SELECT id, 'isCancelled', 'migration', NOW(), NOW()
FROM matches WHERE local_is_cancelled IS NOT NULL;

-- 4b. Copy local override values into main columns
--> statement-breakpoint
UPDATE matches SET
  kickoff_date = COALESCE(local_kickoff_date, kickoff_date),
  kickoff_time = COALESCE(local_kickoff_time, kickoff_time),
  is_forfeited = COALESCE(local_is_forfeited, is_forfeited),
  is_cancelled = COALESCE(local_is_cancelled, is_cancelled)
WHERE local_kickoff_date IS NOT NULL
   OR local_kickoff_time IS NOT NULL
   OR local_is_forfeited IS NOT NULL
   OR local_is_cancelled IS NOT NULL;

-- ============================================================
-- 5. RENAME local_venue_override → venue_name_override
-- ============================================================
--> statement-breakpoint
ALTER TABLE "matches" RENAME COLUMN "local_venue_override" TO "venue_name_override";

-- ============================================================
-- 6. DROP OLD COLUMNS
-- ============================================================
--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN IF EXISTS "quarter_scores";
--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN IF EXISTS "overtime_scores";
--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN IF EXISTS "boxscore";
--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN IF EXISTS "top_performances";
--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN IF EXISTS "play_by_play";
--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN IF EXISTS "local_kickoff_date";
--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN IF EXISTS "local_kickoff_time";
--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN IF EXISTS "local_is_forfeited";
--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN IF EXISTS "local_is_cancelled";

CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"sdk_season_id" integer,
	"status" varchar(20) NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "season_ref_id" integer;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "vorabliga" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: one season per distinct season_name, newest becomes the active one.
--
-- The grouping key is materialised into a temporary column rather than repeated
-- as an expression in both the INSERT and the UPDATE. Two things it has to
-- survive, both of which broke an earlier version of this backfill:
--
--   * `season_name` is NOT NULL but may be an empty string. Such a group cannot
--     borrow the empty name — `seasons.name` is NOT NULL — so it is labelled
--     from the legacy SDK season id instead.
--   * Two season-name groups can share the same max(season_id). Picking "active"
--     with `WHERE sdk_season_id = max(season_id)` then marked both active and
--     the partial unique index below aborted the whole migration. row_number()
--     picks exactly one, with season_id descending and the key as a stable
--     tiebreak.
ALTER TABLE "leagues" ADD COLUMN "season_group_key" varchar(100);--> statement-breakpoint
UPDATE "leagues"
SET "season_group_key" = coalesce(nullif(btrim("season_name"), ''), 'Season ' || "season_id"::text);--> statement-breakpoint
INSERT INTO "seasons" ("name", "sdk_season_id", "status")
SELECT g.season_group_key, g.sdk_season_id,
       CASE WHEN g.rn = 1 THEN 'active' ELSE 'archived' END
FROM (
  SELECT "season_group_key",
         max("season_id") AS sdk_season_id,
         row_number() OVER (
           ORDER BY max("season_id") DESC, "season_group_key" DESC
         ) AS rn
  FROM "leagues"
  GROUP BY "season_group_key"
) g;--> statement-breakpoint
UPDATE "leagues" l SET "season_ref_id" = s.id
FROM "seasons" s WHERE s.name = l."season_group_key";--> statement-breakpoint
ALTER TABLE "leagues" DROP COLUMN "season_group_key";--> statement-breakpoint
ALTER TABLE "leagues" ALTER COLUMN "season_ref_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_active_uniq" ON "seasons" USING btree ("status") WHERE "seasons"."status" = 'active';--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_season_ref_id_seasons_id_fk" FOREIGN KEY ("season_ref_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;

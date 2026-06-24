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
-- Backfill: one season per distinct season_name; newest (max legacy season_id) is active.
-- Reads the legacy "season_id" (SDK integer), writes the new FK "season_ref_id".
INSERT INTO "seasons" ("name", "sdk_season_id", "status")
SELECT g.season_name, g.sdk_season_id,
       CASE WHEN g.sdk_season_id = (
              SELECT max(season_id) FROM "leagues"
            ) THEN 'active' ELSE 'archived' END
FROM (
  SELECT season_name, max(season_id) AS sdk_season_id
  FROM "leagues" GROUP BY season_name
) g;--> statement-breakpoint
UPDATE "leagues" l SET "season_ref_id" = s.id
FROM "seasons" s WHERE s.name = l.season_name;--> statement-breakpoint
ALTER TABLE "leagues" ALTER COLUMN "season_ref_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_season_ref_id_seasons_id_fk" FOREIGN KEY ("season_ref_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_active_uniq" ON "seasons" ("status")
  WHERE "status" = 'active';
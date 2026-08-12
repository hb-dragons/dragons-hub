CREATE TABLE "team_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"league_id" integer,
	"link_source" varchar(10) DEFAULT 'seeded' NOT NULL,
	"custom_name" varchar(50),
	"badge_color" varchar(20),
	"estimated_game_duration" integer,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_entries_team_season_unique" UNIQUE("team_id","season_id")
);
--> statement-breakpoint
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entries_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entries_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_entries_season_order_idx" ON "team_entries" USING btree ("season_id","display_order");
--> statement-breakpoint
-- Backfill (spec 2026-08-12-team-entries-design.md):
-- 1) one entry per own-club squad per season from standings evidence,
--    preferring a committed league over a vorabliga (false < true in ASC order);
-- 2) supplement from match participation for squads a league table does not
--    list yet (early-season leagues: schedule published, table empty);
-- 3) copy club-facing fields onto the ACTIVE season's entries;
-- 4) copy color/duration/order (never custom_name) onto UPCOMING entries.
INSERT INTO "team_entries" ("team_id", "season_id", "league_id", "link_source")
SELECT DISTINCT ON (t.id, l.season_ref_id)
       t.id, l.season_ref_id, l.id, 'seeded'
FROM "teams" t
JOIN "standings" s ON s.team_api_id = t.api_team_permanent_id
JOIN "leagues" l ON l.id = s.league_id
WHERE t.is_own_club = true
ORDER BY t.id, l.season_ref_id, l.vorabliga ASC, l.id ASC;--> statement-breakpoint
INSERT INTO "team_entries" ("team_id", "season_id", "league_id", "link_source")
SELECT DISTINCT ON (t.id, l.season_ref_id)
       t.id, l.season_ref_id, l.id, 'seeded'
FROM "teams" t
JOIN "matches" m
  ON m.home_team_api_id = t.api_team_permanent_id
  OR m.guest_team_api_id = t.api_team_permanent_id
JOIN "leagues" l ON l.id = m.league_id
WHERE t.is_own_club = true
ORDER BY t.id, l.season_ref_id, l.vorabliga ASC, l.id ASC
ON CONFLICT ("team_id", "season_id") DO NOTHING;--> statement-breakpoint
UPDATE "team_entries" te
SET "custom_name" = t.custom_name,
    "badge_color" = t.badge_color,
    "estimated_game_duration" = t.estimated_game_duration,
    "display_order" = t.display_order
FROM "teams" t, "seasons" se
WHERE te.team_id = t.id AND te.season_id = se.id AND se.status = 'active';--> statement-breakpoint
UPDATE "team_entries" te
SET "badge_color" = t.badge_color,
    "estimated_game_duration" = t.estimated_game_duration,
    "display_order" = t.display_order
FROM "teams" t, "seasons" se
WHERE te.team_id = t.id AND te.season_id = se.id AND se.status = 'upcoming';
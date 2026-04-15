ALTER TABLE "referee_games" ADD COLUMN "league_api_id" integer;--> statement-breakpoint
ALTER TABLE "referee_games" ADD COLUMN "own_club_refs" boolean DEFAULT false NOT NULL;
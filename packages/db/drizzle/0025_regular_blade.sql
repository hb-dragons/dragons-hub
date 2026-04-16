ALTER TABLE "referees" ADD COLUMN "allow_all_home_games" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "referees" ADD COLUMN "allow_away_games" boolean DEFAULT false NOT NULL;
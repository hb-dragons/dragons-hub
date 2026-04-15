ALTER TABLE "referee_games" ADD COLUMN "is_home_game" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "referee_games" ADD COLUMN "is_guest_game" boolean DEFAULT false NOT NULL;
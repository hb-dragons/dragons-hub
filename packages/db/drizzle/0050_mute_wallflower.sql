ALTER TABLE "referee_games" ADD COLUMN "venue_street" varchar(200);--> statement-breakpoint
ALTER TABLE "referee_games" ADD COLUMN "venue_postal_code" varchar(10);--> statement-breakpoint
ALTER TABLE "referee_games" ADD COLUMN "sr1_tentative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "referee_games" ADD COLUMN "sr2_tentative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "referee_games" ADD COLUMN "venue_changed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "referee_games" ADD COLUMN "time_changed" boolean DEFAULT false NOT NULL;
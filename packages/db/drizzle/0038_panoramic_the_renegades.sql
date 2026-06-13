ALTER TABLE "live_scoreboards" ALTER COLUMN "shot_clock" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "live_scoreboards" ALTER COLUMN "shot_clock" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scoreboard_snapshots" ALTER COLUMN "shot_clock" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "live_scoreboards" ADD COLUMN "shot_clock_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "live_scoreboards" ADD COLUMN "shot_clock_running" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scoreboard_snapshots" ADD COLUMN "shot_clock_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scoreboard_snapshots" ADD COLUMN "shot_clock_running" boolean DEFAULT false NOT NULL;
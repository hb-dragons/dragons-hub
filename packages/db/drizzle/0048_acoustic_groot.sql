DROP INDEX "teams_own_order_idx";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "custom_name";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "estimated_game_duration";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "badge_color";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "display_order";
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_match_id_matches_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_venue_booking_id_venue_bookings_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_related_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_related_booking_id_venue_bookings_id_fk";
--> statement-breakpoint
DROP INDEX "tasks_match_id_idx";--> statement-breakpoint
DROP INDEX "tasks_venue_booking_idx";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "match_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "venue_booking_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "source_type";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "source_detail";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "related_task_id";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "related_booking_id";
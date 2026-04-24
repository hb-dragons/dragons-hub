ALTER TABLE "tasks" ADD COLUMN "lead_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_notification_preferences" DROP COLUMN "notify_on_task_assigned";--> statement-breakpoint
ALTER TABLE "user_notification_preferences" DROP COLUMN "notify_on_booking_needs_action";--> statement-breakpoint
ALTER TABLE "user_notification_preferences" DROP COLUMN "notify_on_task_comment";
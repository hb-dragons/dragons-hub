ALTER TABLE "sync_runs" ADD COLUMN "failed_step" varchar(40);--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "owner_instance_id" varchar(40);
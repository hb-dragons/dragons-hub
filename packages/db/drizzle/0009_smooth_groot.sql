ALTER TABLE "referee_roles" ADD COLUMN "data_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "referee_roles" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
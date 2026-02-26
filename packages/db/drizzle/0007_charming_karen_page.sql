CREATE TABLE "venue_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer NOT NULL,
	"date" date NOT NULL,
	"calculated_start_time" time NOT NULL,
	"calculated_end_time" time NOT NULL,
	"override_start_time" time,
	"override_end_time" time,
	"override_reason" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"needs_reconfirmation" boolean DEFAULT false NOT NULL,
	"notes" text,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_booking_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_booking_id" integer NOT NULL,
	"match_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_columns" (
	"id" serial PRIMARY KEY NOT NULL,
	"board_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"color" varchar(7),
	"is_done_column" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"label" varchar(200) NOT NULL,
	"is_checked" boolean DEFAULT false NOT NULL,
	"checked_by" text,
	"checked_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"board_id" integer NOT NULL,
	"column_id" integer NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"assignee_id" text,
	"priority" varchar(10) DEFAULT 'normal' NOT NULL,
	"due_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"match_id" integer,
	"venue_booking_id" integer,
	"source_type" varchar(20) DEFAULT 'manual' NOT NULL,
	"source_detail" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"channel" varchar(20) NOT NULL,
	"title" varchar(300) NOT NULL,
	"body" text NOT NULL,
	"related_task_id" integer,
	"related_booking_id" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"whatsapp_enabled" boolean DEFAULT false NOT NULL,
	"whatsapp_number" varchar(20),
	"notify_on_task_assigned" boolean DEFAULT true NOT NULL,
	"notify_on_booking_needs_action" boolean DEFAULT true NOT NULL,
	"notify_on_task_comment" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "estimated_game_duration" integer;--> statement-breakpoint
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_booking_matches" ADD CONSTRAINT "venue_booking_matches_venue_booking_id_venue_bookings_id_fk" FOREIGN KEY ("venue_booking_id") REFERENCES "public"."venue_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_booking_matches" ADD CONSTRAINT "venue_booking_matches_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_id_board_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."board_columns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_venue_booking_id_venue_bookings_id_fk" FOREIGN KEY ("venue_booking_id") REFERENCES "public"."venue_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_task_id_tasks_id_fk" FOREIGN KEY ("related_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_booking_id_venue_bookings_id_fk" FOREIGN KEY ("related_booking_id") REFERENCES "public"."venue_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_bookings_venue_date_uniq" ON "venue_bookings" USING btree ("venue_id","date");--> statement-breakpoint
CREATE INDEX "venue_bookings_date_idx" ON "venue_bookings" USING btree ("date");--> statement-breakpoint
CREATE INDEX "venue_bookings_status_idx" ON "venue_bookings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_booking_matches_uniq" ON "venue_booking_matches" USING btree ("venue_booking_id","match_id");--> statement-breakpoint
CREATE INDEX "venue_booking_matches_match_idx" ON "venue_booking_matches" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "board_columns_board_id_idx" ON "board_columns" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "task_checklist_items_task_id_idx" ON "task_checklist_items" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_comments_task_id_idx" ON "task_comments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_board_id_idx" ON "tasks" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "tasks_column_id_idx" ON "tasks" USING btree ("column_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "tasks_match_id_idx" ON "tasks" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "tasks_venue_booking_idx" ON "tasks" USING btree ("venue_booking_id");--> statement-breakpoint
CREATE INDEX "tasks_due_date_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");
CREATE TABLE "domain_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"urgency" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor" text,
	"sync_run_id" integer,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"entity_name" text NOT NULL,
	"deep_link_path" text NOT NULL,
	"enqueued_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"event_types" text[] NOT NULL,
	"filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"urgency_override" text,
	"template_override" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"digest_mode" text DEFAULT 'per_sync' NOT NULL,
	"digest_cron" text,
	"digest_timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"watch_rule_id" integer,
	"channel_config_id" integer NOT NULL,
	"recipient_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"locale" text DEFAULT 'de' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"digest_run_id" integer,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest_buffer" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"channel_config_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD COLUMN "locale" text DEFAULT 'de' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD COLUMN "muted_event_types" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_watch_rule_id_watch_rules_id_fk" FOREIGN KEY ("watch_rule_id") REFERENCES "public"."watch_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_channel_config_id_channel_configs_id_fk" FOREIGN KEY ("channel_config_id") REFERENCES "public"."channel_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_buffer" ADD CONSTRAINT "digest_buffer_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_buffer" ADD CONSTRAINT "digest_buffer_channel_config_id_channel_configs_id_fk" FOREIGN KEY ("channel_config_id") REFERENCES "public"."channel_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_events_type_idx" ON "domain_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "domain_events_entity_idx" ON "domain_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "domain_events_occurred_at_idx" ON "domain_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "domain_events_sync_run_idx" ON "domain_events" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "notification_log_status_idx" ON "notification_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_log_recipient_idx" ON "notification_log" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "notification_log_digest_run_idx" ON "notification_log" USING btree ("digest_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "digest_buffer_event_channel_idx" ON "digest_buffer" USING btree ("event_id","channel_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_log_dedup_idx" ON "notification_log" ("event_id", "channel_config_id", COALESCE("recipient_id", '__group__'));
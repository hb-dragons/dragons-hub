CREATE TABLE "broadcast_configs" (
	"device_id" text PRIMARY KEY NOT NULL,
	"match_id" integer,
	"is_live" boolean DEFAULT false NOT NULL,
	"home_abbr" varchar(8),
	"guest_abbr" varchar(8),
	"home_color_override" varchar(20),
	"guest_color_override" varchar(20),
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcast_configs" ADD CONSTRAINT "broadcast_configs_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;
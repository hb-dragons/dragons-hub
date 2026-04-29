CREATE TABLE "live_scoreboards" (
	"device_id" text PRIMARY KEY NOT NULL,
	"score_home" integer DEFAULT 0 NOT NULL,
	"score_guest" integer DEFAULT 0 NOT NULL,
	"fouls_home" integer DEFAULT 0 NOT NULL,
	"fouls_guest" integer DEFAULT 0 NOT NULL,
	"timeouts_home" integer DEFAULT 0 NOT NULL,
	"timeouts_guest" integer DEFAULT 0 NOT NULL,
	"period" integer DEFAULT 0 NOT NULL,
	"clock_text" text DEFAULT '' NOT NULL,
	"clock_seconds" integer,
	"clock_running" boolean DEFAULT false NOT NULL,
	"shot_clock" integer DEFAULT 0 NOT NULL,
	"timeout_active" boolean DEFAULT false NOT NULL,
	"timeout_duration" text DEFAULT '' NOT NULL,
	"panel_name" text,
	"last_frame_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoreboard_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"score_home" integer NOT NULL,
	"score_guest" integer NOT NULL,
	"fouls_home" integer NOT NULL,
	"fouls_guest" integer NOT NULL,
	"timeouts_home" integer NOT NULL,
	"timeouts_guest" integer NOT NULL,
	"period" integer NOT NULL,
	"clock_text" text NOT NULL,
	"clock_seconds" integer,
	"clock_running" boolean NOT NULL,
	"shot_clock" integer NOT NULL,
	"timeout_active" boolean NOT NULL,
	"timeout_duration" text NOT NULL,
	"raw_hex" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "scoreboard_snapshots_device_captured_idx" ON "scoreboard_snapshots" USING btree ("device_id","captured_at");
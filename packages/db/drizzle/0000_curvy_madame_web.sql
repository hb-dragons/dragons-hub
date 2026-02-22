CREATE TABLE "leagues" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_liga_id" integer NOT NULL,
	"liga_nr" integer NOT NULL,
	"name" varchar(150) NOT NULL,
	"season_id" integer NOT NULL,
	"season_name" varchar(100) NOT NULL,
	"sk_name" varchar(100),
	"ak_name" varchar(100),
	"geschlecht" varchar(20),
	"verband_id" integer,
	"verband_name" varchar(100),
	"is_active" boolean DEFAULT true,
	"is_tracked" boolean DEFAULT true,
	"data_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leagues_api_liga_id_unique" UNIQUE("api_liga_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_team_permanent_id" integer NOT NULL,
	"season_team_id" integer NOT NULL,
	"team_competition_id" integer NOT NULL,
	"name" varchar(150) NOT NULL,
	"name_short" varchar(100),
	"club_id" integer NOT NULL,
	"is_own_club" boolean DEFAULT false,
	"verzicht" boolean DEFAULT false,
	"data_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_api_team_permanent_id_unique" UNIQUE("api_team_permanent_id")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"street" varchar(200),
	"postal_code" varchar(10),
	"city" varchar(100),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"data_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_api_id_unique" UNIQUE("api_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_match_id" integer NOT NULL,
	"match_no" integer NOT NULL,
	"match_day" integer NOT NULL,
	"kickoff_date" date NOT NULL,
	"kickoff_time" time NOT NULL,
	"league_id" integer,
	"home_team_api_id" integer NOT NULL,
	"guest_team_api_id" integer NOT NULL,
	"venue_id" integer,
	"is_confirmed" boolean DEFAULT false,
	"is_forfeited" boolean DEFAULT false,
	"is_cancelled" boolean DEFAULT false,
	"home_score" integer,
	"guest_score" integer,
	"home_halftime_score" integer,
	"guest_halftime_score" integer,
	"quarter_scores" jsonb,
	"overtime_scores" jsonb,
	"boxscore" jsonb,
	"top_performances" jsonb,
	"play_by_play" jsonb,
	"local_kickoff_date" date,
	"local_kickoff_time" time,
	"local_venue_override" varchar(200),
	"local_is_forfeited" boolean,
	"local_is_cancelled" boolean,
	"anschreiber" varchar(100),
	"zeitnehmer" varchar(100),
	"shotclock" varchar(100),
	"internal_notes" text,
	"public_comment" text,
	"current_remote_version" integer DEFAULT 0 NOT NULL,
	"current_local_version" integer DEFAULT 0 NOT NULL,
	"remote_data_hash" varchar(64),
	"last_remote_sync" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_api_match_id_unique" UNIQUE("api_match_id")
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"team_api_id" integer NOT NULL,
	"position" integer NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"won" integer DEFAULT 0 NOT NULL,
	"lost" integer DEFAULT 0 NOT NULL,
	"points_for" integer DEFAULT 0 NOT NULL,
	"points_against" integer DEFAULT 0 NOT NULL,
	"points_diff" integer DEFAULT 0 NOT NULL,
	"league_points" integer DEFAULT 0 NOT NULL,
	"data_hash" varchar(64),
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standings_league_team_unique" UNIQUE("league_id","team_api_id")
);
--> statement-breakpoint
CREATE TABLE "match_referees" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"referee_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_referees_unique" UNIQUE("match_id","referee_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "referee_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"short_name" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referee_roles_api_id_unique" UNIQUE("api_id")
);
--> statement-breakpoint
CREATE TABLE "referees" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_id" integer NOT NULL,
	"first_name" varchar(100),
	"last_name" varchar(100),
	"license_number" integer,
	"data_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referees_api_id_unique" UNIQUE("api_id")
);
--> statement-breakpoint
CREATE TABLE "match_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"track" varchar(10) NOT NULL,
	"version_number" integer NOT NULL,
	"field_name" varchar(100) NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_local_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"changed_by" text,
	"change_reason" text,
	"snapshot" jsonb NOT NULL,
	"data_hash" varchar(64) NOT NULL,
	"base_remote_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_local_versions_unique" UNIQUE("match_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "match_remote_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"sync_run_id" integer,
	"snapshot" jsonb NOT NULL,
	"data_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_remote_versions_unique" UNIQUE("match_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "sync_run_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_run_id" integer NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" varchar(100) NOT NULL,
	"entity_name" varchar(255),
	"action" varchar(20) NOT NULL,
	"message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_type" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"triggered_by" varchar(50) NOT NULL,
	"records_processed" integer DEFAULT 0,
	"records_created" integer DEFAULT 0,
	"records_updated" integer DEFAULT 0,
	"records_failed" integer DEFAULT 0,
	"records_skipped" integer DEFAULT 0,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"error_message" text,
	"error_stack" text,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_referees" ADD CONSTRAINT "match_referees_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_referees" ADD CONSTRAINT "match_referees_referee_id_referees_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."referees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_referees" ADD CONSTRAINT "match_referees_role_id_referee_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."referee_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_changes" ADD CONSTRAINT "match_changes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_local_versions" ADD CONSTRAINT "match_local_versions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_remote_versions" ADD CONSTRAINT "match_remote_versions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run_entries" ADD CONSTRAINT "sync_run_entries_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teams_club_id_idx" ON "teams" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "matches_league_kickoff_idx" ON "matches" USING btree ("league_id","kickoff_date");--> statement-breakpoint
CREATE INDEX "matches_home_team_idx" ON "matches" USING btree ("home_team_api_id");--> statement-breakpoint
CREATE INDEX "matches_guest_team_idx" ON "matches" USING btree ("guest_team_api_id");--> statement-breakpoint
CREATE INDEX "matches_kickoff_date_idx" ON "matches" USING btree ("kickoff_date");--> statement-breakpoint
CREATE INDEX "standings_league_id_idx" ON "standings" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "match_referees_match_id_idx" ON "match_referees" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_referees_referee_id_idx" ON "match_referees" USING btree ("referee_id");--> statement-breakpoint
CREATE INDEX "match_changes_match_id_idx" ON "match_changes" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_changes_created_at_idx" ON "match_changes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sync_run_entries_run_entity_idx" ON "sync_run_entries" USING btree ("sync_run_id","entity_type");--> statement-breakpoint
CREATE INDEX "sync_run_entries_run_action_idx" ON "sync_run_entries" USING btree ("sync_run_id","action");
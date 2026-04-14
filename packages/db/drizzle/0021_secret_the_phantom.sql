CREATE TABLE "referee_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_match_id" integer NOT NULL,
	"match_id" integer,
	"match_no" integer NOT NULL,
	"kickoff_date" date NOT NULL,
	"kickoff_time" time NOT NULL,
	"home_team_name" varchar(200) NOT NULL,
	"guest_team_name" varchar(200) NOT NULL,
	"league_name" varchar(200),
	"league_short" varchar(50),
	"venue_name" varchar(200),
	"venue_city" varchar(100),
	"sr1_our_club" boolean NOT NULL,
	"sr2_our_club" boolean NOT NULL,
	"sr1_name" varchar(150),
	"sr2_name" varchar(150),
	"sr1_referee_api_id" integer,
	"sr2_referee_api_id" integer,
	"sr1_status" varchar(20) DEFAULT 'open' NOT NULL,
	"sr2_status" varchar(20) DEFAULT 'open' NOT NULL,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"is_forfeited" boolean DEFAULT false NOT NULL,
	"home_club_id" integer,
	"guest_club_id" integer,
	"data_hash" varchar(64),
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referee_games_api_match_id_unique" UNIQUE("api_match_id")
);
--> statement-breakpoint
ALTER TABLE "channel_configs" ALTER COLUMN "config" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "referee_games" ADD CONSTRAINT "referee_games_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referee_games_match_id_idx" ON "referee_games" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "referee_games_kickoff_date_idx" ON "referee_games" USING btree ("kickoff_date");
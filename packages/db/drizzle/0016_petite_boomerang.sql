CREATE TABLE "referee_assignment_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"referee_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"allow_sr1" boolean DEFAULT false NOT NULL,
	"allow_sr2" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referee_assignment_rules_referee_team_unique" UNIQUE("referee_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "referee_assignment_rules" ADD CONSTRAINT "referee_assignment_rules_referee_id_referees_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."referees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referee_assignment_rules" ADD CONSTRAINT "referee_assignment_rules_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
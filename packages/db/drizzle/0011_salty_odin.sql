CREATE TABLE "referee_assignment_intents" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"referee_id" integer NOT NULL,
	"slot_number" smallint NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referee_intent_unique" UNIQUE("match_id","referee_id","slot_number")
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "sr1_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "sr2_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "sr3_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "referee_id" integer;--> statement-breakpoint
ALTER TABLE "referee_assignment_intents" ADD CONSTRAINT "referee_assignment_intents_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referee_assignment_intents" ADD CONSTRAINT "referee_assignment_intents_referee_id_referees_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."referees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referee_intent_match_id_idx" ON "referee_assignment_intents" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "referee_intent_referee_id_idx" ON "referee_assignment_intents" USING btree ("referee_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_referee_id_referees_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."referees"("id") ON DELETE no action ON UPDATE no action;
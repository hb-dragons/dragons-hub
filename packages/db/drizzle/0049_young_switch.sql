CREATE TABLE "team_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_entry_id" integer NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"role" varchar(20) NOT NULL,
	"phone" varchar(50),
	"email" varchar(255),
	"licence" varchar(100),
	"photo_filename" varchar(255),
	"referee_contact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_team_entry_id_team_entries_id_fk" FOREIGN KEY ("team_entry_id") REFERENCES "public"."team_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_staff_entry_idx" ON "team_staff" USING btree ("team_entry_id");
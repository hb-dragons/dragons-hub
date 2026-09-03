ALTER TABLE "user" ADD COLUMN "staff_id" integer;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_staff_id_team_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."team_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_staff_id_unique" UNIQUE("staff_id");
ALTER TABLE "user" DROP CONSTRAINT "user_staff_id_unique";--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_staff_id_team_staff_id_fk";
--> statement-breakpoint
ALTER TABLE "team_staff" ALTER COLUMN "person_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "team_staff" DROP COLUMN "first_name";--> statement-breakpoint
ALTER TABLE "team_staff" DROP COLUMN "last_name";--> statement-breakpoint
ALTER TABLE "team_staff" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "team_staff" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "team_staff" DROP COLUMN "licence";--> statement-breakpoint
ALTER TABLE "team_staff" DROP COLUMN "photo_filename";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "staff_id";--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_entry_person_key" UNIQUE("team_entry_id","person_id");
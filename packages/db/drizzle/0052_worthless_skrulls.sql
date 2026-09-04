CREATE TABLE "staff_people" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone" varchar(50),
	"email" varchar(255),
	"licence" varchar(100),
	"photo_filename" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_staff" ADD COLUMN "person_id" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "person_id" integer;--> statement-breakpoint
CREATE INDEX "staff_people_name_idx" ON "staff_people" USING btree ("last_name","first_name");--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_person_id_staff_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."staff_people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_person_id_staff_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."staff_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_staff_person_idx" ON "team_staff" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_person_id_unique" UNIQUE("person_id");--> statement-breakpoint
-- Hand-written backfill (ADR 0009). `team_staff` was one row per person per
-- team, so a coach on two teams exists twice with two portraits and two places
-- to keep a phone number. One person is created per distinct normalised name —
-- trimmed and case-folded, so the row with the trailing space merges with its
-- twin — taking each field from the most recently updated row that has it.
-- Portrait objects that lose their last reference stay in the bucket.
INSERT INTO "staff_people" ("first_name", "last_name", "phone", "email", "licence", "photo_filename", "created_at", "updated_at")
SELECT
	(array_agg(btrim("first_name") ORDER BY "updated_at" DESC, "id" DESC))[1],
	(array_agg(btrim("last_name") ORDER BY "updated_at" DESC, "id" DESC))[1],
	(array_agg("phone" ORDER BY ("phone" IS NULL), "updated_at" DESC, "id" DESC))[1],
	(array_agg("email" ORDER BY ("email" IS NULL), "updated_at" DESC, "id" DESC))[1],
	(array_agg("licence" ORDER BY ("licence" IS NULL), "updated_at" DESC, "id" DESC))[1],
	(array_agg("photo_filename" ORDER BY ("photo_filename" IS NULL), "updated_at" DESC, "id" DESC))[1],
	min("created_at"),
	max("updated_at")
FROM "team_staff"
GROUP BY lower(btrim("first_name")), lower(btrim("last_name"));--> statement-breakpoint
UPDATE "team_staff" AS "ts" SET "person_id" = "p"."id"
FROM "staff_people" AS "p"
WHERE lower(btrim("ts"."first_name")) = lower(btrim("p"."first_name"))
	AND lower(btrim("ts"."last_name")) = lower(btrim("p"."last_name"));--> statement-breakpoint
-- Each account follows its row onto that row's person. `user.person_id` is
-- unique, so if two accounts were linked to two rows of one merged person the
-- oldest account keeps the link and the other is left unlinked rather than
-- failing the migration.
UPDATE "user" AS "u" SET "person_id" = "m"."person_id"
FROM (
	SELECT DISTINCT ON ("ts"."person_id") "ts"."person_id", "u2"."id" AS "user_id"
	FROM "user" AS "u2"
	JOIN "team_staff" AS "ts" ON "ts"."id" = "u2"."staff_id"
	ORDER BY "ts"."person_id", "u2"."created_at", "u2"."id"
) AS "m"
WHERE "u"."id" = "m"."user_id";--> statement-breakpoint
-- Two rows of one team that merged into the same person would violate the
-- unique constraint the next migration adds; the earliest assignment wins.
DELETE FROM "team_staff" AS "ts"
USING "team_staff" AS "other"
WHERE "ts"."team_entry_id" = "other"."team_entry_id"
	AND "ts"."person_id" = "other"."person_id"
	AND "ts"."id" > "other"."id";

import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Drops what nothing reads any more (issue #316): the `trainers` collection and
 * the team → trainers relation (the Hub owns club staff as `team_staff`,
 * ADR-0008, and the Website reads coaches from there), plus the team's
 * `leagueName` / `leagueId` — the site derives the league from the sync data via
 * apiTeamPermanentId and never read the CMS copy.
 *
 * `down` restores the tables and columns, not the rows: the trainer data lives
 * on in the Hub, so re-importing it here would be the wrong direction.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // The generated order was edited: `DROP TABLE "trainers" CASCADE` already
  // takes the locked-documents foreign key with it, so dropping that constraint
  // afterwards errored. It goes first instead.
  await db.execute(sql`
   ALTER TABLE "teams_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_teams_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "trainers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_trainers_fk";
  DROP INDEX "payload_locked_documents_rels_trainers_id_idx";
  DROP TABLE "teams_rels" CASCADE;
  DROP TABLE "_teams_v_rels" CASCADE;
  DROP TABLE "trainers" CASCADE;
  ALTER TABLE "teams" DROP COLUMN "league_name";
  ALTER TABLE "teams" DROP COLUMN "league_id";
  ALTER TABLE "_teams_v" DROP COLUMN "version_league_name";
  ALTER TABLE "_teams_v" DROP COLUMN "version_league_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "trainers_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "teams_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"trainers_id" integer
  );
  
  CREATE TABLE "_teams_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"trainers_id" integer
  );
  
  CREATE TABLE "trainers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"person_id" integer,
  	"licence" varchar,
  	"email" varchar,
  	"image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "teams" ADD COLUMN "league_name" varchar;
  ALTER TABLE "teams" ADD COLUMN "league_id" varchar;
  ALTER TABLE "_teams_v" ADD COLUMN "version_league_name" varchar;
  ALTER TABLE "_teams_v" ADD COLUMN "version_league_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trainers_id" integer;
  ALTER TABLE "teams_rels" ADD CONSTRAINT "teams_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "teams_rels" ADD CONSTRAINT "teams_rels_trainers_fk" FOREIGN KEY ("trainers_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_teams_v_rels" ADD CONSTRAINT "_teams_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_teams_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_teams_v_rels" ADD CONSTRAINT "_teams_v_rels_trainers_fk" FOREIGN KEY ("trainers_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "trainers" ADD CONSTRAINT "trainers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trainers" ADD CONSTRAINT "trainers_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "teams_rels_order_idx" ON "teams_rels" USING btree ("order");
  CREATE INDEX "teams_rels_parent_idx" ON "teams_rels" USING btree ("parent_id");
  CREATE INDEX "teams_rels_path_idx" ON "teams_rels" USING btree ("path");
  CREATE INDEX "teams_rels_trainers_id_idx" ON "teams_rels" USING btree ("trainers_id");
  CREATE INDEX "_teams_v_rels_order_idx" ON "_teams_v_rels" USING btree ("order");
  CREATE INDEX "_teams_v_rels_parent_idx" ON "_teams_v_rels" USING btree ("parent_id");
  CREATE INDEX "_teams_v_rels_path_idx" ON "_teams_v_rels" USING btree ("path");
  CREATE INDEX "_teams_v_rels_trainers_id_idx" ON "_teams_v_rels" USING btree ("trainers_id");
  CREATE INDEX "trainers_person_idx" ON "trainers" USING btree ("person_id");
  CREATE INDEX "trainers_image_idx" ON "trainers" USING btree ("image_id");
  CREATE INDEX "trainers_updated_at_idx" ON "trainers" USING btree ("updated_at");
  CREATE INDEX "trainers_created_at_idx" ON "trainers" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainers_fk" FOREIGN KEY ("trainers_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_trainers_id_idx" ON "payload_locked_documents_rels" USING btree ("trainers_id");`)
}

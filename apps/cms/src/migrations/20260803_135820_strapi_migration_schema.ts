import type { MigrateUpArgs, MigrateDownArgs} from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_teams_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__teams_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_vorstand_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__vorstand_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_positions_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__positions_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_referees_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__referees_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_partners_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__partners_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_projects_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__projects_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_downloads_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__downloads_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_shop_items_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__shop_items_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_timeline_items_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__timeline_items_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "_teams_v_version_training_times" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"day" varchar,
  	"start_time" varchar,
  	"end_time" varchar,
  	"gym" varchar,
  	"gym_maps_url" varchar,
  	"info" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_teams_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_slug" varchar,
  	"version_order_index" numeric,
  	"version_team_image_id" integer,
  	"version_api_team_permanent_id" numeric,
  	"version_league_name" varchar,
  	"version_league_id" varchar,
  	"version_seo_description" varchar,
  	"version_og_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__teams_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_teams_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"trainers_id" integer
  );
  
  CREATE TABLE "_vorstand_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_role" varchar,
  	"version_tasks" varchar,
  	"version_person_id" integer,
  	"version_order_index" numeric,
  	"version_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__vorstand_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_positions_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_tasks" varchar,
  	"version_order_index" numeric,
  	"version_email" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__positions_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_positions_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"people_id" integer
  );
  
  CREATE TABLE "referees" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"person_id" integer,
  	"licence" varchar,
  	"image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_referees_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_referees_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_person_id" integer,
  	"version_licence" varchar,
  	"version_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__referees_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_partners_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_description" varchar,
  	"version_logo_id" integer,
  	"version_url" varchar,
  	"version_order_index" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__partners_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_projects_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_description" varchar,
  	"version_image_id" integer,
  	"version_link" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__projects_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_downloads_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_file_id" integer,
  	"version_category" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__downloads_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "shop_items_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "_shop_items_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_price" numeric,
  	"version_link" varchar,
  	"version_description" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__shop_items_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_shop_items_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "_timeline_items_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_year" varchar,
  	"version_title" varchar,
  	"version_description" varchar,
  	"version_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__timeline_items_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "shop_items" DROP CONSTRAINT "shop_items_image_id_media_id_fk";
  
  DROP INDEX "shop_items_image_idx";
  ALTER TABLE "teams_training_times" ALTER COLUMN "day" DROP NOT NULL;
  ALTER TABLE "teams_training_times" ALTER COLUMN "start_time" DROP NOT NULL;
  ALTER TABLE "teams_training_times" ALTER COLUMN "gym" DROP NOT NULL;
  ALTER TABLE "teams" ALTER COLUMN "name" DROP NOT NULL;
  ALTER TABLE "teams" ALTER COLUMN "slug" DROP NOT NULL;
  ALTER TABLE "teams" ALTER COLUMN "order_index" DROP NOT NULL;
  ALTER TABLE "vorstand" ALTER COLUMN "role" DROP NOT NULL;
  ALTER TABLE "vorstand" ALTER COLUMN "order_index" DROP NOT NULL;
  ALTER TABLE "positions" ALTER COLUMN "name" DROP NOT NULL;
  ALTER TABLE "positions" ALTER COLUMN "order_index" DROP NOT NULL;
  ALTER TABLE "partners" ALTER COLUMN "name" DROP NOT NULL;
  ALTER TABLE "projects" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "downloads" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "shop_items" ALTER COLUMN "name" DROP NOT NULL;
  -- drizzle-kit emits a bare SET DATA TYPE for text->numeric and Postgres has no
  -- assignment cast, so the USING clause is added by hand (issue #165, D3).
  ALTER TABLE "shop_items" ALTER COLUMN "price" SET DATA TYPE numeric USING "price"::numeric;
  ALTER TABLE "timeline_items" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "teams" ADD COLUMN "league_name" varchar;
  ALTER TABLE "teams" ADD COLUMN "league_id" varchar;
  ALTER TABLE "teams" ADD COLUMN "_status" "enum_teams_status" DEFAULT 'draft';
  ALTER TABLE "vorstand" ADD COLUMN "_status" "enum_vorstand_status" DEFAULT 'draft';
  ALTER TABLE "positions" ADD COLUMN "_status" "enum_positions_status" DEFAULT 'draft';
  ALTER TABLE "partners" ADD COLUMN "description" varchar;
  ALTER TABLE "partners" ADD COLUMN "_status" "enum_partners_status" DEFAULT 'draft';
  ALTER TABLE "projects" ADD COLUMN "_status" "enum_projects_status" DEFAULT 'draft';
  ALTER TABLE "downloads" ADD COLUMN "_status" "enum_downloads_status" DEFAULT 'draft';
  ALTER TABLE "shop_items" ADD COLUMN "_status" "enum_shop_items_status" DEFAULT 'draft';
  ALTER TABLE "timeline_items" ADD COLUMN "_status" "enum_timeline_items_status" DEFAULT 'draft';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "referees_id" integer;
  ALTER TABLE "_teams_v_version_training_times" ADD CONSTRAINT "_teams_v_version_training_times_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_teams_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_teams_v" ADD CONSTRAINT "_teams_v_parent_id_teams_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_teams_v" ADD CONSTRAINT "_teams_v_version_team_image_id_media_id_fk" FOREIGN KEY ("version_team_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_teams_v" ADD CONSTRAINT "_teams_v_version_og_image_id_media_id_fk" FOREIGN KEY ("version_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_teams_v_rels" ADD CONSTRAINT "_teams_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_teams_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_teams_v_rels" ADD CONSTRAINT "_teams_v_rels_trainers_fk" FOREIGN KEY ("trainers_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_vorstand_v" ADD CONSTRAINT "_vorstand_v_parent_id_vorstand_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."vorstand"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_vorstand_v" ADD CONSTRAINT "_vorstand_v_version_person_id_people_id_fk" FOREIGN KEY ("version_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_vorstand_v" ADD CONSTRAINT "_vorstand_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_positions_v" ADD CONSTRAINT "_positions_v_parent_id_positions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_positions_v_rels" ADD CONSTRAINT "_positions_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_positions_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_positions_v_rels" ADD CONSTRAINT "_positions_v_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "referees" ADD CONSTRAINT "referees_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "referees" ADD CONSTRAINT "referees_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_referees_v" ADD CONSTRAINT "_referees_v_parent_id_referees_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."referees"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_referees_v" ADD CONSTRAINT "_referees_v_version_person_id_people_id_fk" FOREIGN KEY ("version_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_referees_v" ADD CONSTRAINT "_referees_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partners_v" ADD CONSTRAINT "_partners_v_parent_id_partners_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_partners_v" ADD CONSTRAINT "_partners_v_version_logo_id_media_id_fk" FOREIGN KEY ("version_logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_projects_v" ADD CONSTRAINT "_projects_v_parent_id_projects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_projects_v" ADD CONSTRAINT "_projects_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_downloads_v" ADD CONSTRAINT "_downloads_v_parent_id_downloads_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."downloads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_downloads_v" ADD CONSTRAINT "_downloads_v_version_file_id_media_id_fk" FOREIGN KEY ("version_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shop_items_rels" ADD CONSTRAINT "shop_items_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."shop_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shop_items_rels" ADD CONSTRAINT "shop_items_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_shop_items_v" ADD CONSTRAINT "_shop_items_v_parent_id_shop_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."shop_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_shop_items_v_rels" ADD CONSTRAINT "_shop_items_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_shop_items_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_shop_items_v_rels" ADD CONSTRAINT "_shop_items_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_timeline_items_v" ADD CONSTRAINT "_timeline_items_v_parent_id_timeline_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."timeline_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_timeline_items_v" ADD CONSTRAINT "_timeline_items_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "_teams_v_version_training_times_order_idx" ON "_teams_v_version_training_times" USING btree ("_order");
  CREATE INDEX "_teams_v_version_training_times_parent_id_idx" ON "_teams_v_version_training_times" USING btree ("_parent_id");
  CREATE INDEX "_teams_v_parent_idx" ON "_teams_v" USING btree ("parent_id");
  CREATE INDEX "_teams_v_version_version_slug_idx" ON "_teams_v" USING btree ("version_slug");
  CREATE INDEX "_teams_v_version_version_team_image_idx" ON "_teams_v" USING btree ("version_team_image_id");
  CREATE INDEX "_teams_v_version_version_api_team_permanent_id_idx" ON "_teams_v" USING btree ("version_api_team_permanent_id");
  CREATE INDEX "_teams_v_version_version_og_image_idx" ON "_teams_v" USING btree ("version_og_image_id");
  CREATE INDEX "_teams_v_version_version_updated_at_idx" ON "_teams_v" USING btree ("version_updated_at");
  CREATE INDEX "_teams_v_version_version_created_at_idx" ON "_teams_v" USING btree ("version_created_at");
  CREATE INDEX "_teams_v_version_version__status_idx" ON "_teams_v" USING btree ("version__status");
  CREATE INDEX "_teams_v_created_at_idx" ON "_teams_v" USING btree ("created_at");
  CREATE INDEX "_teams_v_updated_at_idx" ON "_teams_v" USING btree ("updated_at");
  CREATE INDEX "_teams_v_latest_idx" ON "_teams_v" USING btree ("latest");
  CREATE INDEX "_teams_v_rels_order_idx" ON "_teams_v_rels" USING btree ("order");
  CREATE INDEX "_teams_v_rels_parent_idx" ON "_teams_v_rels" USING btree ("parent_id");
  CREATE INDEX "_teams_v_rels_path_idx" ON "_teams_v_rels" USING btree ("path");
  CREATE INDEX "_teams_v_rels_trainers_id_idx" ON "_teams_v_rels" USING btree ("trainers_id");
  CREATE INDEX "_vorstand_v_parent_idx" ON "_vorstand_v" USING btree ("parent_id");
  CREATE INDEX "_vorstand_v_version_version_person_idx" ON "_vorstand_v" USING btree ("version_person_id");
  CREATE INDEX "_vorstand_v_version_version_image_idx" ON "_vorstand_v" USING btree ("version_image_id");
  CREATE INDEX "_vorstand_v_version_version_updated_at_idx" ON "_vorstand_v" USING btree ("version_updated_at");
  CREATE INDEX "_vorstand_v_version_version_created_at_idx" ON "_vorstand_v" USING btree ("version_created_at");
  CREATE INDEX "_vorstand_v_version_version__status_idx" ON "_vorstand_v" USING btree ("version__status");
  CREATE INDEX "_vorstand_v_created_at_idx" ON "_vorstand_v" USING btree ("created_at");
  CREATE INDEX "_vorstand_v_updated_at_idx" ON "_vorstand_v" USING btree ("updated_at");
  CREATE INDEX "_vorstand_v_latest_idx" ON "_vorstand_v" USING btree ("latest");
  CREATE INDEX "_positions_v_parent_idx" ON "_positions_v" USING btree ("parent_id");
  CREATE INDEX "_positions_v_version_version_updated_at_idx" ON "_positions_v" USING btree ("version_updated_at");
  CREATE INDEX "_positions_v_version_version_created_at_idx" ON "_positions_v" USING btree ("version_created_at");
  CREATE INDEX "_positions_v_version_version__status_idx" ON "_positions_v" USING btree ("version__status");
  CREATE INDEX "_positions_v_created_at_idx" ON "_positions_v" USING btree ("created_at");
  CREATE INDEX "_positions_v_updated_at_idx" ON "_positions_v" USING btree ("updated_at");
  CREATE INDEX "_positions_v_latest_idx" ON "_positions_v" USING btree ("latest");
  CREATE INDEX "_positions_v_rels_order_idx" ON "_positions_v_rels" USING btree ("order");
  CREATE INDEX "_positions_v_rels_parent_idx" ON "_positions_v_rels" USING btree ("parent_id");
  CREATE INDEX "_positions_v_rels_path_idx" ON "_positions_v_rels" USING btree ("path");
  CREATE INDEX "_positions_v_rels_people_id_idx" ON "_positions_v_rels" USING btree ("people_id");
  CREATE INDEX "referees_person_idx" ON "referees" USING btree ("person_id");
  CREATE INDEX "referees_image_idx" ON "referees" USING btree ("image_id");
  CREATE INDEX "referees_updated_at_idx" ON "referees" USING btree ("updated_at");
  CREATE INDEX "referees_created_at_idx" ON "referees" USING btree ("created_at");
  CREATE INDEX "referees__status_idx" ON "referees" USING btree ("_status");
  CREATE INDEX "_referees_v_parent_idx" ON "_referees_v" USING btree ("parent_id");
  CREATE INDEX "_referees_v_version_version_person_idx" ON "_referees_v" USING btree ("version_person_id");
  CREATE INDEX "_referees_v_version_version_image_idx" ON "_referees_v" USING btree ("version_image_id");
  CREATE INDEX "_referees_v_version_version_updated_at_idx" ON "_referees_v" USING btree ("version_updated_at");
  CREATE INDEX "_referees_v_version_version_created_at_idx" ON "_referees_v" USING btree ("version_created_at");
  CREATE INDEX "_referees_v_version_version__status_idx" ON "_referees_v" USING btree ("version__status");
  CREATE INDEX "_referees_v_created_at_idx" ON "_referees_v" USING btree ("created_at");
  CREATE INDEX "_referees_v_updated_at_idx" ON "_referees_v" USING btree ("updated_at");
  CREATE INDEX "_referees_v_latest_idx" ON "_referees_v" USING btree ("latest");
  CREATE INDEX "_partners_v_parent_idx" ON "_partners_v" USING btree ("parent_id");
  CREATE INDEX "_partners_v_version_version_logo_idx" ON "_partners_v" USING btree ("version_logo_id");
  CREATE INDEX "_partners_v_version_version_updated_at_idx" ON "_partners_v" USING btree ("version_updated_at");
  CREATE INDEX "_partners_v_version_version_created_at_idx" ON "_partners_v" USING btree ("version_created_at");
  CREATE INDEX "_partners_v_version_version__status_idx" ON "_partners_v" USING btree ("version__status");
  CREATE INDEX "_partners_v_created_at_idx" ON "_partners_v" USING btree ("created_at");
  CREATE INDEX "_partners_v_updated_at_idx" ON "_partners_v" USING btree ("updated_at");
  CREATE INDEX "_partners_v_latest_idx" ON "_partners_v" USING btree ("latest");
  CREATE INDEX "_projects_v_parent_idx" ON "_projects_v" USING btree ("parent_id");
  CREATE INDEX "_projects_v_version_version_image_idx" ON "_projects_v" USING btree ("version_image_id");
  CREATE INDEX "_projects_v_version_version_updated_at_idx" ON "_projects_v" USING btree ("version_updated_at");
  CREATE INDEX "_projects_v_version_version_created_at_idx" ON "_projects_v" USING btree ("version_created_at");
  CREATE INDEX "_projects_v_version_version__status_idx" ON "_projects_v" USING btree ("version__status");
  CREATE INDEX "_projects_v_created_at_idx" ON "_projects_v" USING btree ("created_at");
  CREATE INDEX "_projects_v_updated_at_idx" ON "_projects_v" USING btree ("updated_at");
  CREATE INDEX "_projects_v_latest_idx" ON "_projects_v" USING btree ("latest");
  CREATE INDEX "_downloads_v_parent_idx" ON "_downloads_v" USING btree ("parent_id");
  CREATE INDEX "_downloads_v_version_version_file_idx" ON "_downloads_v" USING btree ("version_file_id");
  CREATE INDEX "_downloads_v_version_version_updated_at_idx" ON "_downloads_v" USING btree ("version_updated_at");
  CREATE INDEX "_downloads_v_version_version_created_at_idx" ON "_downloads_v" USING btree ("version_created_at");
  CREATE INDEX "_downloads_v_version_version__status_idx" ON "_downloads_v" USING btree ("version__status");
  CREATE INDEX "_downloads_v_created_at_idx" ON "_downloads_v" USING btree ("created_at");
  CREATE INDEX "_downloads_v_updated_at_idx" ON "_downloads_v" USING btree ("updated_at");
  CREATE INDEX "_downloads_v_latest_idx" ON "_downloads_v" USING btree ("latest");
  CREATE INDEX "shop_items_rels_order_idx" ON "shop_items_rels" USING btree ("order");
  CREATE INDEX "shop_items_rels_parent_idx" ON "shop_items_rels" USING btree ("parent_id");
  CREATE INDEX "shop_items_rels_path_idx" ON "shop_items_rels" USING btree ("path");
  CREATE INDEX "shop_items_rels_media_id_idx" ON "shop_items_rels" USING btree ("media_id");
  CREATE INDEX "_shop_items_v_parent_idx" ON "_shop_items_v" USING btree ("parent_id");
  CREATE INDEX "_shop_items_v_version_version_updated_at_idx" ON "_shop_items_v" USING btree ("version_updated_at");
  CREATE INDEX "_shop_items_v_version_version_created_at_idx" ON "_shop_items_v" USING btree ("version_created_at");
  CREATE INDEX "_shop_items_v_version_version__status_idx" ON "_shop_items_v" USING btree ("version__status");
  CREATE INDEX "_shop_items_v_created_at_idx" ON "_shop_items_v" USING btree ("created_at");
  CREATE INDEX "_shop_items_v_updated_at_idx" ON "_shop_items_v" USING btree ("updated_at");
  CREATE INDEX "_shop_items_v_latest_idx" ON "_shop_items_v" USING btree ("latest");
  CREATE INDEX "_shop_items_v_rels_order_idx" ON "_shop_items_v_rels" USING btree ("order");
  CREATE INDEX "_shop_items_v_rels_parent_idx" ON "_shop_items_v_rels" USING btree ("parent_id");
  CREATE INDEX "_shop_items_v_rels_path_idx" ON "_shop_items_v_rels" USING btree ("path");
  CREATE INDEX "_shop_items_v_rels_media_id_idx" ON "_shop_items_v_rels" USING btree ("media_id");
  CREATE INDEX "_timeline_items_v_parent_idx" ON "_timeline_items_v" USING btree ("parent_id");
  CREATE INDEX "_timeline_items_v_version_version_image_idx" ON "_timeline_items_v" USING btree ("version_image_id");
  CREATE INDEX "_timeline_items_v_version_version_updated_at_idx" ON "_timeline_items_v" USING btree ("version_updated_at");
  CREATE INDEX "_timeline_items_v_version_version_created_at_idx" ON "_timeline_items_v" USING btree ("version_created_at");
  CREATE INDEX "_timeline_items_v_version_version__status_idx" ON "_timeline_items_v" USING btree ("version__status");
  CREATE INDEX "_timeline_items_v_created_at_idx" ON "_timeline_items_v" USING btree ("created_at");
  CREATE INDEX "_timeline_items_v_updated_at_idx" ON "_timeline_items_v" USING btree ("updated_at");
  CREATE INDEX "_timeline_items_v_latest_idx" ON "_timeline_items_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_referees_fk" FOREIGN KEY ("referees_id") REFERENCES "public"."referees"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "teams__status_idx" ON "teams" USING btree ("_status");
  CREATE INDEX "vorstand__status_idx" ON "vorstand" USING btree ("_status");
  CREATE INDEX "positions__status_idx" ON "positions" USING btree ("_status");
  CREATE INDEX "partners__status_idx" ON "partners" USING btree ("_status");
  CREATE INDEX "projects__status_idx" ON "projects" USING btree ("_status");
  CREATE INDEX "downloads__status_idx" ON "downloads" USING btree ("_status");
  CREATE INDEX "shop_items__status_idx" ON "shop_items" USING btree ("_status");
  CREATE INDEX "timeline_items__status_idx" ON "timeline_items" USING btree ("_status");
  CREATE INDEX "payload_locked_documents_rels_referees_id_idx" ON "payload_locked_documents_rels" USING btree ("referees_id");
  ALTER TABLE "shop_items" DROP COLUMN "image_id";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "_teams_v_version_training_times" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_teams_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_teams_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_vorstand_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_positions_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_positions_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "referees" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_referees_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_partners_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_projects_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_downloads_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "shop_items_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_shop_items_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_shop_items_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_timeline_items_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "_teams_v_version_training_times" CASCADE;
  DROP TABLE "_teams_v" CASCADE;
  DROP TABLE "_teams_v_rels" CASCADE;
  DROP TABLE "_vorstand_v" CASCADE;
  DROP TABLE "_positions_v" CASCADE;
  DROP TABLE "_positions_v_rels" CASCADE;
  DROP TABLE "referees" CASCADE;
  DROP TABLE "_referees_v" CASCADE;
  DROP TABLE "_partners_v" CASCADE;
  DROP TABLE "_projects_v" CASCADE;
  DROP TABLE "_downloads_v" CASCADE;
  DROP TABLE "shop_items_rels" CASCADE;
  DROP TABLE "_shop_items_v" CASCADE;
  DROP TABLE "_shop_items_v_rels" CASCADE;
  DROP TABLE "_timeline_items_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_referees_fk";
  
  DROP INDEX "teams__status_idx";
  DROP INDEX "vorstand__status_idx";
  DROP INDEX "positions__status_idx";
  DROP INDEX "partners__status_idx";
  DROP INDEX "projects__status_idx";
  DROP INDEX "downloads__status_idx";
  DROP INDEX "shop_items__status_idx";
  DROP INDEX "timeline_items__status_idx";
  DROP INDEX "payload_locked_documents_rels_referees_id_idx";
  ALTER TABLE "teams_training_times" ALTER COLUMN "day" SET NOT NULL;
  ALTER TABLE "teams_training_times" ALTER COLUMN "start_time" SET NOT NULL;
  ALTER TABLE "teams_training_times" ALTER COLUMN "gym" SET NOT NULL;
  ALTER TABLE "teams" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "teams" ALTER COLUMN "slug" SET NOT NULL;
  ALTER TABLE "teams" ALTER COLUMN "order_index" SET NOT NULL;
  ALTER TABLE "vorstand" ALTER COLUMN "role" SET NOT NULL;
  ALTER TABLE "vorstand" ALTER COLUMN "order_index" SET NOT NULL;
  ALTER TABLE "positions" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "positions" ALTER COLUMN "order_index" SET NOT NULL;
  ALTER TABLE "partners" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "projects" ALTER COLUMN "title" SET NOT NULL;
  ALTER TABLE "downloads" ALTER COLUMN "title" SET NOT NULL;
  ALTER TABLE "shop_items" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "shop_items" ALTER COLUMN "price" SET DATA TYPE varchar USING "price"::varchar;
  ALTER TABLE "timeline_items" ALTER COLUMN "title" SET NOT NULL;
  ALTER TABLE "shop_items" ADD COLUMN "image_id" integer;
  ALTER TABLE "shop_items" ADD CONSTRAINT "shop_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "shop_items_image_idx" ON "shop_items" USING btree ("image_id");
  ALTER TABLE "teams" DROP COLUMN "league_name";
  ALTER TABLE "teams" DROP COLUMN "league_id";
  ALTER TABLE "teams" DROP COLUMN "_status";
  ALTER TABLE "vorstand" DROP COLUMN "_status";
  ALTER TABLE "positions" DROP COLUMN "_status";
  ALTER TABLE "partners" DROP COLUMN "description";
  ALTER TABLE "partners" DROP COLUMN "_status";
  ALTER TABLE "projects" DROP COLUMN "_status";
  ALTER TABLE "downloads" DROP COLUMN "_status";
  ALTER TABLE "shop_items" DROP COLUMN "_status";
  ALTER TABLE "timeline_items" DROP COLUMN "_status";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "referees_id";
  DROP TYPE "public"."enum_teams_status";
  DROP TYPE "public"."enum__teams_v_version_status";
  DROP TYPE "public"."enum_vorstand_status";
  DROP TYPE "public"."enum__vorstand_v_version_status";
  DROP TYPE "public"."enum_positions_status";
  DROP TYPE "public"."enum__positions_v_version_status";
  DROP TYPE "public"."enum_referees_status";
  DROP TYPE "public"."enum__referees_v_version_status";
  DROP TYPE "public"."enum_partners_status";
  DROP TYPE "public"."enum__partners_v_version_status";
  DROP TYPE "public"."enum_projects_status";
  DROP TYPE "public"."enum__projects_v_version_status";
  DROP TYPE "public"."enum_downloads_status";
  DROP TYPE "public"."enum__downloads_v_version_status";
  DROP TYPE "public"."enum_shop_items_status";
  DROP TYPE "public"."enum__shop_items_v_version_status";
  DROP TYPE "public"."enum_timeline_items_status";
  DROP TYPE "public"."enum__timeline_items_v_version_status";`)
}

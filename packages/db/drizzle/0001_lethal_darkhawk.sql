CREATE TABLE "sync_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cron_expression" varchar(100) DEFAULT '0 4 * * *' NOT NULL,
	"timezone" varchar(100) DEFAULT 'Europe/Berlin' NOT NULL,
	"last_updated_at" timestamp with time zone,
	"last_updated_by" varchar(255)
);

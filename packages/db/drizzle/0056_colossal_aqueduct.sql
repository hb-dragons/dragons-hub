CREATE TABLE "venue_hall_times" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"kind" varchar(10) NOT NULL,
	"note" text,
	"source" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_hall_times_open_has_window" CHECK ("venue_hall_times"."kind" <> 'open' OR ("venue_hall_times"."start_time" IS NOT NULL AND "venue_hall_times"."end_time" IS NOT NULL)),
	CONSTRAINT "venue_hall_times_window_ordered" CHECK ("venue_hall_times"."start_time" IS NULL OR "venue_hall_times"."end_time" IS NULL OR "venue_hall_times"."start_time" < "venue_hall_times"."end_time")
);
--> statement-breakpoint
ALTER TABLE "venue_hall_times" ADD CONSTRAINT "venue_hall_times_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_hall_times_venue_date_uniq" ON "venue_hall_times" USING btree ("venue_id","date");--> statement-breakpoint
CREATE INDEX "venue_hall_times_date_idx" ON "venue_hall_times" USING btree ("date");
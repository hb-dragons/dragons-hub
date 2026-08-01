CREATE TABLE "probetraining_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"year" integer NOT NULL,
	"did_play" boolean NOT NULL,
	"gender" text NOT NULL,
	"mail" text NOT NULL,
	"message" text,
	"accepted_privacy" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

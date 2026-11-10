CREATE TABLE "account_closure_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_closure_requests_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "account_closure_requests" ADD CONSTRAINT "account_closure_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
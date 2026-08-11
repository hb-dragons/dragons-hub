CREATE TABLE "email_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"unsubscribe_token" varchar(64) NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"unsubscribed_via" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_subscriptions_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "email_subscriptions_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);

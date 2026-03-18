ALTER TABLE "notification_log" DROP CONSTRAINT "notification_log_watch_rule_id_watch_rules_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_watch_rule_id_watch_rules_id_fk" FOREIGN KEY ("watch_rule_id") REFERENCES "public"."watch_rules"("id") ON DELETE set null ON UPDATE no action;
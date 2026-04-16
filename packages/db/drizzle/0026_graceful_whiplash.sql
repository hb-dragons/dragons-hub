ALTER TABLE "referee_games" ADD COLUMN "home_team_id" integer;--> statement-breakpoint
ALTER TABLE "referee_games" ADD COLUMN "guest_team_id" integer;--> statement-breakpoint
ALTER TABLE "referee_games" ADD CONSTRAINT "referee_games_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referee_games" ADD CONSTRAINT "referee_games_guest_team_id_teams_id_fk" FOREIGN KEY ("guest_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referee_games_home_team_id_idx" ON "referee_games" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "referee_games_guest_team_id_idx" ON "referee_games" USING btree ("guest_team_id");
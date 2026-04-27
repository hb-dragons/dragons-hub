ALTER TABLE "teams" ADD COLUMN "display_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "teams_own_order_idx" ON "teams" USING btree ("is_own_club","display_order");
--> statement-breakpoint
UPDATE "teams"
SET "display_order" = sub.rn
FROM (
  SELECT id, row_number() OVER (ORDER BY name) - 1 AS rn
  FROM "teams"
  WHERE "is_own_club" = true
) sub
WHERE "teams"."id" = sub.id;
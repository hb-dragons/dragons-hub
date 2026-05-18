import { Hono } from "hono";
import { db } from "../../config/database";
import { referees } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { getRulesForReferee } from "../../services/referee/referee-rules.service";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";
import { refereeRulesParamSchema } from "./referee-rules.schemas";

const refereeRulesRoutes = new Hono<AppEnv>();

const refereeView = requirePermission("referee", "view");

async function requireOwnClubReferee(id: number) {
  const [referee] = await db
    .select({ isOwnClub: referees.isOwnClub })
    .from(referees)
    .where(eq(referees.id, id))
    .limit(1);
  return referee ?? null;
}

refereeRulesRoutes.get("/referees/:id/rules", refereeView, async (c) => {
  const { id } = refereeRulesParamSchema.parse({ id: c.req.param("id") });

  const referee = await requireOwnClubReferee(id);
  if (!referee) {
    return c.json({ error: "Referee not found", code: "NOT_FOUND" }, 404);
  }
  if (!referee.isOwnClub) {
    return c.json({ error: "Referee is not an own-club referee", code: "NOT_OWN_CLUB" }, 400);
  }

  const result = await getRulesForReferee(id);
  return c.json(result);
});

export { refereeRulesRoutes };

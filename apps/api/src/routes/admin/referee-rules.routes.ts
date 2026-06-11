import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { getDb } from "../../config/database";
import { referees } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { getRulesForReferee } from "../../services/referee/referee-rules.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import { refereeRulesParamSchema } from "@dragons/contracts";

const refereeRulesRoutes = new Hono<AppEnv>();

const refereeView = requirePermission("referee", "view");

async function requireOwnClubReferee(id: number) {
  const [referee] = await getDb()
    .select({ isOwnClub: referees.isOwnClub })
    .from(referees)
    .where(eq(referees.id, id))
    .limit(1);
  return referee ?? null;
}

refereeRulesRoutes.get(
  "/referees/:id/rules",
  refereeView,
  validator("param", refereeRulesParamSchema, validationHook),
  describeRoute({
    description: "Get rules for a referee",
    tags: ["Referee Rules"],
    responses: {
      200: { description: "Success" },
      400: { description: "Invalid id or referee is not own-club" },
      404: { description: "Referee not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");

    const referee = await requireOwnClubReferee(id);
    if (!referee) {
      return c.json({ error: "Referee not found", code: "NOT_FOUND" }, 404);
    }
    if (!referee.isOwnClub) {
      return c.json({ error: "Referee is not an own-club referee", code: "NOT_OWN_CLUB" }, 400);
    }

    const result = await getRulesForReferee(id);
    return c.json(result);
  },
);

export { refereeRulesRoutes };

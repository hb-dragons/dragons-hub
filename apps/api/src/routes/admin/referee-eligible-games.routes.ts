import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { eq } from "drizzle-orm";
import { getDb } from "../../config/database";
import { referees } from "@dragons/db/schema";
import { getEligibleOpenGames } from "../../services/referee/eligible-open-games.service";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";

const refereeEligibleGamesRoutes = new Hono<AppEnv>();

refereeEligibleGamesRoutes.get(
  "/referees/:id/eligible-open-games",
  requirePermission("assignment", "view"),
  describeRoute({
    description: "Returns open games the referee is eligible to take",
    tags: ["Referees"],
    responses: {
      200: { description: "Eligible games" },
      400: { description: "Invalid id" },
      404: { description: "Referee not found" },
    },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, 400);
    }

    const [row] = await getDb()
      .select({ apiId: referees.apiId })
      .from(referees)
      .where(eq(referees.id, id))
      .limit(1);

    if (!row) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }

    const result = await getEligibleOpenGames(row.apiId);
    return c.json(result);
  },
);

export { refereeEligibleGamesRoutes };

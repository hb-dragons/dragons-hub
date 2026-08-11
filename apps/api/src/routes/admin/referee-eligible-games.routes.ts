import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { getEligibleOpenGamesForReferee } from "../../services/referee/eligible-open-games.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import { refereeIdParamSchema } from "@dragons/contracts";
import type { AppEnv } from "../../types";

const refereeEligibleGamesRoutes = new Hono<AppEnv>();

refereeEligibleGamesRoutes.get(
  "/referees/:id/eligible-open-games",
  requirePermission("assignment", "view"),
  validator("param", refereeIdParamSchema, validationHook),
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
    const { id } = c.req.valid("param");
    return c.json(await getEligibleOpenGamesForReferee(id));
  },
);

export { refereeEligibleGamesRoutes };

import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { getRulesForReferee } from "../../services/referee/referee-rules.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import { refereeRulesParamSchema } from "@dragons/contracts";

const refereeRulesRoutes = new Hono<AppEnv>();

const refereeView = requirePermission("referee", "view");

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
    const result = await getRulesForReferee(id);
    return c.json(result);
  },
);

export { refereeRulesRoutes };

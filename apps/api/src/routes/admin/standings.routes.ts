import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { getStandings } from "../../services/admin/standings-admin.service";
import { requirePermission } from "../../middleware/rbac";
import { standingsListQuerySchema } from "@dragons/contracts";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";

const standingsRoutes = new Hono<AppEnv>();

// GET /admin/standings - List standings grouped by tracked league
standingsRoutes.get(
  "/standings",
  requirePermission("standing", "view"),
  validator("query", standingsListQuerySchema, validationHook),
  describeRoute({
    description: "List standings grouped by tracked league (defaults to the active season)",
    tags: ["Standings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const result = await getStandings(c.req.valid("query").seasonId);
    return c.json(result);
  },
);

export { standingsRoutes };

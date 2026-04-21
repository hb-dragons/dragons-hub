import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { getStandings } from "../../services/admin/standings-admin.service";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";

const standingsRoutes = new Hono<AppEnv>();

// GET /admin/standings - List standings grouped by tracked league
standingsRoutes.get(
  "/standings",
  requirePermission("standing", "view"),
  describeRoute({
    description: "List standings grouped by tracked league",
    tags: ["Standings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const result = await getStandings();
    return c.json(result);
  },
);

export { standingsRoutes };

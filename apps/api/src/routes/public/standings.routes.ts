import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { getStandings } from "../../services/admin/standings-admin.service";

const publicStandingsRoutes = new Hono();

// GET /public/standings - List standings grouped by tracked league (no auth required)
publicStandingsRoutes.get(
  "/standings",
  describeRoute({
    description: "List standings grouped by tracked league (public)",
    tags: ["Public"],
    security: [],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const result = await getStandings();
    return c.json(result);
  },
);

export { publicStandingsRoutes };

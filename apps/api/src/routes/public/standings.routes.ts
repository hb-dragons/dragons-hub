import { Hono } from "hono";
import { getStandings } from "../../services/admin/standings-admin.service";

const publicStandingsRoutes = new Hono();

// GET /public/standings - List standings grouped by tracked league (no auth required)
publicStandingsRoutes.get("/standings", async (c) => {
  const result = await getStandings();
  return c.json(result);
});

export { publicStandingsRoutes };

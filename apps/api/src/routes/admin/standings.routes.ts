import { Hono } from "hono";
import { getStandings } from "../../services/admin/standings-admin.service";

const standingsRoutes = new Hono();

// GET /admin/standings - List standings grouped by tracked league
standingsRoutes.get("/standings", async (c) => {
  const result = await getStandings();
  return c.json(result);
});

export { standingsRoutes };

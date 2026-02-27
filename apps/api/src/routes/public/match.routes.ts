import { Hono } from "hono";
import { getOwnClubMatches } from "../../services/admin/match-admin.service";
import { matchListQuerySchema } from "../admin/match.schemas";

const publicMatchRoutes = new Hono();

// GET /public/matches - List own club matches (no auth required)
publicMatchRoutes.get("/matches", async (c) => {
  const query = matchListQuerySchema.parse({
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
    leagueId: c.req.query("leagueId"),
    dateFrom: c.req.query("dateFrom"),
    dateTo: c.req.query("dateTo"),
  });
  const result = await getOwnClubMatches(query);
  return c.json(result);
});

export { publicMatchRoutes };

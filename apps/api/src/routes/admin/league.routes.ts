import { Hono } from "hono";
import { z } from "zod";
import {
  getTrackedLeagues,
  resolveAndSaveLeagues,
} from "../../services/admin/league-discovery.service";

const leagueRoutes = new Hono();

const leagueNumbersSchema = z.object({
  leagueNumbers: z.array(z.number().int().positive()),
});

// GET /admin/settings/leagues - Get tracked leagues
leagueRoutes.get("/settings/leagues", async (c) => {
  const result = await getTrackedLeagues();
  return c.json(result);
});

// PUT /admin/settings/leagues - Set tracked leagues by liganr
leagueRoutes.put("/settings/leagues", async (c) => {
  const { leagueNumbers } = leagueNumbersSchema.parse(await c.req.json());
  const result = await resolveAndSaveLeagues(leagueNumbers);
  return c.json(result);
});

export { leagueRoutes };

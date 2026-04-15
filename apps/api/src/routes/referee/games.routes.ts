import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { requireReferee } from "../../middleware/auth";
import { getRefereeGames } from "../../services/referee/referee-games.service";

const refereeGamesRoutes = new Hono<AppEnv>();
refereeGamesRoutes.use("/*", requireReferee);

refereeGamesRoutes.get("/games", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || 100), 500);
  const offset = Number(c.req.query("offset") || 0);
  const search = c.req.query("search") || undefined;
  const status = (c.req.query("status") || "active") as "active" | "cancelled" | "forfeited" | "all";
  const league = c.req.query("league") || undefined;
  const dateFrom = c.req.query("dateFrom") || undefined;
  const dateTo = c.req.query("dateTo") || undefined;

  const result = await getRefereeGames({ limit, offset, search, status, league, dateFrom, dateTo });
  return c.json(result);
});

export { refereeGamesRoutes };

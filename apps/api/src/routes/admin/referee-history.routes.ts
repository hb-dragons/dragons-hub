import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";
import {
  getRefereeHistorySummary,
  getRefereeHistoryGames,
} from "../../services/admin/referee-history.service";
import {
  historyFilterSchema,
  historyGamesQuerySchema,
} from "./referee-history.schemas";

const adminRefereeHistoryRoutes = new Hono<AppEnv>();

// GET /admin/referee/history/summary - KPIs + leaderboard for a date range
adminRefereeHistoryRoutes.get(
  "/referee/history/summary",
  requirePermission("assignment", "view"),
  describeRoute({
    description: "Referee history KPIs + leaderboard for a date range",
    tags: ["Referees"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const parsed = historyFilterSchema.parse({
      mode: c.req.query("mode"),
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
      league: c.req.query("league"),
      status: c.req.query("status"),
    });
    const result = await getRefereeHistorySummary(parsed);
    return c.json(result);
  },
);

// GET /admin/referee/history/games - Paginated past referee games
adminRefereeHistoryRoutes.get(
  "/referee/history/games",
  requirePermission("assignment", "view"),
  describeRoute({
    description: "Paginated past referee games",
    tags: ["Referees"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const parsed = historyGamesQuerySchema.parse({
      mode: c.req.query("mode"),
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
      league: c.req.query("league"),
      status: c.req.query("status"),
      search: c.req.query("search"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    });
    const result = await getRefereeHistoryGames(parsed);
    return c.json(result);
  },
);

export { adminRefereeHistoryRoutes };

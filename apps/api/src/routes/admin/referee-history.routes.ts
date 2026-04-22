import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { requirePermission } from "../../middleware/rbac";
import { logger } from "../../config/logger";
import type { AppEnv } from "../../types";
import {
  getRefereeHistorySummary,
  getRefereeHistoryGames,
} from "../../services/admin/referee-history.service";
import {
  historyFilterSchema,
  historyGamesQuerySchema,
} from "./referee-history.schemas";
import {
  GAMES_CSV_HEADERS,
  gamesToCsvRows,
  toCsv,
} from "../../services/admin/referee-history.csv";

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
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
      league: c.req.query("league"),
      status: c.req.query("status"),
      search: c.req.query("search"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      refereeApiId: c.req.query("refereeApiId"),
    });
    const result = await getRefereeHistoryGames(parsed);
    return c.json(result);
  },
);

// GET /admin/referee/history/games.csv - CSV export of all games matching filters
adminRefereeHistoryRoutes.get(
  "/referee/history/games.csv",
  requirePermission("assignment", "view"),
  describeRoute({
    description: "CSV export of referee history games",
    tags: ["Referees"],
    responses: { 200: { description: "text/csv" } },
  }),
  async (c) => {
    const parsed = historyGamesQuerySchema.parse({
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
      league: c.req.query("league"),
      status: c.req.query("status"),
      search: c.req.query("search"),
      refereeApiId: c.req.query("refereeApiId"),
      // CSV always exports a full page; override after validation.
      // If the dataset exceeds this cap, `page.hasMore` drives the truncation header.
    });
    const CSV_MAX_ROWS = 1000;
    const page = await getRefereeHistoryGames({
      ...parsed,
      limit: CSV_MAX_ROWS,
      offset: 0,
    });
    if (page.hasMore) {
      logger.warn(
        {
          total: page.total,
          returned: page.items.length,
          dateFrom: parsed.dateFrom,
          dateTo: parsed.dateTo,
        },
        "CSV export truncated — consider paginating or widening limit",
      );
    }
    const BOM = "﻿";
    const csv = BOM + toCsv(GAMES_CSV_HEADERS, gamesToCsvRows(page.items));
    const from = parsed.dateFrom ?? "range";
    const to = parsed.dateTo ?? "range";
    const headers: Record<string, string> = {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        `attachment; filename="referee-history-games-${from}-${to}.csv"`,
      "X-Total-Count": String(page.total),
    };
    if (page.hasMore) {
      headers["X-Result-Truncated"] = "true";
    }
    return new Response(csv, { headers });
  },
);

export { adminRefereeHistoryRoutes };

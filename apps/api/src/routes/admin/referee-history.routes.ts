import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import { logger } from "../../config/logger";
import type { AppEnv } from "../../types";
import {
  getRefereeHistorySummary,
  getRefereeHistoryGames,
  getRefereeHistoryLeaderboard,
} from "../../services/admin/referee-history.service";
import {
  refereeHistoryFilterSchema,
  refereeHistoryGamesQuerySchema,
} from "@dragons/contracts";
import {
  GAMES_CSV_HEADERS,
  gamesToCsvRows,
  LEADERBOARD_CSV_HEADERS,
  leaderboardToCsvRows,
  toCsv,
} from "../../services/admin/referee-history.csv";

const adminRefereeHistoryRoutes = new Hono<AppEnv>();

// GET /admin/referee/history/summary - KPIs + leaderboard for a date range
adminRefereeHistoryRoutes.get(
  "/referee/history/summary",
  requirePermission("assignment", "view"),
  validator("query", refereeHistoryFilterSchema, validationHook),
  describeRoute({
    description: "Referee history KPIs + leaderboard for a date range",
    tags: ["Referees"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const parsed = c.req.valid("query");
    const result = await getRefereeHistorySummary(parsed);
    return c.json(result);
  },
);

// GET /admin/referee/history/games - Paginated past referee games
adminRefereeHistoryRoutes.get(
  "/referee/history/games",
  requirePermission("assignment", "view"),
  validator("query", refereeHistoryGamesQuerySchema, validationHook),
  describeRoute({
    description: "Paginated past referee games",
    tags: ["Referees"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const parsed = c.req.valid("query");
    const result = await getRefereeHistoryGames(parsed);
    return c.json(result);
  },
);

// GET /admin/referee/history/games.csv - CSV export of all games matching filters
adminRefereeHistoryRoutes.get(
  "/referee/history/games.csv",
  requirePermission("assignment", "view"),
  validator("query", refereeHistoryGamesQuerySchema, validationHook),
  describeRoute({
    description: "CSV export of referee history games",
    tags: ["Referees"],
    responses: { 200: { description: "text/csv" } },
  }),
  async (c) => {
    const parsed = c.req.valid("query");
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

// GET /admin/referee/history/leaderboard.csv - CSV export of referee leaderboard (no row cap)
adminRefereeHistoryRoutes.get(
  "/referee/history/leaderboard.csv",
  requirePermission("assignment", "view"),
  validator("query", refereeHistoryFilterSchema, validationHook),
  describeRoute({
    description: "CSV export of referee history leaderboard",
    tags: ["Referees"],
    responses: { 200: { description: "text/csv" } },
  }),
  async (c) => {
    const parsed = c.req.valid("query");
    const entries = await getRefereeHistoryLeaderboard(parsed, { limit: 10000 });
    const BOM = "﻿";
    const csv = BOM + toCsv(LEADERBOARD_CSV_HEADERS, leaderboardToCsvRows(entries));
    const from = parsed.dateFrom ?? "range";
    const to = parsed.dateTo ?? "range";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          `attachment; filename="referee-history-leaderboard-${from}-${to}.csv"`,
        "X-Total-Count": String(entries.length),
      },
    });
  },
);

export { adminRefereeHistoryRoutes };

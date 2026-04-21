import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { requireRefereeSelfOrPermission } from "../../middleware/rbac";
import {
  getVisibleRefereeGames,
  getVisibleRefereeGameById,
  getVisibleRefereeGameByMatchId,
} from "../../services/referee/referee-game-visibility.service";

const refereeGamesRoutes = new Hono<AppEnv>();

const gate = requireRefereeSelfOrPermission("assignment", "view");

refereeGamesRoutes.get("/games", gate, async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || 100), 500);
  const offset = Number(c.req.query("offset") || 0);
  const search = c.req.query("search") || undefined;
  const status = (c.req.query("status") || "active") as "active" | "cancelled" | "forfeited" | "all";
  const league = c.req.query("league") || undefined;
  const dateFrom = c.req.query("dateFrom") || undefined;
  const dateTo = c.req.query("dateTo") || undefined;

  const refereeId = c.get("refereeId") ?? null;
  const params = { limit, offset, search, status, league, dateFrom, dateTo };
  const result = await getVisibleRefereeGames(refereeId, params);
  return c.json(result);
});

refereeGamesRoutes.get("/matches/:matchId", gate, async (c) => {
  const matchId = Number(c.req.param("matchId"));
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return c.json({ error: "Invalid matchId", code: "VALIDATION_ERROR" }, 400);
  }

  const refereeId = c.get("refereeId") ?? null;
  const row = await getVisibleRefereeGameByMatchId(refereeId, matchId);
  if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
  return c.json(row);
});

refereeGamesRoutes.get("/games/:id", gate, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, 400);
  }

  const refereeId = c.get("refereeId") ?? null;
  const row = await getVisibleRefereeGameById(refereeId, id);
  if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
  return c.json(row);
});

export { refereeGamesRoutes };

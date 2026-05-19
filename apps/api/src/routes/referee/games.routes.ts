import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types";
import { requireRefereeSelfOrPermission } from "../../middleware/rbac";
import {
  getVisibleRefereeGames,
  getVisibleRefereeGameById,
  getVisibleRefereeGameByMatchId,
  getVisibleRefereeGameByApiMatchId,
} from "../../services/referee/referee-game-visibility.service";

const gamesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().min(1).optional(),
  status: z.enum(["active", "cancelled", "forfeited", "all"]).default("active"),
  league: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined)),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  gameType: z.enum(["home", "away", "both"]).optional(),
  assignedRefereeApiId: z.coerce.number().int().positive().optional(),
  slotStatus: z.enum(["open", "offered", "any"]).optional(),
});

const refereeGamesRoutes = new Hono<AppEnv>();

// Any role with `assignment.view` (admin, refereeAdmin) gets cross-referee
// visibility; a referee without that permission is scoped to their own games
// via c.get("refereeId"). To restrict cross-referee visibility to a smaller
// allowlist, swap to a role-based guard rather than a permission-based one.
const gate = requireRefereeSelfOrPermission("assignment", "view");

refereeGamesRoutes.get("/games", gate, async (c) => {
  const parsed = gamesQuerySchema.safeParse({
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
    search: c.req.query("search"),
    status: c.req.query("status"),
    league: c.req.query("league"),
    dateFrom: c.req.query("dateFrom"),
    dateTo: c.req.query("dateTo"),
    gameType: c.req.query("gameType"),
    assignedRefereeApiId: c.req.query("assignedRefereeApiId"),
    slotStatus: c.req.query("slotStatus"),
  });
  if (!parsed.success) {
    return c.json(
      { error: "Invalid query parameters", code: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      400,
    );
  }
  const refereeId = c.get("refereeId") ?? null;
  const result = await getVisibleRefereeGames(refereeId, parsed.data);
  return c.json(result);
});

refereeGamesRoutes.get("/games/by-api-match/:apiMatchId", gate, async (c) => {
  const apiMatchId = Number(c.req.param("apiMatchId"));
  if (!Number.isInteger(apiMatchId) || apiMatchId <= 0) {
    return c.json({ error: "Invalid apiMatchId", code: "VALIDATION_ERROR" }, 400);
  }

  const refereeId = c.get("refereeId") ?? null;
  const row = await getVisibleRefereeGameByApiMatchId(refereeId, apiMatchId);
  if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
  return c.json(row);
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

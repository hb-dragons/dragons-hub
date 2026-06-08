import { Hono } from "hono";
import { validator } from "hono-openapi";
import type { AppEnv } from "../../types";
import { requireRefereeSelfOrPermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import { refereeGamesQuerySchema } from "@dragons/contracts";
import {
  getVisibleRefereeGames,
  getVisibleRefereeGameById,
  getVisibleRefereeGameByMatchId,
  getVisibleRefereeGameByApiMatchId,
} from "../../services/referee/referee-game-visibility.service";

const refereeGamesRoutes = new Hono<AppEnv>();

// Any role with `assignment.view` (admin, refereeAdmin) gets cross-referee
// visibility; a referee without that permission is scoped to their own games
// via c.get("refereeId"). To restrict cross-referee visibility to a smaller
// allowlist, swap to a role-based guard rather than a permission-based one.
const gate = requireRefereeSelfOrPermission("assignment", "view");

refereeGamesRoutes.get(
  "/games",
  gate,
  validator("query", refereeGamesQuerySchema, validationHook),
  async (c) => {
    const query = c.req.valid("query");
    const refereeId = c.get("refereeId") ?? null;
    const result = await getVisibleRefereeGames(refereeId, query);
    return c.json(result);
  },
);

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

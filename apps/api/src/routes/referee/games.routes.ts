import { Hono } from "hono";
import { validator } from "hono-openapi";
import type { AppEnv } from "../../types";
import { requireRefereeSelfOrAdminRole } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import {
  refereeGamesQuerySchema,
  refereeApiMatchParamSchema,
  refereeMatchIdParamSchema,
  refereeGameIdParamSchema,
} from "@dragons/contracts";
import {
  getVisibleRefereeGames,
  getVisibleRefereeGameById,
  getVisibleRefereeGameByMatchId,
  getVisibleRefereeGameByApiMatchId,
} from "../../services/referee/referee-game-visibility.service";

const refereeGamesRoutes = new Hono<AppEnv>();

// admin and refereeAdmin get cross-referee (wide) visibility; a referee without
// either role is scoped to their own games via c.get("refereeId").
const gate = requireRefereeSelfOrAdminRole(["admin", "refereeAdmin"]);

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

refereeGamesRoutes.get(
  "/games/by-api-match/:apiMatchId",
  gate,
  validator("param", refereeApiMatchParamSchema, validationHook),
  async (c) => {
    const { apiMatchId } = c.req.valid("param");
    const refereeId = c.get("refereeId") ?? null;
    const row = await getVisibleRefereeGameByApiMatchId(refereeId, apiMatchId);
    if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(row);
  },
);

refereeGamesRoutes.get(
  "/matches/:matchId",
  gate,
  validator("param", refereeMatchIdParamSchema, validationHook),
  async (c) => {
    const { matchId } = c.req.valid("param");
    const refereeId = c.get("refereeId") ?? null;
    const row = await getVisibleRefereeGameByMatchId(refereeId, matchId);
    if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(row);
  },
);

refereeGamesRoutes.get(
  "/games/:id",
  gate,
  validator("param", refereeGameIdParamSchema, validationHook),
  async (c) => {
    const { id } = c.req.valid("param");
    const refereeId = c.get("refereeId") ?? null;
    const row = await getVisibleRefereeGameById(refereeId, id);
    if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(row);
  },
);

export { refereeGamesRoutes };

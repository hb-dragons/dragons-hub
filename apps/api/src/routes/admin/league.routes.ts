import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  getTrackedLeagues,
  setLeagueOwnClubRefs,
  getLeagueTeams,
} from "../../services/admin/league-discovery.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import { leagueOwnClubRefsSchema, leagueIdParamSchema, ligaIdParamSchema } from "@dragons/contracts";

const leagueRoutes = new Hono<AppEnv>();

const settingsUpdate = requirePermission("settings", "update");

// GET /admin/settings/leagues - Get tracked leagues
leagueRoutes.get(
  "/settings/leagues",
  settingsUpdate,
  describeRoute({
    description: "Get tracked leagues",
    tags: ["Leagues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const result = await getTrackedLeagues();
    return c.json(result);
  },
);

// PATCH /admin/settings/leagues/:id/own-club-refs - Toggle own-club-refs for a league
leagueRoutes.patch(
  "/settings/leagues/:id/own-club-refs",
  settingsUpdate,
  validator("param", leagueIdParamSchema, validationHook),
  validator("json", leagueOwnClubRefsSchema, validationHook),
  describeRoute({
    description: "Set whether a league uses own-club referees",
    tags: ["Leagues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { id: leagueId } = c.req.valid("param");
    const { ownClubRefs } = c.req.valid("json");
    await setLeagueOwnClubRefs(leagueId, ownClubRefs);
    return c.json({ ok: true });
  },
);

// GET /admin/leagues/:ligaId/teams - list a federation league's team roster
leagueRoutes.get(
  "/leagues/:ligaId/teams",
  settingsUpdate,
  validator("param", ligaIdParamSchema, validationHook),
  describeRoute({
    description: "List the teams in a federation league",
    tags: ["Leagues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { ligaId } = c.req.valid("param");
    return c.json(await getLeagueTeams(ligaId));
  },
);

export { leagueRoutes };

import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  getTrackedLeagues,
  resolveAndSaveLeagues,
  setLeagueOwnClubRefs,
} from "../../services/admin/league-discovery.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import { leagueNumbersSchema, leagueOwnClubRefsSchema } from "@dragons/contracts";

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

// PUT /admin/settings/leagues - Set tracked leagues by liganr
leagueRoutes.put(
  "/settings/leagues",
  settingsUpdate,
  validator("json", leagueNumbersSchema, validationHook),
  describeRoute({
    description: "Set tracked leagues by league number",
    tags: ["Leagues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { leagueNumbers } = c.req.valid("json");
    const result = await resolveAndSaveLeagues(leagueNumbers);
    return c.json(result);
  },
);

// PATCH /admin/settings/leagues/:id/own-club-refs - Toggle own-club-refs for a league
leagueRoutes.patch(
  "/settings/leagues/:id/own-club-refs",
  settingsUpdate,
  validator("json", leagueOwnClubRefsSchema, validationHook),
  describeRoute({
    description: "Set whether a league uses own-club referees",
    tags: ["Leagues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const leagueId = parseInt(c.req.param("id"), 10);
    if (!Number.isInteger(leagueId) || leagueId <= 0) {
      return c.json({ error: "Invalid id", code: "BAD_REQUEST" }, 400);
    }
    const { ownClubRefs } = c.req.valid("json");
    await setLeagueOwnClubRefs(leagueId, ownClubRefs);
    return c.json({ ok: true });
  },
);

export { leagueRoutes };

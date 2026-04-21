import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import {
  getTrackedLeagues,
  resolveAndSaveLeagues,
  setLeagueOwnClubRefs,
} from "../../services/admin/league-discovery.service";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";

const leagueRoutes = new Hono<AppEnv>();

const settingsUpdate = requirePermission("settings", "update");

const leagueNumbersSchema = z.object({
  leagueNumbers: z.array(z.number().int().positive()),
});

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
  describeRoute({
    description: "Set tracked leagues by league number",
    tags: ["Leagues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { leagueNumbers } = leagueNumbersSchema.parse(await c.req.json());
    const result = await resolveAndSaveLeagues(leagueNumbers);
    return c.json(result);
  },
);

const ownClubRefsSchema = z.object({
  ownClubRefs: z.boolean(),
});

// PATCH /admin/settings/leagues/:id/own-club-refs - Toggle own-club-refs for a league
leagueRoutes.patch(
  "/settings/leagues/:id/own-club-refs",
  settingsUpdate,
  describeRoute({
    description: "Set whether a league uses own-club referees",
    tags: ["Leagues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const leagueId = parseInt(c.req.param("id"), 10);
    const { ownClubRefs } = ownClubRefsSchema.parse(await c.req.json());
    await setLeagueOwnClubRefs(leagueId, ownClubRefs);
    return c.json({ ok: true });
  },
);

export { leagueRoutes };

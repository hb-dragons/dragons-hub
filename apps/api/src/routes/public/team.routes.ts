import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { publicTeamIdParamSchema } from "@dragons/contracts";
import { validationHook } from "../../middleware/validation";
import { listPublicTeams } from "../../services/public/team-list.service";
import { getTeamStats } from "../../services/public/team-stats.service";

const publicTeamRoutes = new Hono();

// GET /public/teams - List all teams (no auth required)
publicTeamRoutes.get(
  "/teams",
  describeRoute({
    description: "List all teams (public)",
    tags: ["Public"],
    security: [],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => c.json(await listPublicTeams()),
);

// GET /public/teams/:id/stats - Season stats and recent form for a team
publicTeamRoutes.get(
  "/teams/:id/stats",
  validator("param", publicTeamIdParamSchema, validationHook),
  describeRoute({
    description: "Get season stats and recent form for a team (public)",
    tags: ["Public"],
    security: [],
    responses: {
      200: { description: "Team stats" },
      400: { description: "Invalid team id" },
      404: { description: "Team not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const stats = await getTeamStats(id);
    if (!stats) {
      return c.json({ error: "Team not found", code: "NOT_FOUND" }, 404);
    }
    return c.json(stats);
  },
);

export { publicTeamRoutes };

import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import {
  getOwnClubTeams,
  updateTeam,
} from "../../services/admin/team-admin.service";
import { teamIdParamSchema, teamUpdateBodySchema } from "./team.schemas";

const teamRoutes = new Hono();

// GET /admin/teams - List own club teams
teamRoutes.get(
  "/teams",
  describeRoute({
    description: "List own club teams",
    tags: ["Teams"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const teams = await getOwnClubTeams();
    return c.json(teams);
  },
);

// PATCH /admin/teams/:id - Update team properties
teamRoutes.patch(
  "/teams/:id",
  describeRoute({
    description: "Update team properties",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      404: { description: "Team not found" },
    },
  }),
  async (c) => {
    const { id } = teamIdParamSchema.parse({ id: c.req.param("id") });
    const body = teamUpdateBodySchema.parse(await c.req.json());

    const result = await updateTeam(id, body);

    if (!result) {
      return c.json({ error: "Team not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

export { teamRoutes };

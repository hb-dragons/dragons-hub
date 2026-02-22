import { Hono } from "hono";
import {
  getOwnClubTeams,
  updateTeamCustomName,
} from "../../services/admin/team-admin.service";
import { teamIdParamSchema, teamUpdateBodySchema } from "./team.schemas";

const teamRoutes = new Hono();

// GET /admin/teams - List own club teams
teamRoutes.get("/teams", async (c) => {
  const teams = await getOwnClubTeams();
  return c.json(teams);
});

// PATCH /admin/teams/:id - Update custom name
teamRoutes.patch("/teams/:id", async (c) => {
  const { id } = teamIdParamSchema.parse({ id: c.req.param("id") });
  const body = teamUpdateBodySchema.parse(await c.req.json());

  const result = await updateTeamCustomName(id, body.customName);

  if (!result) {
    return c.json({ error: "Team not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result);
});

export { teamRoutes };

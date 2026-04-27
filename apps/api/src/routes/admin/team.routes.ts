import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import {
  getOwnClubTeams,
  updateTeam,
  reorderOwnClubTeams,
} from "../../services/admin/team-admin.service";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";
import {
  teamIdParamSchema,
  teamUpdateBodySchema,
  teamReorderBodySchema,
} from "./team.schemas";

const teamRoutes = new Hono<AppEnv>();

// GET /admin/teams - List own club teams
teamRoutes.get(
  "/teams",
  requirePermission("team", "view"),
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

// PUT /admin/teams/order - Reorder own club teams
teamRoutes.put(
  "/teams/order",
  requirePermission("team", "manage"),
  describeRoute({
    description: "Reorder own club teams",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      400: { description: "Invalid team set or duplicate id" },
    },
  }),
  async (c) => {
    const { teamIds } = teamReorderBodySchema.parse(await c.req.json());
    try {
      const result = await reorderOwnClubTeams(teamIds);
      return c.json(result);
    } catch (err) {
      const code = err instanceof Error ? err.message : "REORDER_FAILED";
      if (code === "INVALID_TEAM_SET" || code === "DUPLICATE_TEAM_ID") {
        return c.json({ error: code, code }, 400);
      }
      throw err;
    }
  },
);

// PATCH /admin/teams/:id - Update team properties
teamRoutes.patch(
  "/teams/:id",
  requirePermission("team", "manage"),
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

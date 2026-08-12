import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  getOwnClubTeams,
  updateTeamEntry,
  reorderTeamEntries,
} from "../../services/admin/team-admin.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import {
  teamIdParamSchema,
  teamUpdateBodySchema,
  teamReorderBodySchema,
  teamsListQuerySchema,
} from "@dragons/contracts";

const teamRoutes = new Hono<AppEnv>();

// GET /admin/teams - List own club team entries (defaults to the active season)
teamRoutes.get(
  "/teams",
  requirePermission("team", "view"),
  validator("query", teamsListQuerySchema, validationHook),
  describeRoute({
    description: "List own club team entries (defaults to the active season)",
    tags: ["Teams"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const teams = await getOwnClubTeams(c.req.valid("query").seasonId);
    return c.json(teams);
  },
);

// PUT /admin/teams/order - Reorder a season's team entries
teamRoutes.put(
  "/teams/order",
  requirePermission("team", "manage"),
  validator("json", teamReorderBodySchema, validationHook),
  describeRoute({
    description: "Reorder a season's team entries",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      400: { description: "Invalid team set or duplicate id" },
    },
  }),
  async (c) => {
    // TeamReorderError is mapped to 400 centrally in middleware/error.ts.
    const { seasonId, entryIds } = c.req.valid("json");
    return c.json(await reorderTeamEntries(entryIds, seasonId));
  },
);

// PATCH /admin/teams/:id - Update a team entry
teamRoutes.patch(
  "/teams/:id",
  requirePermission("team", "manage"),
  validator("param", teamIdParamSchema, validationHook),
  validator("json", teamUpdateBodySchema, validationHook),
  describeRoute({
    description: "Update a team entry",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      404: { description: "Team entry not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await updateTeamEntry(id, body);

    if (!result) {
      return c.json({ error: "Team entry not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

export { teamRoutes };

import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  listTeamStaff,
  createTeamStaff,
  updateTeamStaff,
  deleteTeamStaff,
} from "../../services/admin/team-staff.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import {
  teamIdParamSchema,
  teamStaffParamSchema,
  teamStaffCreateBodySchema,
  teamStaffUpdateBodySchema,
} from "@dragons/contracts";

const teamStaffRoutes = new Hono<AppEnv>();

const entryNotFound = { error: "Team entry not found", code: "NOT_FOUND" } as const;
const staffNotFound = { error: "Staff member not found", code: "NOT_FOUND" } as const;

// GET /admin/teams/:id/staff - List the staff of a team entry
teamStaffRoutes.get(
  "/teams/:id/staff",
  requirePermission("team", "view"),
  validator("param", teamIdParamSchema, validationHook),
  describeRoute({
    description: "List the staff of a team entry",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      404: { description: "Team entry not found" },
    },
  }),
  async (c) => {
    const staff = await listTeamStaff(c.req.valid("param").id);
    if (!staff) return c.json(entryNotFound, 404);
    return c.json(staff);
  },
);

// POST /admin/teams/:id/staff - Add a staff member to a team entry
teamStaffRoutes.post(
  "/teams/:id/staff",
  requirePermission("team", "manage"),
  validator("param", teamIdParamSchema, validationHook),
  validator("json", teamStaffCreateBodySchema, validationHook),
  describeRoute({
    description: "Add a staff member to a team entry",
    tags: ["Teams"],
    responses: {
      201: { description: "Created" },
      404: { description: "Team entry not found" },
    },
  }),
  async (c) => {
    const created = await createTeamStaff(c.req.valid("param").id, c.req.valid("json"));
    if (!created) return c.json(entryNotFound, 404);
    return c.json(created, 201);
  },
);

// PATCH /admin/teams/:id/staff/:staffId - Update a staff member
teamStaffRoutes.patch(
  "/teams/:id/staff/:staffId",
  requirePermission("team", "manage"),
  validator("param", teamStaffParamSchema, validationHook),
  validator("json", teamStaffUpdateBodySchema, validationHook),
  describeRoute({
    description: "Update a staff member of a team entry",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      404: { description: "Team entry or staff member not found" },
    },
  }),
  async (c) => {
    const { id, staffId } = c.req.valid("param");
    const updated = await updateTeamStaff(id, staffId, c.req.valid("json"));
    if (!updated) return c.json(staffNotFound, 404);
    return c.json(updated);
  },
);

// DELETE /admin/teams/:id/staff/:staffId - Remove a staff member
teamStaffRoutes.delete(
  "/teams/:id/staff/:staffId",
  requirePermission("team", "manage"),
  validator("param", teamStaffParamSchema, validationHook),
  describeRoute({
    description: "Remove a staff member from a team entry",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      404: { description: "Team entry or staff member not found" },
    },
  }),
  async (c) => {
    const { id, staffId } = c.req.valid("param");
    if (!(await deleteTeamStaff(id, staffId))) return c.json(staffNotFound, 404);
    return c.json({ success: true });
  },
);

export { teamStaffRoutes };

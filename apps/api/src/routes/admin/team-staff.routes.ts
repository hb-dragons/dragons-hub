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

/**
 * Who works with a team, in what role (ADR 0009). The people themselves — and
 * their portraits — are served by `staff-people.routes.ts`, so nothing here can
 * write one team's copy of a phone number.
 */
const teamStaffRoutes = new Hono<AppEnv>();

const entryNotFound = { error: "Team entry not found", code: "NOT_FOUND" } as const;
const staffNotFound = { error: "Staff member not found", code: "NOT_FOUND" } as const;
const personNotFound = { error: "Staff person not found", code: "NOT_FOUND" } as const;
const alreadyAssigned = {
  error: "Staff person is already attached to this team",
  code: "STAFF_ALREADY_ASSIGNED",
} as const;

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

// POST /admin/teams/:id/staff - Attach a staff person to a team entry
teamStaffRoutes.post(
  "/teams/:id/staff",
  requirePermission("team", "manage"),
  validator("param", teamIdParamSchema, validationHook),
  validator("json", teamStaffCreateBodySchema, validationHook),
  describeRoute({
    description: "Attach a staff person to a team entry, or create one inline",
    tags: ["Teams"],
    responses: {
      201: { description: "Created" },
      404: { description: "Team entry or staff person not found" },
      409: { description: "Staff person is already attached to this team" },
    },
  }),
  async (c) => {
    const result = await createTeamStaff(c.req.valid("param").id, c.req.valid("json"));
    if (result.ok) return c.json(result.member, 201);
    if (result.reason === "person-not-found") return c.json(personNotFound, 404);
    if (result.reason === "duplicate") return c.json(alreadyAssigned, 409);
    return c.json(entryNotFound, 404);
  },
);

// PATCH /admin/teams/:id/staff/:staffId - Update the role or the contact flag
teamStaffRoutes.patch(
  "/teams/:id/staff/:staffId",
  requirePermission("team", "manage"),
  validator("param", teamStaffParamSchema, validationHook),
  validator("json", teamStaffUpdateBodySchema, validationHook),
  describeRoute({
    description: "Update the role and referee-contact flag of a team staff assignment",
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

// DELETE /admin/teams/:id/staff/:staffId - Detach a staff person from the team
teamStaffRoutes.delete(
  "/teams/:id/staff/:staffId",
  requirePermission("team", "manage"),
  validator("param", teamStaffParamSchema, validationHook),
  describeRoute({
    description: "Remove a staff member from a team entry, leaving the person in the pool",
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

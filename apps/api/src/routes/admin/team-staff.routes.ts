import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  listTeamStaff,
  createTeamStaff,
  updateTeamStaff,
  deleteTeamStaff,
  setTeamStaffPhoto,
  getTeamStaffPhoto,
} from "../../services/admin/team-staff.service";
import { PortraitRejected } from "../../services/admin/team-staff-photo.service";
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
const photoNotFound = { error: "Portrait not found", code: "NOT_FOUND" } as const;

/** The central 400 envelope, so a rejected upload reads like a failed validator. */
const invalidFile = (message: string) => ({
  error: "Invalid request data",
  code: "VALIDATION_ERROR",
  details: [{ path: "file", message }],
});
const fileRequired = invalidFile("A file field is required");

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

// POST /admin/teams/:id/staff/:staffId/photo - Upload or replace a portrait
teamStaffRoutes.post(
  "/teams/:id/staff/:staffId/photo",
  requirePermission("team", "manage"),
  validator("param", teamStaffParamSchema, validationHook),
  describeRoute({
    description: "Upload or replace the portrait of a staff member",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      400: { description: "Not a storable image" },
      404: { description: "Team entry or staff member not found" },
    },
  }),
  async (c) => {
    const { id, staffId } = c.req.valid("param");
    const file = (await c.req.parseBody())["file"];
    if (!(file instanceof File)) return c.json(fileRequired, 400);

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const updated = await setTeamStaffPhoto(id, staffId, buffer, file.type);
      if (!updated) return c.json(staffNotFound, 404);
      return c.json(updated);
    } catch (error) {
      // Anything else - a bucket outage, a missing GCS_BUCKET_NAME - is not the
      // caller's fault and belongs in the 500 the error middleware produces.
      if (!(error instanceof PortraitRejected)) throw error;
      return c.json(invalidFile(error.message), 400);
    }
  },
);

// GET /admin/teams/:id/staff/:staffId/photo - Serve a stored portrait
teamStaffRoutes.get(
  "/teams/:id/staff/:staffId/photo",
  requirePermission("team", "view"),
  validator("param", teamStaffParamSchema, validationHook),
  describeRoute({
    description: "Get the portrait of a staff member",
    tags: ["Teams"],
    responses: {
      200: { description: "Image" },
      404: { description: "No portrait for this staff member" },
    },
  }),
  async (c) => {
    const { id, staffId } = c.req.valid("param");
    const portrait = await getTeamStaffPhoto(id, staffId);
    if (!portrait) return c.json(photoNotFound, 404);
    return new Response(new Uint8Array(portrait.buffer), {
      headers: {
        "Content-Type": portrait.contentType,
        "Content-Length": String(portrait.buffer.length),
        // Safe to cache: `photoUrl` carries the object name, so a replaced
        // portrait is requested under a different URL.
        "Cache-Control": "private, max-age=3600",
      },
    });
  },
);

export { teamStaffRoutes };

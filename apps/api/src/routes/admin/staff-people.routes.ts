import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  listStaffPeople,
  createStaffPerson,
  updateStaffPerson,
  deleteStaffPerson,
  setStaffPersonPhoto,
  getStaffPersonPhoto,
} from "../../services/admin/staff-person.service";
import { PortraitRejected } from "../../services/admin/team-staff-photo.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import {
  staffPersonIdParamSchema,
  staffPersonCreateBodySchema,
  staffPersonUpdateBodySchema,
  staffPersonListQuerySchema,
} from "@dragons/contracts";

/**
 * The pool of staff people (ADR 0009). Everything about the human lives here —
 * name, contact data, licence, portrait — so a correction is one write and
 * every team the person trains shows it. The team-scoped routes in
 * `team-staff.routes.ts` own only the assignment.
 */
const staffPeopleRoutes = new Hono<AppEnv>();

const personNotFound = { error: "Staff person not found", code: "NOT_FOUND" } as const;
const photoNotFound = { error: "Portrait not found", code: "NOT_FOUND" } as const;
const stillAssigned = {
  error: "Staff person is still attached to a team",
  code: "STAFF_PERSON_ASSIGNED",
} as const;

/** The central 400 envelope, so a rejected upload reads like a failed validator. */
const invalidFile = (message: string) => ({
  error: "Invalid request data",
  code: "VALIDATION_ERROR",
  details: [{ path: "file", message }],
});
const fileRequired = invalidFile("A file field is required");

// GET /admin/staff-people - The pool, with this season's teams per person
staffPeopleRoutes.get(
  "/staff-people",
  requirePermission("team", "view"),
  validator("query", staffPersonListQuerySchema, validationHook),
  describeRoute({
    description: "List staff people with their current-season team assignments",
    tags: ["Teams"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => c.json(await listStaffPeople(c.req.valid("query").q)),
);

// POST /admin/staff-people - Add a person to the pool
staffPeopleRoutes.post(
  "/staff-people",
  requirePermission("team", "manage"),
  validator("json", staffPersonCreateBodySchema, validationHook),
  describeRoute({
    description: "Add a staff person to the pool",
    tags: ["Teams"],
    responses: { 201: { description: "Created" } },
  }),
  async (c) => c.json(await createStaffPerson(c.req.valid("json")), 201),
);

// PATCH /admin/staff-people/:id - Edit the person, for every team at once
staffPeopleRoutes.patch(
  "/staff-people/:id",
  requirePermission("team", "manage"),
  validator("param", staffPersonIdParamSchema, validationHook),
  validator("json", staffPersonUpdateBodySchema, validationHook),
  describeRoute({
    description: "Update a staff person's name, contact data and licence",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      404: { description: "Staff person not found" },
    },
  }),
  async (c) => {
    const updated = await updateStaffPerson(c.req.valid("param").id, c.req.valid("json"));
    if (!updated) return c.json(personNotFound, 404);
    return c.json(updated);
  },
);

// DELETE /admin/staff-people/:id - Drop a person nobody is attached to
staffPeopleRoutes.delete(
  "/staff-people/:id",
  requirePermission("team", "manage"),
  validator("param", staffPersonIdParamSchema, validationHook),
  describeRoute({
    description: "Delete a staff person the club no longer holds data on",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      404: { description: "Staff person not found" },
      409: { description: "Staff person is still attached to a team" },
    },
  }),
  async (c) => {
    const result = await deleteStaffPerson(c.req.valid("param").id);
    if (result === "not-found") return c.json(personNotFound, 404);
    if (result === "assigned") return c.json(stillAssigned, 409);
    return c.json({ success: true });
  },
);

// POST /admin/staff-people/:id/photo - Upload or replace a portrait
staffPeopleRoutes.post(
  "/staff-people/:id/photo",
  requirePermission("team", "manage"),
  validator("param", staffPersonIdParamSchema, validationHook),
  describeRoute({
    description: "Upload or replace the portrait of a staff person",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      400: { description: "Not a storable image" },
      404: { description: "Staff person not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const file = (await c.req.parseBody())["file"];
    if (!(file instanceof File)) return c.json(fileRequired, 400);

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const updated = await setStaffPersonPhoto(id, buffer, file.type);
      if (!updated) return c.json(personNotFound, 404);
      return c.json(updated);
    } catch (error) {
      // Anything else - a bucket outage, a missing GCS_BUCKET_NAME - is not the
      // caller's fault and belongs in the 500 the error middleware produces.
      if (!(error instanceof PortraitRejected)) throw error;
      return c.json(invalidFile(error.message), 400);
    }
  },
);

// GET /admin/staff-people/:id/photo - Serve a stored portrait
staffPeopleRoutes.get(
  "/staff-people/:id/photo",
  requirePermission("team", "view"),
  validator("param", staffPersonIdParamSchema, validationHook),
  describeRoute({
    description: "Get the portrait of a staff person",
    tags: ["Teams"],
    responses: {
      200: { description: "Image" },
      404: { description: "No portrait for this staff person" },
    },
  }),
  async (c) => {
    const portrait = await getStaffPersonPhoto(c.req.valid("param").id);
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

export { staffPeopleRoutes };

import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { isStaff } from "@dragons/shared";
import { meStaffUpdateBodySchema } from "@dragons/contracts";
import { requireAuth } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import { getMyStaff, updateMyStaff } from "../../services/me/staff.service";
import type { AppEnv } from "../../types";

/**
 * The coach's own staff record (#315). Signed in is the whole authorisation:
 * the person id comes from `user.personId`, so a caller can only ever read and
 * write themselves and there is no id in the path to tamper with.
 *
 * An account with no staff link gets 404 rather than 403 — the app asks for
 * this record on every profile screen and hides the section on a 404, which is
 * the honest answer for "you have no such record" and keeps a coach's link
 * state out of the error vocabulary.
 */
const meStaffRoutes = new Hono<AppEnv>();

const noStaffRecord = { error: "No staff record for this account", code: "NOT_FOUND" } as const;

/** The linked person id, or `null` for an account with no staff link. */
function linkedPersonId(user: { personId?: number | null }): number | null {
  return isStaff(user) ? user.personId : null;
}

meStaffRoutes.get(
  "/staff",
  requireAuth,
  describeRoute({
    description: "Read the signed-in coach's own staff record and team assignments",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      404: { description: "The account is not linked to a staff person" },
    },
  }),
  async (c) => {
    const personId = linkedPersonId(c.get("user"));
    if (personId === null) return c.json(noStaffRecord, 404);
    const profile = await getMyStaff(personId);
    if (!profile) return c.json(noStaffRecord, 404);
    return c.json(profile);
  },
);

meStaffRoutes.patch(
  "/staff",
  requireAuth,
  validator("json", meStaffUpdateBodySchema, validationHook),
  describeRoute({
    description: "Update the signed-in coach's own phone, email and licence",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      400: { description: "Invalid body, or a field the club owns" },
      404: { description: "The account is not linked to a staff person" },
    },
  }),
  async (c) => {
    const personId = linkedPersonId(c.get("user"));
    if (personId === null) return c.json(noStaffRecord, 404);
    const updated = await updateMyStaff(personId, c.req.valid("json"));
    if (!updated) return c.json(noStaffRecord, 404);
    return c.json(updated);
  },
);

export { meStaffRoutes };

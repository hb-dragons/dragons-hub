import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireAnyRole } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import {
  userIdParamSchema,
  userRefereeLinkBodySchema,
  userStaffLinkBodySchema,
} from "@dragons/contracts";
import {
  setUserRefereeLink,
  setUserStaffLink,
} from "../../services/admin/user-admin.service";
import type { AppEnv } from "../../types";

const userRoutes = new Hono<AppEnv>();

userRoutes.patch(
  "/users/:id/referee-link",
  requireAnyRole("admin"),
  validator("param", userIdParamSchema, validationHook),
  validator("json", userRefereeLinkBodySchema, validationHook),
  describeRoute({
    description: "Link or unlink a referee record from a user account",
    tags: ["Users"],
    responses: {
      200: { description: "Success" },
      400: { description: "Invalid body" },
      404: { description: "Referee or user not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { refereeId } = c.req.valid("json");
    return c.json(await setUserRefereeLink(id, refereeId));
  },
);

userRoutes.patch(
  "/users/:id/staff-link",
  requireAnyRole("admin"),
  validator("param", userIdParamSchema, validationHook),
  validator("json", userStaffLinkBodySchema, validationHook),
  describeRoute({
    description: "Link or unlink a staff person from a user account",
    tags: ["Users"],
    responses: {
      200: { description: "Success" },
      400: { description: "Invalid body" },
      404: { description: "Staff person or user not found" },
      409: { description: "Staff person already linked to another account" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { personId, grantCoachRole } = c.req.valid("json");
    // An omitted flag grants nothing: the dialog defaults the checkbox on and
    // sends it either way, so the API's own default stays the conservative one.
    return c.json(await setUserStaffLink(id, personId, grantCoachRole ?? false));
  },
);

export { userRoutes };

import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireAnyRole } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import { userIdParamSchema, userRefereeLinkBodySchema } from "@dragons/contracts";
import { setUserRefereeLink } from "../../services/admin/user-admin.service";
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

export { userRoutes };

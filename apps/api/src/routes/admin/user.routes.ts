import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { db } from "../../config/database";
import { user as userTable, referees } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { requireAnyRole } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import { userRefereeLinkBodySchema } from "@dragons/contracts";

const userRoutes = new Hono();

userRoutes.patch(
  "/users/:id/referee-link",
  requireAnyRole("admin"),
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
    const userId = c.req.param("id");
    const body = c.req.valid("json");

    // Validate referee exists if linking
    if (body.refereeId !== null) {
      const [referee] = await db
        .select({ id: referees.id })
        .from(referees)
        .where(eq(referees.id, body.refereeId))
        .limit(1);

      if (!referee) {
        return c.json({ error: "Referee not found" }, 404);
      }
    }

    const [updated] = await db
      .update(userTable)
      .set({ refereeId: body.refereeId, updatedAt: new Date() })
      .where(eq(userTable.id, userId))
      .returning({ id: userTable.id, refereeId: userTable.refereeId });

    if (!updated) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(updated);
  },
);

export { userRoutes };

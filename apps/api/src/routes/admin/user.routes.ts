import { Hono } from "hono";
import { db } from "../../config/database";
import { user as userTable, referees } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { requirePermission } from "../../middleware/rbac";

const userRoutes = new Hono();

// PATCH /users/:id/referee-link - Link or unlink a referee to a user account
userRoutes.patch(
  "/users/:id/referee-link",
  requirePermission("user", "update"),
  async (c) => {
    const userId = c.req.param("id");
    const body = await c.req.json<{ refereeId: number | null }>();

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

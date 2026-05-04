import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../config/database";
import { user as userTable, referees } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { requireAnyRole } from "../../middleware/rbac";

const userRoutes = new Hono();

const refereeLinkBodySchema = z.object({
  refereeId: z.number().int().positive().nullable(),
});

userRoutes.patch(
  "/users/:id/referee-link",
  requireAnyRole("admin"),
  async (c) => {
    const userId = c.req.param("id");
    const parsed = refereeLinkBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", code: "BAD_REQUEST" }, 400);
    }
    const body = parsed.data;

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

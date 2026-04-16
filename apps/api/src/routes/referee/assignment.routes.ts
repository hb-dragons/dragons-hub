import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types";
import { auth } from "../../config/auth";
import { db } from "../../config/database";
import { referees, user as userTable } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import {
  assignReferee,
  AssignmentError,
} from "../../services/referee/referee-assignment.service";

const assignBodySchema = z.object({
  slotNumber: z.union([z.literal(1), z.literal(2)]),
  refereeApiId: z.number().int().positive(),
});

const ERROR_STATUS_MAP: Record<string, number> = {
  GAME_NOT_FOUND: 404,
  NOT_QUALIFIED: 422,
  SLOT_TAKEN: 409,
  DENY_RULE: 403,
  FEDERATION_ERROR: 502,
  FORBIDDEN: 403,
};

const refereeAssignmentRoutes = new Hono<AppEnv>();

refereeAssignmentRoutes.post("/games/:spielplanId/assign", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  if (session.user.role !== "referee" && session.user.role !== "admin") {
    return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
  }

  const spielplanId = Number(c.req.param("spielplanId"));
  if (!Number.isInteger(spielplanId) || spielplanId <= 0) {
    return c.json({ error: "Invalid spielplanId", code: "VALIDATION_ERROR" }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body", code: "VALIDATION_ERROR" }, 400);
  }
  const { slotNumber, refereeApiId } = assignBodySchema.parse(body);

  // Self-assign guard: referees can only assign themselves
  if (session.user.role === "referee") {
    const [userRow] = await db
      .select({ refereeId: userTable.refereeId })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1);

    if (!userRow?.refereeId) {
      return c.json({ error: "Referee profile not linked", code: "FORBIDDEN" }, 403);
    }

    const [refereeRow] = await db
      .select({ apiId: referees.apiId, isOwnClub: referees.isOwnClub })
      .from(referees)
      .where(eq(referees.id, userRow.refereeId))
      .limit(1);

    if (!refereeRow || refereeRow.apiId !== refereeApiId) {
      return c.json({ error: "Cannot assign another referee", code: "FORBIDDEN" }, 403);
    }

    if (!refereeRow.isOwnClub) {
      return c.json({ error: "Referee is not an own-club referee", code: "NOT_OWN_CLUB" }, 403);
    }
  }

  try {
    const result = await assignReferee(spielplanId, slotNumber, refereeApiId);
    return c.json(result);
  } catch (error) {
    if (error instanceof AssignmentError) {
      const status = ERROR_STATUS_MAP[error.code] ?? 500;
      return c.json({ error: error.message, code: error.code }, status as never);
    }
    throw error;
  }
});

export { refereeAssignmentRoutes };

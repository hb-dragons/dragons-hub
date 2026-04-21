import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types";
import { requireRefereeSelf } from "../../middleware/rbac";
import { db } from "../../config/database";
import { referees } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import {
  assignReferee,
  AssignmentError,
} from "../../services/referee/referee-assignment.service";
import {
  claimRefereeGame,
  unclaimRefereeGame,
} from "../../services/referee/referee-claim.service";

const assignBodySchema = z.object({
  slotNumber: z.union([z.literal(1), z.literal(2)]),
  refereeApiId: z.number().int().positive(),
});

const claimBodySchema = z
  .object({
    slotNumber: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .optional();

const ERROR_STATUS_MAP: Record<string, number> = {
  GAME_NOT_FOUND: 404,
  NOT_QUALIFIED: 422,
  SLOT_TAKEN: 409,
  DENY_RULE: 403,
  FEDERATION_ERROR: 502,
  FORBIDDEN: 403,
  NOT_OWN_CLUB: 403,
  NOT_ASSIGNED: 409,
};

// Admin-override variants live in admin/referee-assignment.routes.ts.
const refereeAssignmentRoutes = new Hono<AppEnv>();

refereeAssignmentRoutes.post("/games/:spielplanId/assign", requireRefereeSelf, async (c) => {
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

  // Ownership check: referee can only assign themselves.
  const refereeId = c.get("refereeId");
  if (refereeId === undefined) {
    return c.json({ error: "Referee profile not linked", code: "FORBIDDEN" }, 403);
  }

  const [refereeRow] = await db
    .select({ apiId: referees.apiId, isOwnClub: referees.isOwnClub })
    .from(referees)
    .where(eq(referees.id, refereeId))
    .limit(1);

  if (!refereeRow || refereeRow.apiId !== refereeApiId) {
    return c.json({ error: "Cannot assign another referee", code: "FORBIDDEN" }, 403);
  }

  if (!refereeRow.isOwnClub) {
    return c.json({ error: "Referee is not an own-club referee", code: "NOT_OWN_CLUB" }, 403);
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

refereeAssignmentRoutes.post("/games/:id/claim", requireRefereeSelf, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, 400);
  }

  const refereeId = c.get("refereeId");
  if (refereeId === undefined) {
    return c.json({ error: "Referee profile not linked", code: "FORBIDDEN" }, 403);
  }

  let parsed: { slotNumber?: 1 | 2 } | undefined;
  try {
    const raw = await c.req.text();
    parsed = raw ? claimBodySchema.parse(JSON.parse(raw)) : undefined;
  } catch {
    return c.json({ error: "Invalid JSON body", code: "VALIDATION_ERROR" }, 400);
  }

  try {
    const result = await claimRefereeGame({
      refereeId,
      gameId: id,
      slotNumber: parsed?.slotNumber,
    });
    return c.json(result);
  } catch (error) {
    if (error instanceof AssignmentError) {
      const status = ERROR_STATUS_MAP[error.code] ?? 500;
      return c.json({ error: error.message, code: error.code }, status as never);
    }
    throw error;
  }
});

refereeAssignmentRoutes.delete("/games/:id/claim", requireRefereeSelf, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, 400);
  }

  const refereeId = c.get("refereeId");
  if (refereeId === undefined) {
    return c.json({ error: "Referee profile not linked", code: "FORBIDDEN" }, 403);
  }

  try {
    const result = await unclaimRefereeGame({
      refereeId,
      gameId: id,
    });
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

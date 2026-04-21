import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types";
import { requirePermission } from "../../middleware/rbac";
import {
  assignReferee,
  unassignReferee,
  searchCandidates,
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

const adminRefereeAssignmentRoutes = new Hono<AppEnv>();

adminRefereeAssignmentRoutes.get(
  "/referee/games/:spielplanId/candidates",
  requirePermission("assignment", "view"),
  async (c) => {
    const spielplanId = Number(c.req.param("spielplanId"));
    if (!Number.isInteger(spielplanId) || spielplanId <= 0) {
      return c.json({ error: "Invalid spielplanId", code: "VALIDATION_ERROR" }, 400);
    }

    const search = c.req.query("search") ?? "";
    const pageFrom = Number(c.req.query("pageFrom") ?? "0");
    const pageSize = Number(c.req.query("pageSize") ?? "15");

    if (!Number.isInteger(pageFrom) || pageFrom < 0) {
      return c.json({ error: "Invalid pageFrom", code: "VALIDATION_ERROR" }, 400);
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return c.json({ error: "Invalid pageSize", code: "VALIDATION_ERROR" }, 400);
    }

    try {
      const result = await searchCandidates(spielplanId, search, pageFrom, pageSize);
      return c.json(result);
    } catch (error) {
      if (error instanceof AssignmentError) {
        const status = ERROR_STATUS_MAP[error.code] ?? 500;
        return c.json({ error: error.message, code: error.code }, status as never);
      }
      throw error;
    }
  },
);

adminRefereeAssignmentRoutes.post(
  "/referee/games/:spielplanId/assign",
  requirePermission("assignment", "create"),
  async (c) => {
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
  },
);

adminRefereeAssignmentRoutes.delete(
  "/referee/games/:spielplanId/assignment/:slotNumber",
  requirePermission("assignment", "delete"),
  async (c) => {
    const spielplanId = Number(c.req.param("spielplanId"));
    if (!Number.isInteger(spielplanId) || spielplanId <= 0) {
      return c.json({ error: "Invalid spielplanId", code: "VALIDATION_ERROR" }, 400);
    }

    const slotParam = Number(c.req.param("slotNumber"));
    if (slotParam !== 1 && slotParam !== 2) {
      return c.json({ error: "slotNumber must be 1 or 2", code: "VALIDATION_ERROR" }, 400);
    }
    const slotNumber = slotParam as 1 | 2;

    try {
      const result = await unassignReferee(spielplanId, slotNumber);
      return c.json(result);
    } catch (error) {
      if (error instanceof AssignmentError) {
        const status = ERROR_STATUS_MAP[error.code] ?? 500;
        return c.json({ error: error.message, code: error.code }, status as never);
      }
      throw error;
    }
  },
);

export { adminRefereeAssignmentRoutes };

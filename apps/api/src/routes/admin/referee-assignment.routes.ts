import { Hono } from "hono";
import { validator } from "hono-openapi";
import {
  refereeAssignBodySchema,
  spielplanIdParamSchema,
  refAssignmentCandidatesQuerySchema,
  assignmentSlotParamSchema,
} from "@dragons/contracts";
import type { AppEnv } from "../../types";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import {
  assignReferee,
  unassignReferee,
  searchCandidates,
  AssignmentError,
} from "../../services/referee/referee-assignment.service";

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
  validator("param", spielplanIdParamSchema, validationHook),
  validator("query", refAssignmentCandidatesQuerySchema, validationHook),
  async (c) => {
    const { spielplanId } = c.req.valid("param");
    const { search, pageFrom, pageSize, slot } = c.req.valid("query");

    const eligibilitySlot = slot === 1 ? (1 as const) : slot === 2 ? (2 as const) : ("either" as const);

    try {
      const result = await searchCandidates(spielplanId, search, pageFrom, pageSize, eligibilitySlot);
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
  validator("param", spielplanIdParamSchema, validationHook),
  validator("json", refereeAssignBodySchema, validationHook),
  async (c) => {
    const { spielplanId } = c.req.valid("param");
    const { slotNumber, refereeApiId } = c.req.valid("json");

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
  validator("param", assignmentSlotParamSchema, validationHook),
  async (c) => {
    const { spielplanId, slotNumber } = c.req.valid("param");

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

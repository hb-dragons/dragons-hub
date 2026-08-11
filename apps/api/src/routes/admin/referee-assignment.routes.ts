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
} from "../../services/referee/referee-assignment.service";

// AssignmentError carries its own status; middleware/error.ts maps it.
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

    const result = await searchCandidates(spielplanId, search, pageFrom, pageSize, eligibilitySlot);
    return c.json(result);
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

    const result = await assignReferee(spielplanId, slotNumber, refereeApiId);
    return c.json(result);
  },
);

adminRefereeAssignmentRoutes.delete(
  "/referee/games/:spielplanId/assignment/:slotNumber",
  requirePermission("assignment", "delete"),
  validator("param", assignmentSlotParamSchema, validationHook),
  async (c) => {
    const { spielplanId, slotNumber } = c.req.valid("param");

    const result = await unassignReferee(spielplanId, slotNumber);
    return c.json(result);
  },
);

export { adminRefereeAssignmentRoutes };

import { Hono } from "hono";
import { validator } from "hono-openapi";
import type { AppEnv } from "../../types";
import { requireRefereeSelf } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import { assignRefereeAsSelf } from "../../services/referee/referee-assignment.service";
import {
  claimRefereeGame,
  unclaimRefereeGame,
} from "../../services/referee/referee-claim.service";
import {
  refereeAssignBodySchema,
  refereeAssignParamSchema,
  refereeClaimBodySchema,
  refereeClaimParamSchema,
} from "@dragons/contracts";

// AssignmentError carries its own status; middleware/error.ts maps it.
// Admin-override variants live in admin/referee-assignment.routes.ts.
const refereeAssignmentRoutes = new Hono<AppEnv>();

refereeAssignmentRoutes.post(
  "/games/:spielplanId/assign",
  requireRefereeSelf,
  validator("param", refereeAssignParamSchema, validationHook),
  validator("json", refereeAssignBodySchema, validationHook),
  async (c) => {
    const { spielplanId } = c.req.valid("param");
    const { slotNumber, refereeApiId } = c.req.valid("json");

    // Not a caught service error: this is a middleware-context check (the
    // session has no linked referee row at all), so there is nothing for
    // assignRefereeAsSelf to look up yet.
    const refereeId = c.get("refereeId");
    if (refereeId === undefined) {
      return c.json({ error: "Referee profile not linked", code: "FORBIDDEN" }, 403);
    }

    const result = await assignRefereeAsSelf(spielplanId, slotNumber, refereeApiId, refereeId);
    return c.json(result);
  },
);

refereeAssignmentRoutes.post(
  "/games/:id/claim",
  requireRefereeSelf,
  validator("param", refereeClaimParamSchema, validationHook),
  validator("json", refereeClaimBodySchema, validationHook),
  async (c) => {
    const { id } = c.req.valid("param");

    const refereeId = c.get("refereeId");
    if (refereeId === undefined) {
      return c.json({ error: "Referee profile not linked", code: "FORBIDDEN" }, 403);
    }

    const body = c.req.valid("json");

    const result = await claimRefereeGame({
      refereeId,
      gameId: id,
      slotNumber: body?.slotNumber,
    });
    return c.json(result);
  },
);

refereeAssignmentRoutes.delete(
  "/games/:id/claim",
  requireRefereeSelf,
  validator("param", refereeClaimParamSchema, validationHook),
  async (c) => {
    const { id } = c.req.valid("param");

    const refereeId = c.get("refereeId");
    if (refereeId === undefined) {
      return c.json({ error: "Referee profile not linked", code: "FORBIDDEN" }, 403);
    }

    const result = await unclaimRefereeGame({
      refereeId,
      gameId: id,
    });
    return c.json(result);
  },
);

export { refereeAssignmentRoutes };

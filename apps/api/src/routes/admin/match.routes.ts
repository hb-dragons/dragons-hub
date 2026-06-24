import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppEnv } from "../../types";
import {
  getOwnClubMatches,
  getMatchDetail,
  getMatchChangeHistory,
  updateMatchLocal,
  releaseOverride,
} from "../../services/admin/match-admin.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import { reconcileMatch } from "../../services/venue-booking/venue-booking.service";
import {
  matchListQuerySchema,
  matchIdParamSchema,
  matchHistoryQuerySchema,
  matchUpdateBodySchema,
  releaseOverrideParamsSchema,
} from "@dragons/contracts";
import { getActiveSeasonId } from "../../services/admin/season.service";

const matchRoutes = new Hono<AppEnv>();

// GET /admin/matches - List own club matches
matchRoutes.get(
  "/matches",
  requirePermission("match", "view"),
  validator("query", matchListQuerySchema, validationHook),
  describeRoute({
    description: "List own club matches",
    tags: ["Matches"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const seasonId = query.seasonId ?? (await getActiveSeasonId()) ?? -1;
    const result = await getOwnClubMatches({ ...query, seasonId });
    return c.json(result);
  },
);

// GET /admin/matches/:id - Match detail with diffs
matchRoutes.get(
  "/matches/:id",
  requirePermission("match", "view"),
  validator("param", matchIdParamSchema, validationHook),
  describeRoute({
    description: "Get match detail with diffs",
    tags: ["Matches"],
    responses: {
      200: { description: "Success" },
      404: { description: "Match not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const result = await getMatchDetail(id);

    if (!result) {
      return c.json({ error: "Match not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

// GET /admin/matches/:id/history - Match change history
matchRoutes.get(
  "/matches/:id/history",
  requirePermission("match", "view"),
  validator("param", matchIdParamSchema, validationHook),
  validator("query", matchHistoryQuerySchema, validationHook),
  describeRoute({
    description: "Get match change history",
    tags: ["Matches"],
    responses: {
      200: { description: "Success" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const query = c.req.valid("query");
    const result = await getMatchChangeHistory(id, query);
    return c.json(result);
  },
);

// PATCH /admin/matches/:id - Update local overrides
matchRoutes.patch(
  "/matches/:id",
  requirePermission("match", "update"),
  validator("param", matchIdParamSchema, validationHook),
  validator("json", matchUpdateBodySchema, validationHook),
  describeRoute({
    description: "Update local match overrides",
    tags: ["Matches"],
    responses: {
      200: { description: "Success" },
      404: { description: "Match not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const changedBy = c.get("user")?.id ?? "unknown";
    const result = await updateMatchLocal(id, body, changedBy);

    if (!result) {
      return c.json({ error: "Match not found", code: "NOT_FOUND" }, 404);
    }

    reconcileMatch(id).catch((err) => {
      const log = c.get("logger");
      if (log) {
        log.error({ err, matchId: id }, "Venue booking reconciliation failed after match update");
      }
    });

    return c.json(result);
  },
);

// DELETE /admin/matches/:id/overrides/:fieldName - Release a specific override
matchRoutes.delete(
  "/matches/:id/overrides/:fieldName",
  requirePermission("match", "update"),
  validator("param", releaseOverrideParamsSchema, validationHook),
  describeRoute({
    description: "Release a specific field override",
    tags: ["Matches"],
    responses: {
      200: { description: "Success" },
      404: { description: "Override not found" },
    },
  }),
  async (c) => {
    const { id, fieldName } = c.req.valid("param");

    const changedBy = c.get("user")?.id ?? "unknown";
    const result = await releaseOverride(id, fieldName, changedBy);

    if (!result) {
      return c.json({ error: "Override not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

export { matchRoutes };

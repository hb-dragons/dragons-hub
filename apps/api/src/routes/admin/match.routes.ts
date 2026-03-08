import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { AppEnv } from "../../types";
import {
  getOwnClubMatches,
  getMatchDetail,
  updateMatchLocal,
  releaseOverride,
} from "../../services/admin/match-admin.service";
import {
  matchListQuerySchema,
  matchIdParamSchema,
  matchUpdateBodySchema,
  releaseOverrideParamsSchema,
} from "./match.schemas";

const matchRoutes = new Hono<AppEnv>();

// GET /admin/matches - List own club matches
matchRoutes.get(
  "/matches",
  describeRoute({
    description: "List own club matches",
    tags: ["Matches"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = matchListQuerySchema.parse({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      leagueId: c.req.query("leagueId"),
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
    });
    const result = await getOwnClubMatches(query);
    return c.json(result);
  },
);

// GET /admin/matches/:id - Match detail with diffs
matchRoutes.get(
  "/matches/:id",
  describeRoute({
    description: "Get match detail with diffs",
    tags: ["Matches"],
    responses: {
      200: { description: "Success" },
      404: { description: "Match not found" },
    },
  }),
  async (c) => {
    const { id } = matchIdParamSchema.parse({ id: c.req.param("id") });
    const result = await getMatchDetail(id);

    if (!result) {
      return c.json({ error: "Match not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

// PATCH /admin/matches/:id - Update local overrides
matchRoutes.patch(
  "/matches/:id",
  describeRoute({
    description: "Update local match overrides",
    tags: ["Matches"],
    responses: {
      200: { description: "Success" },
      404: { description: "Match not found" },
    },
  }),
  async (c) => {
    const { id } = matchIdParamSchema.parse({ id: c.req.param("id") });
    const body = matchUpdateBodySchema.parse(await c.req.json());

    const changedBy = c.get("user")?.id ?? "unknown";
    const result = await updateMatchLocal(id, body, changedBy);

    if (!result) {
      return c.json({ error: "Match not found", code: "NOT_FOUND" }, 404);
    }

    // Fire-and-forget: reconcile venue booking for this match
    import("../../services/venue-booking/venue-booking.service")
      .then(({ reconcileMatch }) => reconcileMatch(id))
      .catch((err) => {
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
  describeRoute({
    description: "Release a specific field override",
    tags: ["Matches"],
    responses: {
      200: { description: "Success" },
      404: { description: "Override not found" },
    },
  }),
  async (c) => {
    const { id, fieldName } = releaseOverrideParamsSchema.parse({
      id: c.req.param("id"),
      fieldName: c.req.param("fieldName"),
    });

    const changedBy = c.get("user")?.id ?? "unknown";
    const result = await releaseOverride(id, fieldName, changedBy);

    if (!result) {
      return c.json({ error: "Override not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

export { matchRoutes };

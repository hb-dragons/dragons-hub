import { Hono } from "hono";
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

const matchRoutes = new Hono();

// GET /admin/matches - List own club matches
matchRoutes.get("/matches", async (c) => {
  const query = matchListQuerySchema.parse({
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
    leagueId: c.req.query("leagueId"),
    dateFrom: c.req.query("dateFrom"),
    dateTo: c.req.query("dateTo"),
  });
  const result = await getOwnClubMatches(query);
  return c.json(result);
});

// GET /admin/matches/:id - Match detail with diffs
matchRoutes.get("/matches/:id", async (c) => {
  const { id } = matchIdParamSchema.parse({ id: c.req.param("id") });
  const result = await getMatchDetail(id);

  if (!result) {
    return c.json({ error: "Match not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result);
});

// PATCH /admin/matches/:id - Update local overrides
matchRoutes.patch("/matches/:id", async (c) => {
  const { id } = matchIdParamSchema.parse({ id: c.req.param("id") });
  const body = matchUpdateBodySchema.parse(await c.req.json());

  const changedBy = "admin";
  const result = await updateMatchLocal(id, body, changedBy);

  if (!result) {
    return c.json({ error: "Match not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result);
});

// DELETE /admin/matches/:id/overrides/:fieldName - Release a specific override
matchRoutes.delete("/matches/:id/overrides/:fieldName", async (c) => {
  const { id, fieldName } = releaseOverrideParamsSchema.parse({
    id: c.req.param("id"),
    fieldName: c.req.param("fieldName"),
  });

  const changedBy = "admin";
  const result = await releaseOverride(id, fieldName, changedBy);

  if (!result) {
    return c.json({ error: "Override not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result);
});

export { matchRoutes };

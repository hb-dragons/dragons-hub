import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { getOwnClubMatches } from "../../services/admin/match-admin.service";
import { getPublicMatchDetail } from "../../services/admin/match-query.service";
import { getMatchContext } from "../../services/public/match-context.service";
import { buildCalendarFeed } from "../../services/public/calendar.service";
import { matchListQuerySchema, publicScheduleIcsQuerySchema } from "@dragons/contracts";
import { validationHook } from "../../middleware/validation";
import { env } from "../../config/env";
import { getActiveSeasonId } from "../../services/admin/season.service";

function resolveIcsHostname(): string {
  try {
    return new URL(env.BETTER_AUTH_URL).hostname;
  } catch {
    return "dragons.local";
  }
}

const publicMatchRoutes = new Hono();

// GET /public/matches - List own club matches (no auth required)
publicMatchRoutes.get(
  "/matches",
  validator("query", matchListQuerySchema, validationHook),
  describeRoute({
    description: "List own club matches (public)",
    tags: ["Public"],
    security: [],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const opponentApiId = c.req.query("opponentApiId");
    const activeSeasonId = await getActiveSeasonId();
    const result = await getOwnClubMatches({
      ...query,
      opponentApiId: opponentApiId ? Number(opponentApiId) : undefined,
      excludeInactive: true,
      seasonId: activeSeasonId ?? -1,
    });
    return c.json(result);
  },
);

// GET /public/schedule.ics - ICS calendar subscription feed
publicMatchRoutes.get(
  "/schedule.ics",
  validator("query", publicScheduleIcsQuerySchema, validationHook),
  describeRoute({
    description: "ICS calendar feed for own club matches",
    tags: ["Public"],
    security: [],
    responses: {
      200: {
        description: "ICS calendar file",
        content: { "text/calendar": {} },
      },
    },
  }),
  async (c) => {
    const query = c.req.valid("query");

    // Default window: 30 days back → 180 days forward
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);
    const defaultTo = new Date(now);
    defaultTo.setDate(defaultTo.getDate() + 180);

    const toDateStr = (d: Date) => d.toISOString().split("T")[0];

    const activeSeasonId = await getActiveSeasonId();
    const result = await getOwnClubMatches({
      limit: 1000,
      offset: 0,
      sort: "asc",
      excludeInactive: false, // include cancelled so calendar shows strikethrough
      teamApiId: query.teamApiId,
      leagueId: query.leagueId,
      dateFrom: query.dateFrom ?? toDateStr(defaultFrom),
      dateTo: query.dateTo ?? toDateStr(defaultTo),
      seasonId: activeSeasonId ?? -1,
    });

    const ics = buildCalendarFeed(result.items, {
      hostname: resolveIcsHostname(),
      calendarName: "Dragons Spielplan",
    });

    return c.text(ics, 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    });
  },
);

// GET /public/matches/:id - Get a single own-club match with quarter scores
publicMatchRoutes.get(
  "/matches/:id",
  describeRoute({
    description: "Get a single own-club match with quarter scores",
    tags: ["Public"],
    responses: { 200: { description: "Match detail" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (Number.isNaN(id)) return c.json({ error: "Invalid ID" }, 400);
    const match = await getPublicMatchDetail(id);
    if (!match) return c.json({ error: "Not found" }, 404);
    return c.json(match);
  },
);

// GET /public/matches/:id/context - Get H2H record and form for both teams
publicMatchRoutes.get(
  "/matches/:id/context",
  describeRoute({
    description: "Get H2H record and form for both teams in a match",
    tags: ["Public"],
    responses: { 200: { description: "Match context" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (Number.isNaN(id)) return c.json({ error: "Invalid ID" }, 400);
    const context = await getMatchContext(id);
    if (!context) return c.json({ error: "Not found" }, 404);
    return c.json(context);
  },
);

export { publicMatchRoutes };

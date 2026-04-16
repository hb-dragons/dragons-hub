import { Hono } from "hono";
import { z } from "zod";
import { describeRoute } from "hono-openapi";
import { dateSchema } from "@dragons/shared";
import { getOwnClubMatches } from "../../services/admin/match-admin.service";
import { getPublicMatchDetail } from "../../services/admin/match-query.service";
import { getMatchContext } from "../../services/public/match-context.service";
import { buildCalendarFeed } from "../../services/public/calendar.service";
import { matchListQuerySchema } from "../admin/match.schemas";

const publicMatchRoutes = new Hono();

// GET /public/matches - List own club matches (no auth required)
publicMatchRoutes.get(
  "/matches",
  describeRoute({
    description: "List own club matches (public)",
    tags: ["Public"],
    security: [],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = matchListQuerySchema.parse({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      leagueId: c.req.query("leagueId"),
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
      sort: c.req.query("sort"),
      hasScore: c.req.query("hasScore"),
      teamApiId: c.req.query("teamApiId"),
    });
    const opponentApiId = c.req.query("opponentApiId");
    const result = await getOwnClubMatches({
      ...query,
      opponentApiId: opponentApiId ? Number(opponentApiId) : undefined,
      excludeInactive: true,
    });
    return c.json(result);
  },
);

// Query schema for ICS feed — subset of match list params
const icsQuerySchema = z.object({
  teamApiId: z.coerce.number().int().positive().optional(),
  leagueId: z.coerce.number().int().positive().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

// GET /public/schedule.ics - ICS calendar subscription feed
publicMatchRoutes.get(
  "/schedule.ics",
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
    const query = icsQuerySchema.parse({
      teamApiId: c.req.query("teamApiId"),
      leagueId: c.req.query("leagueId"),
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
    });

    // Default window: 30 days back → 180 days forward
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);
    const defaultTo = new Date(now);
    defaultTo.setDate(defaultTo.getDate() + 180);

    const toDateStr = (d: Date) => d.toISOString().split("T")[0];

    const result = await getOwnClubMatches({
      limit: 1000,
      offset: 0,
      sort: "asc",
      excludeInactive: false, // include cancelled so calendar shows strikethrough
      teamApiId: query.teamApiId,
      leagueId: query.leagueId,
      dateFrom: query.dateFrom ?? toDateStr(defaultFrom),
      dateTo: query.dateTo ?? toDateStr(defaultTo),
    });

    const hostname = new URL(
      c.req.header("x-forwarded-host")
        ? `https://${c.req.header("x-forwarded-host")}`
        : c.req.url,
    ).hostname;

    const ics = buildCalendarFeed(result.items, {
      hostname,
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

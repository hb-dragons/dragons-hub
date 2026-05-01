import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../config/database";
import { matches, leagues, teams } from "@dragons/db/schema";
import { requireAnyRole } from "../../middleware/rbac";
import {
  getBroadcastConfig,
  loadJoinedMatch,
  setBroadcastLive,
  upsertBroadcastConfig,
} from "../../services/broadcast/config";
import {
  invalidateMatchCache,
  publishBroadcastForDevice,
} from "../../services/broadcast/publisher";
import type { AppEnv } from "../../types";

const adminBroadcastRoutes = new Hono<AppEnv>();

const upsertSchema = z.object({
  deviceId: z.string().min(1),
  matchId: z.number().int().positive().nullable().optional(),
  homeAbbr: z.string().max(8).nullable().optional(),
  guestAbbr: z.string().max(8).nullable().optional(),
  homeColorOverride: z.string().max(20).nullable().optional(),
  guestColorOverride: z.string().max(20).nullable().optional(),
});

const startStopSchema = z.object({ deviceId: z.string().min(1) });

adminBroadcastRoutes.get(
  "/config",
  requireAnyRole("admin"),
  describeRoute({
    description: "Get the broadcast config for a device",
    tags: ["Broadcast"],
    responses: { 200: { description: "Config + joined match" } },
  }),
  async (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
    }
    const config = await getBroadcastConfig(deviceId);
    const match = config
      ? await loadJoinedMatch({
          matchId: config.matchId,
          homeAbbr: config.homeAbbr,
          guestAbbr: config.guestAbbr,
          homeColorOverride: config.homeColorOverride,
          guestColorOverride: config.guestColorOverride,
        })
      : null;
    return c.json({ config, match });
  },
);

adminBroadcastRoutes.put(
  "/config",
  requireAnyRole("admin"),
  describeRoute({
    description: "Upsert the broadcast config for a device",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid body" },
    },
  }),
  async (c) => {
    const parsed = upsertSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid body", code: "BAD_REQUEST" }, 400);
    }
    const config = await upsertBroadcastConfig(parsed.data);
    invalidateMatchCache(parsed.data.deviceId);
    await publishBroadcastForDevice(parsed.data.deviceId);
    return c.json({ config });
  },
);

adminBroadcastRoutes.post(
  "/start",
  requireAnyRole("admin"),
  describeRoute({
    description: "Set isLive=true",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Started" },
      400: { description: "No match bound" },
    },
  }),
  async (c) => {
    const parsed = startStopSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid body", code: "BAD_REQUEST" }, 400);
    }
    try {
      const config = await setBroadcastLive(parsed.data.deviceId, true);
      await publishBroadcastForDevice(parsed.data.deviceId);
      return c.json({ config });
    } catch (err) {
      return c.json(
        { error: (err as Error).message, code: "BAD_REQUEST" },
        400,
      );
    }
  },
);

adminBroadcastRoutes.post(
  "/stop",
  requireAnyRole("admin"),
  describeRoute({
    description: "Set isLive=false",
    tags: ["Broadcast"],
    responses: { 200: { description: "Stopped" } },
  }),
  async (c) => {
    const parsed = startStopSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid body", code: "BAD_REQUEST" }, 400);
    }
    const config = await setBroadcastLive(parsed.data.deviceId, false);
    await publishBroadcastForDevice(parsed.data.deviceId);
    return c.json({ config });
  },
);

const matchesQuerySchema = z.object({
  q: z.string().optional(),
  scope: z.enum(["today", "all"]).default("today"),
});

const homeTeam = alias(teams, "home_team");
const guestTeam = alias(teams, "guest_team");

adminBroadcastRoutes.get(
  "/matches",
  requireAnyRole("admin"),
  describeRoute({
    description: "Own-club matches available for broadcast binding",
    tags: ["Broadcast"],
    responses: { 200: { description: "List of matches" } },
  }),
  async (c) => {
    const parsed = matchesQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "invalid query", code: "BAD_REQUEST" }, 400);
    }
    const { q, scope } = parsed.data;

    const today = new Date().toISOString().slice(0, 10);

    const ownIds = await db
      .select({ id: teams.apiTeamPermanentId })
      .from(teams)
      .where(eq(teams.isOwnClub, true));
    const ownIdValues = ownIds.map((r) => r.id);
    if (ownIdValues.length === 0) {
      return c.json({ matches: [] });
    }

    const ownClubFilter = or(
      inArray(matches.homeTeamApiId, ownIdValues),
      inArray(matches.guestTeamApiId, ownIdValues),
    );

    let dateFilter = undefined;
    if (scope === "today") {
      dateFilter = eq(matches.kickoffDate, today);
    }

    let textFilter = undefined;
    if (q && q.trim().length > 0) {
      const pattern = `%${q.trim()}%`;
      const matchedTeams = await db
        .select({ id: teams.apiTeamPermanentId })
        .from(teams)
        .where(or(ilike(teams.name, pattern), ilike(teams.nameShort, pattern)));
      const matchedIds = matchedTeams.map((r) => r.id);
      if (matchedIds.length === 0) {
        return c.json({ matches: [] });
      }
      textFilter = or(
        inArray(matches.homeTeamApiId, matchedIds),
        inArray(matches.guestTeamApiId, matchedIds),
      );
    }

    const filters = [ownClubFilter];
    if (dateFilter) filters.push(dateFilter);
    if (textFilter) filters.push(textFilter);

    const rows = await db
      .select({
        id: matches.id,
        kickoffDate: matches.kickoffDate,
        kickoffTime: matches.kickoffTime,
        homeName: homeTeam.name,
        guestName: guestTeam.name,
        leagueName: leagues.name,
      })
      .from(matches)
      .leftJoin(homeTeam, eq(matches.homeTeamApiId, homeTeam.apiTeamPermanentId))
      .leftJoin(guestTeam, eq(matches.guestTeamApiId, guestTeam.apiTeamPermanentId))
      .leftJoin(leagues, eq(matches.leagueId, leagues.id))
      .where(and(...filters))
      .orderBy(asc(matches.kickoffDate), asc(matches.kickoffTime))
      .limit(100);

    return c.json({ matches: rows });
  },
);

export { adminBroadcastRoutes };

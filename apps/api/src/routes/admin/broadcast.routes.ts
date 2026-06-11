import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../../config/database";
import { matches, leagues, teams } from "@dragons/db/schema";
import { requireAnyRole } from "../../middleware/rbac";
import { escapeLikePattern } from "../../services/utils/sql";
import {
  BroadcastError,
  getBroadcastConfig,
  loadJoinedMatch,
  setBroadcastLive,
  upsertBroadcastConfig,
} from "../../services/broadcast/config";
import {
  invalidateMatchCache,
  publishBroadcastForDevice,
} from "../../services/broadcast/publisher";
import { validationHook } from "../../middleware/validation";
import {
  broadcastUpsertSchema,
  broadcastStartStopSchema,
  broadcastMatchesQuerySchema,
} from "@dragons/contracts";
import type { AppEnv } from "../../types";

const adminBroadcastRoutes = new Hono<AppEnv>();

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
  validator("json", broadcastUpsertSchema, validationHook),
  describeRoute({
    description: "Upsert the broadcast config for a device",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid body" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const config = await upsertBroadcastConfig(body);
    invalidateMatchCache(body.deviceId);
    await publishBroadcastForDevice(body.deviceId);
    return c.json({ config });
  },
);

adminBroadcastRoutes.post(
  "/start",
  requireAnyRole("admin"),
  validator("json", broadcastStartStopSchema, validationHook),
  describeRoute({
    description: "Set isLive=true",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Started" },
      400: { description: "No match bound" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const config = await setBroadcastLive(body.deviceId, true);
      await publishBroadcastForDevice(body.deviceId);
      return c.json({ config });
    } catch (err) {
      if (err instanceof BroadcastError && err.code === "MISSING_MATCH") {
        return c.json(
          { error: "Cannot go live without matchId", code: "MISSING_MATCH" },
          400,
        );
      }
      throw err;
    }
  },
);

adminBroadcastRoutes.post(
  "/stop",
  requireAnyRole("admin"),
  validator("json", broadcastStartStopSchema, validationHook),
  describeRoute({
    description: "Set isLive=false",
    tags: ["Broadcast"],
    responses: { 200: { description: "Stopped" } },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const config = await setBroadcastLive(body.deviceId, false);
    await publishBroadcastForDevice(body.deviceId);
    return c.json({ config });
  },
);

const homeTeam = alias(teams, "home_team");
const guestTeam = alias(teams, "guest_team");

adminBroadcastRoutes.get(
  "/matches",
  requireAnyRole("admin"),
  validator("query", broadcastMatchesQuerySchema, validationHook),
  describeRoute({
    description: "Own-club matches available for broadcast binding",
    tags: ["Broadcast"],
    responses: { 200: { description: "List of matches" } },
  }),
  async (c) => {
    const { q, scope } = c.req.valid("query");

    const today = new Date().toISOString().slice(0, 10);

    const ownIds = await getDb()
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
      const pattern = `%${escapeLikePattern(q.trim())}%`;
      const matchedTeams = await getDb()
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

    const rows = await getDb()
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

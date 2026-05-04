import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import { broadcastConfigs, liveScoreboards } from "@dragons/db/schema";
import type {
  BroadcastConfig,
  BroadcastMatch,
  BroadcastState,
  PublicLiveSnapshot,
} from "@dragons/shared";
import { publishBroadcast } from "../scoreboard/pubsub";
import { computePhase } from "./phase";
import { loadJoinedMatch, rowToConfig } from "./config";

const STALE_MS = 30_000;

const MATCH_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  matchId: number;
  homeAbbr: string | null;
  guestAbbr: string | null;
  homeColorOverride: string | null;
  guestColorOverride: string | null;
  match: BroadcastMatch;
  expiresAt: number;
}

const matchCache = new Map<string, CacheEntry>();

export function invalidateMatchCache(deviceId?: string): void {
  if (deviceId === undefined) {
    matchCache.clear();
  } else {
    matchCache.delete(deviceId);
  }
}

async function getCachedMatch(
  deviceId: string,
  config: BroadcastConfig,
): Promise<BroadcastMatch | null> {
  if (config.matchId === null) return null;
  const now = Date.now();
  const cached = matchCache.get(deviceId);
  if (
    cached &&
    cached.expiresAt > now &&
    cached.matchId === config.matchId &&
    cached.homeAbbr === config.homeAbbr &&
    cached.guestAbbr === config.guestAbbr &&
    cached.homeColorOverride === config.homeColorOverride &&
    cached.guestColorOverride === config.guestColorOverride
  ) {
    return cached.match;
  }
  const match = await loadJoinedMatch({
    matchId: config.matchId,
    homeAbbr: config.homeAbbr,
    guestAbbr: config.guestAbbr,
    homeColorOverride: config.homeColorOverride,
    guestColorOverride: config.guestColorOverride,
  });
  if (match) {
    matchCache.set(deviceId, {
      matchId: config.matchId,
      homeAbbr: config.homeAbbr,
      guestAbbr: config.guestAbbr,
      homeColorOverride: config.homeColorOverride,
      guestColorOverride: config.guestColorOverride,
      match,
      expiresAt: now + MATCH_CACHE_TTL_MS,
    });
  }
  return match;
}

function rowToScoreboard(
  row: typeof liveScoreboards.$inferSelect,
): PublicLiveSnapshot {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(row.lastFrameAt).getTime()) / 1000),
  );
  return {
    scoreHome: row.scoreHome,
    scoreGuest: row.scoreGuest,
    foulsHome: row.foulsHome,
    foulsGuest: row.foulsGuest,
    timeoutsHome: row.timeoutsHome,
    timeoutsGuest: row.timeoutsGuest,
    period: row.period,
    clockText: row.clockText,
    clockSeconds: row.clockSeconds,
    clockRunning: row.clockRunning,
    shotClock: row.shotClock,
    timeoutActive: row.timeoutActive,
    timeoutDuration: row.timeoutDuration,
    deviceId: row.deviceId,
    panelName: row.panelName,
    lastFrameAt: row.lastFrameAt.toISOString(),
    secondsSinceLastFrame: seconds,
  };
}

export async function buildBroadcastState(
  deviceId: string,
): Promise<BroadcastState> {
  const [configRow] = await db
    .select()
    .from(broadcastConfigs)
    .where(eq(broadcastConfigs.deviceId, deviceId))
    .limit(1);

  const config: BroadcastConfig = configRow
    ? rowToConfig(configRow)
    : {
        deviceId,
        matchId: null,
        isLive: false,
        homeAbbr: null,
        guestAbbr: null,
        homeColorOverride: null,
        guestColorOverride: null,
        startedAt: null,
        endedAt: null,
        updatedAt: new Date().toISOString(),
      };

  const [scoreRow] = await db
    .select()
    .from(liveScoreboards)
    .where(eq(liveScoreboards.deviceId, deviceId))
    .limit(1);

  const scoreboard = scoreRow ? rowToScoreboard(scoreRow) : null;
  const match = await getCachedMatch(deviceId, config);
  const phase = computePhase({
    isLive: config.isLive,
    matchId: config.matchId,
    period: scoreRow?.period ?? 0,
    clockRunning: scoreRow?.clockRunning ?? false,
  });
  const stale =
    config.isLive &&
    scoreRow !== undefined &&
    Date.now() - new Date(scoreRow.lastFrameAt).getTime() > STALE_MS;

  return {
    deviceId,
    isLive: config.isLive,
    phase,
    match,
    scoreboard,
    stale,
    startedAt: config.startedAt,
    endedAt: config.endedAt,
    updatedAt: config.updatedAt,
  };
}

export async function publishBroadcastForDevice(
  deviceId: string,
): Promise<void> {
  const state = await buildBroadcastState(deviceId);
  await publishBroadcast(deviceId, state);
}

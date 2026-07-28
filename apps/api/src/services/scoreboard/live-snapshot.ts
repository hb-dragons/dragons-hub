import { and, desc, eq, gt } from "drizzle-orm";
import {
  liveScoreboards,
  scoreboardSnapshots,
  type LiveScoreboard,
  type ScoreboardSnapshot,
} from "@dragons/db/schema";
import { getDb } from "../../config/database";
import {
  computeSecondsSince,
  SCOREBOARD_ONLINE_THRESHOLD_MS,
} from "./constants";

/**
 * The single decoded snapshot row for a device — `live_scoreboards` is keyed
 * by `deviceId`, so there is at most one row per device to read.
 */
export async function getLatestSnapshot(
  deviceId: string,
): Promise<LiveScoreboard | null> {
  const rows = await getDb()
    .select()
    .from(liveScoreboards)
    .where(eq(liveScoreboards.deviceId, deviceId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Snapshot history for a device, newest first. `afterId` scopes the page to
 * rows newer than a previously-seen id (used for polling); `limit` caps the
 * page size.
 */
export async function listSnapshots(q: {
  deviceId: string;
  afterId?: number;
  limit: number;
}): Promise<ScoreboardSnapshot[]> {
  const where =
    q.afterId !== undefined
      ? and(
          eq(scoreboardSnapshots.deviceId, q.deviceId),
          gt(scoreboardSnapshots.id, q.afterId),
        )
      : eq(scoreboardSnapshots.deviceId, q.deviceId);
  return getDb()
    .select()
    .from(scoreboardSnapshots)
    .where(where)
    .orderBy(desc(scoreboardSnapshots.id))
    .limit(q.limit);
}

/**
 * Ingest connection health for a device: whether `live_scoreboards` has a row
 * and, if so, how long ago it last received a frame. A device with no row at
 * all (never ingested, or ingest lagging behind creation) reports offline
 * rather than throwing.
 */
export async function getDeviceHealth(deviceId: string): Promise<{
  deviceId: string;
  lastFrameAt: Date | null;
  secondsSinceLastFrame: number | null;
  online: boolean;
}> {
  const rows = await getDb()
    .select()
    .from(liveScoreboards)
    .where(eq(liveScoreboards.deviceId, deviceId))
    .limit(1);
  if (rows.length === 0) {
    return {
      deviceId,
      lastFrameAt: null,
      secondsSinceLastFrame: null,
      online: false,
    };
  }
  const row = rows[0]!;
  const secondsSinceLastFrame = computeSecondsSince(row.lastFrameAt);
  return {
    deviceId,
    lastFrameAt: row.lastFrameAt,
    secondsSinceLastFrame,
    online: secondsSinceLastFrame * 1000 < SCOREBOARD_ONLINE_THRESHOLD_MS,
  };
}

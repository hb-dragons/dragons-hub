import { eq } from "drizzle-orm";
import { liveScoreboards, type LiveScoreboard } from "@dragons/db/schema";
import { getDb } from "../../config/database";

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

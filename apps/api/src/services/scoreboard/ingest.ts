import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import { liveScoreboards, scoreboardSnapshots } from "@dragons/db/schema";
import {
  decodeScoreFrame,
  findScoreFrames,
  type StramatelSnapshot,
} from "./stramatel-decoder";
import { publishSnapshot } from "./pubsub";
import { logger } from "../../config/logger";

export interface IngestResult {
  ok: true;
  changed: boolean;
  snapshotId: number | null;
}

export interface IngestInput {
  deviceId: string;
  hex: string;
}

const DEDUPE_KEYS = [
  "scoreHome",
  "scoreGuest",
  "foulsHome",
  "foulsGuest",
  "timeoutsHome",
  "timeoutsGuest",
  "period",
  "clockSeconds",
  "clockRunning",
  "shotClock",
  "timeoutActive",
] as const satisfies ReadonlyArray<keyof StramatelSnapshot>;

function snapshotsDiffer(
  prev: Record<string, unknown> | null,
  next: Record<string, unknown>,
): boolean {
  if (!prev) return true;
  return DEDUPE_KEYS.some((k) => prev[k] !== next[k]);
}

export async function processIngest({
  deviceId,
  hex,
}: IngestInput): Promise<IngestResult> {
  let buf: Buffer;
  try {
    buf = Buffer.from(hex, "hex");
  } catch {
    return { ok: true, changed: false, snapshotId: null };
  }
  const frames = findScoreFrames(buf);
  if (frames.length === 0) {
    return { ok: true, changed: false, snapshotId: null };
  }
  const frame = frames[frames.length - 1]!; // length checked above
  const decoded = decodeScoreFrame(frame);
  if (!decoded) {
    return { ok: true, changed: false, snapshotId: null };
  }

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(liveScoreboards)
      .where(eq(liveScoreboards.deviceId, deviceId))
      .limit(1);

    const changed = snapshotsDiffer(
      existing as unknown as Record<string, unknown> | null,
      decoded as unknown as Record<string, unknown>,
    );

    let snapshotId: number | null = null;
    if (changed) {
      const [row] = await tx
        .insert(scoreboardSnapshots)
        .values({
          deviceId,
          ...decoded,
          rawHex: frame.toString("hex"),
        })
        .returning({ id: scoreboardSnapshots.id });
      snapshotId = row!.id;
    }

    const now = new Date();
    await tx
      .insert(liveScoreboards)
      .values({
        deviceId,
        ...decoded,
        lastFrameAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: liveScoreboards.deviceId,
        set: {
          ...decoded,
          lastFrameAt: now,
          updatedAt: now,
        },
      });

    return { changed, snapshotId, lastFrameAt: now.toISOString() };
  });

  try {
    await publishSnapshot(deviceId, {
      ...decoded,
      deviceId,
      snapshotId: result.snapshotId,
      changed: result.changed,
      lastFrameAt: result.lastFrameAt,
    });
  } catch (err) {
    logger.warn(
      { err, deviceId, snapshotId: result.snapshotId },
      "scoreboard.publish failed",
    );
  }

  return { ok: true, changed: result.changed, snapshotId: result.snapshotId };
}

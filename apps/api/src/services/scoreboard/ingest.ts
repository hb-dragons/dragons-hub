import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import {
  broadcastConfigs,
  liveScoreboards,
  scoreboardSnapshots,
} from "@dragons/db/schema";
import {
  decodeScoreFrame,
  findScoreFrames,
  type StramatelSnapshot,
} from "./stramatel-decoder";
import { publishSnapshot } from "./pubsub";
import { publishBroadcastForDevice } from "../broadcast/publisher";
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
  // Pick the latest frame that actually decodes. The capture stream
  // contains E8 E8 E4 preamble bursts that look like frames but fail the
  // ASCII guard; iterate from the end so we land on the most recent real
  // Stramatel frame.
  let decoded: ReturnType<typeof decodeScoreFrame> = null;
  let frame: Buffer | undefined;
  for (let i = frames.length - 1; i >= 0; i--) {
    decoded = decodeScoreFrame(frames[i]!);
    if (decoded) {
      frame = frames[i]!;
      break;
    }
  }
  if (!decoded || !frame) {
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
        panelName: deviceId,
        lastFrameAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: liveScoreboards.deviceId,
        set: {
          ...decoded,
          panelName: deviceId,
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

  try {
    const [cfg] = await db
      .select({ isLive: broadcastConfigs.isLive })
      .from(broadcastConfigs)
      .where(eq(broadcastConfigs.deviceId, deviceId))
      .limit(1);
    if (cfg?.isLive === true) {
      await publishBroadcastForDevice(deviceId);
    }
  } catch (err) {
    logger.warn(
      { err, deviceId, snapshotId: result.snapshotId },
      "broadcast.publish failed",
    );
  }

  return { ok: true, changed: result.changed, snapshotId: result.snapshotId };
}

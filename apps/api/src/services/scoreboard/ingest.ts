import { eq } from "drizzle-orm";
import { getDb } from "../../config/database";
import {
  broadcastConfigs,
  liveScoreboards,
  scoreboardSnapshots,
} from "@dragons/db/schema";
import { decodeLatestFrame, decodeLatestShot } from "./scoreboard-decoder";
import type { StramatelSnapshot } from "@dragons/shared";
import { publishSnapshot } from "./pubsub";
import { publishBroadcastForDevice } from "../broadcast/publisher";
import { broadcastRelevantChange } from "./broadcast-change";
import { rowToConfig } from "../broadcast/config";
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
  "shotClockText",
  "shotClockRunning",
  "timeoutActive",
] as const satisfies ReadonlyArray<keyof StramatelSnapshot>;

type DedupeKey = (typeof DEDUPE_KEYS)[number];

export function snapshotsDiffer(
  prev: Pick<typeof liveScoreboards.$inferSelect, DedupeKey> | null,
  next: Pick<StramatelSnapshot, DedupeKey>,
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
  // Decode the latest frame from whichever protocol the buffer carries — the
  // segment protocol is tried first, the old F8 33 decoder is the fallback.
  // See scoreboard-decoder.ts.
  const decodedResult = decodeLatestFrame(buf);
  // The shot clock rides on two block variants that alternate each second; the
  // companion variant carries no usable score/clock, so a POST whose only frame
  // is a companion block yields no main snapshot. Decode the freshest shot
  // independently so those POSTs still advance the shot clock (carrying the rest
  // of the board forward) instead of being dropped — otherwise the overlay steps
  // every 2 s above 5 s.
  const latestShot = decodeLatestShot(buf);
  if (!decodedResult && !latestShot) {
    return { ok: true, changed: false, snapshotId: null };
  }

  const result = await getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(liveScoreboards)
      .where(eq(liveScoreboards.deviceId, deviceId))
      .limit(1);

    let frame: Buffer;
    let decoded: StramatelSnapshot;
    if (decodedResult) {
      ({ frame, snapshot: decoded } = decodedResult);
      // Shot clock is absent on ~90% of frames; carry the last known value
      // forward, and infer "running" from a decreasing value (the per-frame flag
      // is unreliable on 7-byte prefixes — see the shot-clock decoder).
      if (decoded.shotClock === null && existing) {
        decoded.shotClock = existing.shotClock;
        decoded.shotClockText = existing.shotClockText;
        decoded.shotClockRunning = existing.shotClockRunning;
      } else if (decoded.shotClock !== null && existing?.shotClock != null) {
        const decreased = decoded.shotClock < existing.shotClock;
        decoded.shotClockRunning = decreased || decoded.shotClockRunning;
      }
    } else if (existing) {
      // Shot-only POST: no fresh main fields this cycle. Carry the whole board
      // forward from the live row and apply just the fresh shot reading.
      const decreased =
        existing.shotClock != null && latestShot!.value < existing.shotClock;
      decoded = {
        scoreHome: existing.scoreHome,
        scoreGuest: existing.scoreGuest,
        foulsHome: existing.foulsHome,
        foulsGuest: existing.foulsGuest,
        timeoutsHome: existing.timeoutsHome,
        timeoutsGuest: existing.timeoutsGuest,
        period: existing.period,
        clockText: existing.clockText,
        clockSeconds: existing.clockSeconds,
        clockRunning: existing.clockRunning,
        shotClock: latestShot!.value,
        shotClockText: latestShot!.text,
        shotClockRunning: decreased || latestShot!.runningHint,
        timeoutActive: existing.timeoutActive,
        timeoutDuration: existing.timeoutDuration,
      };
      frame = buf;
    } else {
      // Shot reading before any full board has been seen — nothing to carry.
      return {
        changed: false,
        snapshotId: null,
        lastFrameAt: new Date().toISOString(),
        decoded: null,
        broadcastRelevant: false,
      };
    }

    const changed = snapshotsDiffer(existing ?? null, decoded);
    const broadcastRelevant = broadcastRelevantChange(existing ?? null, decoded);

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

    return {
      changed,
      snapshotId,
      lastFrameAt: now.toISOString(),
      decoded,
      broadcastRelevant,
    };
  });

  if (!result.decoded) {
    return { ok: true, changed: false, snapshotId: null };
  }
  const decoded = result.decoded;

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
    const [cfgRow] = await getDb()
      .select()
      .from(broadcastConfigs)
      .where(eq(broadcastConfigs.deviceId, deviceId))
      .limit(1);
    if (cfgRow?.isLive === true && result.broadcastRelevant) {
      const now = new Date(result.lastFrameAt);
      await publishBroadcastForDevice(deviceId, {
        config: rowToConfig(cfgRow),
        scoreboardRow: {
          deviceId,
          ...decoded,
          panelName: deviceId,
          lastFrameAt: now,
          updatedAt: now,
        },
      });
    }
  } catch (err) {
    logger.warn(
      { err, deviceId, snapshotId: result.snapshotId },
      "broadcast.publish failed",
    );
  }

  return { ok: true, changed: result.changed, snapshotId: result.snapshotId };
}

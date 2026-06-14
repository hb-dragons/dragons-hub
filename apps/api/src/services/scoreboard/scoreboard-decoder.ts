import type { StramatelSnapshot } from "@dragons/shared";
import {
  decodeSegmentBlock,
  findSegmentFrames,
  findShotFrames,
} from "./stramatel-segment-decoder";
import { decodeScoreFrame, findScoreFrames } from "./stramatel-decoder";
import { decodeShotClock, type ShotClockReading } from "./shot-clock-decoder";

export interface DecodedFrame {
  /** The raw bytes that decoded — stored as rawHex by the ingest path. */
  frame: Buffer;
  snapshot: StramatelSnapshot;
}

/**
 * Decode the freshest shot-clock reading in a buffer, scanning both block
 * variants (see `findShotFrames`). Returned independently of the main block so
 * the ingest can update the shot clock even on a POST whose only frame is a
 * companion block — without it, every other countdown value is dropped on
 * companion-only POSTs and the overlay steps every 2 s above 5 s.
 */
export function decodeLatestShot(buf: Buffer): ShotClockReading | null {
  return latestShotReading(findShotFrames(buf));
}

/**
 * Decode the most recent scoreboard frame in a buffer.
 *
 * The segment protocol (00 F8 E1 C3 marker) is tried first; the old F8 33
 * decoder is the fallback. Both decoders are pure and unaware of each other —
 * this is the only unit that knows two protocols exist. Iterating from the end
 * picks the most recent panel state in a multi-frame capture window.
 */
function latestShotReading(frames: Buffer[]) {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i]!;
    const c3 = f.indexOf(0xc3, 3);
    if (c3 <= 3) continue;
    const shot = decodeShotClock(f.subarray(3, c3));
    if (shot) return shot;
  }
  return null;
}

export function decodeLatestFrame(buf: Buffer): DecodedFrame | null {
  const segmentFrames = findSegmentFrames(buf);
  // Shot clock rides on both the main and companion block variants, which
  // alternate each second; scan the broad frame set so neither odd- nor
  // even-second values are dropped. Always prefer the freshest reading in the
  // buffer over the chosen main block's own prefix.
  const shot = latestShotReading(findShotFrames(buf));
  for (let i = segmentFrames.length - 1; i >= 0; i--) {
    const frame = segmentFrames[i]!;
    const snapshot = decodeSegmentBlock(frame);
    if (!snapshot) continue;
    if (shot) {
      snapshot.shotClock = shot.value;
      snapshot.shotClockText = shot.text;
      snapshot.shotClockRunning = shot.runningHint;
    }
    return { frame, snapshot };
  }

  const oldFrames = findScoreFrames(buf);
  for (let i = oldFrames.length - 1; i >= 0; i--) {
    const frame = oldFrames[i]!;
    const snapshot = decodeScoreFrame(frame);
    if (snapshot) return { frame, snapshot };
  }

  return null;
}

import type { StramatelSnapshot } from "@dragons/shared";
import {
  decodeSegmentBlock,
  findSegmentFrames,
} from "./stramatel-segment-decoder";
import { decodeScoreFrame, findScoreFrames } from "./stramatel-decoder";

export interface DecodedFrame {
  /** The raw bytes that decoded — stored as rawHex by the ingest path. */
  frame: Buffer;
  snapshot: StramatelSnapshot;
}

/**
 * Decode the most recent scoreboard frame in a buffer.
 *
 * The segment protocol (00 F8 E1 C3 marker) is tried first; the old F8 33
 * decoder is the fallback. Both decoders are pure and unaware of each other —
 * this is the only unit that knows two protocols exist. Iterating from the end
 * picks the most recent panel state in a multi-frame capture window.
 */
export function decodeLatestFrame(buf: Buffer): DecodedFrame | null {
  const segmentFrames = findSegmentFrames(buf);
  for (let i = segmentFrames.length - 1; i >= 0; i--) {
    const frame = segmentFrames[i]!;
    const snapshot = decodeSegmentBlock(frame);
    if (snapshot) return { frame, snapshot };
  }

  const oldFrames = findScoreFrames(buf);
  for (let i = oldFrames.length - 1; i >= 0; i--) {
    const frame = oldFrames[i]!;
    const snapshot = decodeScoreFrame(frame);
    if (snapshot) return { frame, snapshot };
  }

  return null;
}

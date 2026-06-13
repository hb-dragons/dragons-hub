import type { StramatelSnapshot } from "@dragons/shared";

const SYNC = Buffer.from([0x00, 0xf8, 0xe1]);
const TERMINATOR = 0xe5;
const C3 = 0xc3;
const BLANK_CELL = 0xbf;
const RUNNING_FLAG = 0x9f; // clock-running / timeout-active: 0x9F means active

/**
 * Type-C block detection across both panel framings.
 *
 * The frame is a 3-byte sync `00 F8 E1`, a variable-length prefix, the `C3`
 * delimiter, the type bytes, the possession byte, and the payload, terminated
 * by `0xE5`. The prefix is empty in the original framing and carries the SC24
 * shot-clock module's data when that panel is connected:
 *
 *   SC24 NOT connected:  00 F8 E1 C3 1E 66 FB <payload> E5     (poss at C3+3)
 *   SC24 connected:      00 F8 E1 <prefix..> C3 00 20 F6 FB <payload> E5
 *                                                            (poss at C3+4)
 *
 * Either way the payload is the same type-C layout addressed relative to the
 * possession byte, so one field decoder serves both. See
 * `apps/pi/STRAMATEL-PROTOCOL.md`.
 */

/**
 * Decode a type-C digit cell. Returns the digit 0–9, or null when the cell is
 * blank (0xBF) or holds a value outside the segment table.
 * Encoding: byte = 0x9F - 2 * digit, so digit = (0x9F - byte) / 2 for odd
 * bytes in 0x8D–0x9F.
 */
export function decodeDigit(byte: number): number | null {
  if (byte >= 0x8d && byte <= 0x9f && byte % 2 === 1) {
    return (0x9f - byte) / 2;
  }
  return null;
}

/** Lenient digit read for numeric fields: a blank or invalid cell counts as 0. */
function digitOrZero(byte: number): number {
  return decodeDigit(byte) ?? 0;
}

/** True when a clock byte is either a valid digit cell or a blank cell. */
function isClockByte(byte: number): boolean {
  return byte === BLANK_CELL || decodeDigit(byte) !== null;
}

interface ClockFields {
  clockText: string;
  clockSeconds: number | null;
}

/**
 * Decode the four clock bytes (possession byte + 1..4).
 * byte10 === 0xBF -> sub-minute mode "SS.t"; otherwise zero-padded "MM:SS".
 * If any clock byte is neither a digit nor blank, clockSeconds is null but
 * clockText is still emitted best-effort — this mirrors the old decoder.
 */
function decodeClock(
  b7: number,
  b8: number,
  b9: number,
  b10: number,
): ClockFields {
  const allValid =
    isClockByte(b7) && isClockByte(b8) && isClockByte(b9) && isClockByte(b10);
  if (b10 === BLANK_CELL) {
    const seconds = digitOrZero(b7) * 10 + digitOrZero(b8);
    const tenths = digitOrZero(b9);
    return {
      clockText: `${seconds}.${tenths}`,
      clockSeconds: allValid ? seconds : null,
    };
  }
  const minutes = digitOrZero(b7) * 10 + digitOrZero(b8);
  const seconds = digitOrZero(b9) * 10 + digitOrZero(b10);
  return {
    clockText: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    clockSeconds: allValid ? minutes * 60 + seconds : null,
  };
}

/** Decode the two-digit timeout countdown. */
function decodeTimeoutDuration(b49: number, b50: number): string {
  if (b49 === BLANK_CELL && b50 === BLANK_CELL) return "";
  return `${digitOrZero(b49)}${digitOrZero(b50)}`;
}

/**
 * Locate the possession byte of a type-C block, or -1 when the block is not
 * type C (type A/B, or another block kind). Handles the original framing
 * (`C3 1E 66`, poss at C3+3) and the SC24-era framing (`C3 00 20 F6`, poss at
 * C3+4).
 */
function typeCPossIndex(frame: Buffer): number {
  const c3 = frame.indexOf(C3, SYNC.length);
  if (c3 < 0) return -1;
  if (frame[c3 + 1] === 0x1e && frame[c3 + 2] === 0x66) return c3 + 3;
  if (
    frame[c3 + 1] === 0x00 &&
    frame[c3 + 2] === 0x20 &&
    frame[c3 + 3] === 0xf6
  ) {
    return c3 + 4;
  }
  return -1;
}

/**
 * Decode one type-C frame into a StramatelSnapshot.
 * Returns null when the frame fails structural validation (sync, terminator,
 * type) or is too short to carry the core fields. Bad field bytes are decoded
 * leniently rather than rejecting the whole frame.
 */
export function decodeSegmentBlock(frame: Buffer): StramatelSnapshot | null {
  if (frame.length < SYNC.length + 1) return null;
  if (frame[0] !== SYNC[0] || frame[1] !== SYNC[1] || frame[2] !== SYNC[2]) {
    return null;
  }
  if (frame[frame.length - 1] !== TERMINATOR) return null;

  const p = typeCPossIndex(frame);
  if (p < 0) return null;
  // Require the fields up to the timeout-active flag (poss+18) to be present.
  if (frame.length < p + 19) return null;

  const at = (off: number): number => frame[p + off] ?? BLANK_CELL;

  const { clockText, clockSeconds } = decodeClock(at(1), at(2), at(3), at(4));

  // Timeout countdown sits well past the core fields (poss+43/44) and may be
  // beyond a minimal frame — read it only when present.
  const toIdx = p + 43;
  const toTens = toIdx < frame.length ? frame[toIdx]! : BLANK_CELL;
  const toUnits = toIdx + 1 < frame.length ? frame[toIdx + 1]! : BLANK_CELL;

  return {
    // Scores are three digit cells: hundreds, tens, units. A blank cell decodes
    // to 0 via digitOrZero, so leading-zero blanking needs no special-casing.
    scoreHome:
      digitOrZero(at(5)) * 100 + digitOrZero(at(6)) * 10 + digitOrZero(at(7)),
    scoreGuest:
      digitOrZero(at(8)) * 100 + digitOrZero(at(9)) * 10 + digitOrZero(at(10)),
    foulsHome: digitOrZero(at(12)),
    foulsGuest: digitOrZero(at(13)),
    timeoutsHome: digitOrZero(at(14)),
    timeoutsGuest: digitOrZero(at(15)),
    period: digitOrZero(at(11)),
    clockText,
    clockSeconds,
    clockRunning: at(17) === RUNNING_FLAG,
    // Shot clock: the SC24 module sends the value as multiplexed LED scan data
    // in the frame prefix (not a clean digit cell) and only on a minority of
    // frames, so an exact running value needs frame-to-frame state plus further
    // reverse engineering — see STRAMATEL-PROTOCOL.md "Shot clock". Emit 0 until
    // that lands; the rest of the scoreboard does not depend on it.
    shotClock: 0,
    timeoutActive: at(18) === RUNNING_FLAG,
    timeoutDuration: decodeTimeoutDuration(toTens, toUnits),
  };
}

/**
 * Find every well-formed type-C frame in a buffer.
 *
 * A frame runs from the `00 F8 E1` sync to the next `0xE5` terminator after its
 * `C3` delimiter. Frames without a type-C signature (type A/B, other kinds) and
 * truncated tails (no terminator) are dropped. Works for both the original
 * 57-byte framing and the variable-length SC24-era framing.
 */
export function findSegmentFrames(buf: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  let cursor = 0;
  while (cursor < buf.length) {
    const sync = buf.indexOf(SYNC, cursor);
    if (sync < 0) break;
    const c3 = buf.indexOf(C3, sync + SYNC.length);
    if (c3 < 0) break;
    const end = buf.indexOf(TERMINATOR, c3 + 1);
    if (end < 0) break;
    const frame = buf.subarray(sync, end + 1);
    if (typeCPossIndex(frame) >= 0) frames.push(frame);
    cursor = end + 1;
  }
  return frames;
}

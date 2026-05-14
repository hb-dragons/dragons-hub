import type { StramatelSnapshot } from "@dragons/shared";

const MARKER = Buffer.from([0x00, 0xf8, 0xe1, 0xc3]);
const BLOCK_LENGTH = 57;
const TERMINATOR = 0xe5;
const TYPE_C_HIGH = 0x1e;
const TYPE_C_LOW = 0x66;
const BLANK_CELL = 0xbf;
const RUNNING_FLAG = 0x9f; // bytes 23/24: 0x9F means running / active

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
 * Decode the four clock bytes (block offsets 7–10).
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

/** Decode the two-digit timeout countdown (block offsets 49–50). */
function decodeTimeoutDuration(b49: number, b50: number): string {
  if (b49 === BLANK_CELL && b50 === BLANK_CELL) return "";
  return `${digitOrZero(b49)}${digitOrZero(b50)}`;
}

/**
 * Decode one 57-byte type-C block into a StramatelSnapshot.
 * Returns null when the block fails structural validation (length, marker,
 * type, or terminator). Bad field bytes are decoded leniently rather than
 * rejecting the whole block.
 */
export function decodeSegmentBlock(block: Buffer): StramatelSnapshot | null {
  if (block.length !== BLOCK_LENGTH) return null;
  if (
    block[0] !== MARKER[0] ||
    block[1] !== MARKER[1] ||
    block[2] !== MARKER[2] ||
    block[3] !== MARKER[3]
  ) {
    return null;
  }
  if (block[4] !== TYPE_C_HIGH || block[5] !== TYPE_C_LOW) return null;
  if (block[BLOCK_LENGTH - 1] !== TERMINATOR) return null;

  const { clockText, clockSeconds } = decodeClock(
    block[7]!,
    block[8]!,
    block[9]!,
    block[10]!,
  );

  return {
    // Scores are three digit cells: hundreds (11/14), tens (12/15), units
    // (13/16). A blank cell decodes to 0 via digitOrZero, so leading-zero
    // blanking is handled with no special-casing.
    scoreHome:
      digitOrZero(block[11]!) * 100 +
      digitOrZero(block[12]!) * 10 +
      digitOrZero(block[13]!),
    scoreGuest:
      digitOrZero(block[14]!) * 100 +
      digitOrZero(block[15]!) * 10 +
      digitOrZero(block[16]!),
    foulsHome: digitOrZero(block[18]!),
    foulsGuest: digitOrZero(block[19]!),
    timeoutsHome: digitOrZero(block[20]!),
    timeoutsGuest: digitOrZero(block[21]!),
    period: digitOrZero(block[17]!),
    clockText,
    clockSeconds,
    clockRunning: block[23] === RUNNING_FLAG,
    shotClock: 0,
    timeoutActive: block[24] === RUNNING_FLAG,
    timeoutDuration: decodeTimeoutDuration(block[49]!, block[50]!),
  };
}

/**
 * Find every well-formed type-C segment block in a buffer.
 * A block is kept only when it is a full 57 bytes, ends with the 0xE5
 * terminator, and carries the type-C signature (bytes 4–5 = 1E 66).
 * Type A, type B, and truncated or malformed slices are dropped.
 */
export function findSegmentFrames(buf: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  let cursor = 0;
  while (cursor < buf.length) {
    const idx = buf.indexOf(MARKER, cursor);
    if (idx === -1) break;
    const block = buf.subarray(idx, idx + BLOCK_LENGTH);
    if (
      block.length === BLOCK_LENGTH &&
      block[BLOCK_LENGTH - 1] === TERMINATOR &&
      block[4] === TYPE_C_HIGH &&
      block[5] === TYPE_C_LOW
    ) {
      frames.push(block);
    }
    cursor = idx + 1;
  }
  return frames;
}

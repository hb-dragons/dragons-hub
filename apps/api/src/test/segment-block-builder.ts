/**
 * Test helper: build synthetic 57-byte type-C segment blocks for decoder
 * unit tests. Lives in src/test/ so the coverage config excludes it.
 */

/** Segment digit byte for digit 0–9: byte = 0x9F - 2 * digit. */
export function segmentDigit(digit: number): number {
  return 0x9f - 2 * digit;
}

/** A blank type-C cell. */
export const BLANK_CELL = 0xbf;

/**
 * Build a valid 57-byte type-C block. Baseline decodes to: scores/fouls/
 * timeouts 0, period 1, possession none, clock "10:00" stopped, no timeout.
 * Pass byte-offset overrides to vary specific fields.
 */
export function buildTypeCBlock(overrides: Record<number, number> = {}): Buffer {
  const block = Buffer.alloc(57, BLANK_CELL);
  // marker 00 F8 E1 C3
  block[0] = 0x00;
  block[1] = 0xf8;
  block[2] = 0xe1;
  block[3] = 0xc3;
  // block type C
  block[4] = 0x1e;
  block[5] = 0x66;
  // possession: none
  block[6] = 0xfb;
  // clock "10:00": digits 1, 0, 0, 0
  block[7] = segmentDigit(1);
  block[8] = segmentDigit(0);
  block[9] = segmentDigit(0);
  block[10] = segmentDigit(0);
  // period 1
  block[17] = segmentDigit(1);
  // clock-running flag: stopped (0x9D); running would be 0x9F
  block[23] = 0x9d;
  // terminator
  block[56] = 0xe5;
  for (const [offset, value] of Object.entries(overrides)) {
    block[Number(offset)] = value;
  }
  return block;
}

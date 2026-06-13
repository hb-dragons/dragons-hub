/**
 * Decode the SC24 shot-clock value from a Stramatel frame prefix.
 *
 * The value rides in the variable-length prefix (bytes between the 00 F8 E1
 * sync and the first C3), present on ~10% of frames. p[0] flickers and is
 * ignored. See docs/superpowers/specs/2026-06-13-stramatel-shotclock-decode-design.md
 * and apps/pi/STRAMATEL-PROTOCOL.md "Shot clock".
 */
export interface ShotClockReading {
  /** Seconds; fractional (e.g. 4.7) under 5 s; 0 at expiry. */
  value: number;
  /** Display string: "24" | "4.7" | "0". */
  text: string;
  /** p[4] running flag; reliable only on 8-byte prefixes (else best-effort). */
  runningHint: boolean;
}

const TENTHS_INT: Record<number, number> = {
  0x58: 4, 0x68: 3, 0x98: 2, 0xa8: 1, 0xc8: 0,
};
const TWO_DIGIT_UNITS: Record<number, number> = {
  0x99: 0, 0x95: 1, 0x93: 2, 0x8d: 3, 0x8b: 4,
  0x27: 5, 0xd3: 6, 0xcd: 7, 0xcb: 8, 0xc7: 9,
};
// (p2 << 8) | p3 -> single-digit plain value.
const SINGLE: Record<number, number> = {
  [(0x3a << 8) | 0x5a]: 9,
  [(0x5a << 8) | 0x5a]: 8,
  [(0x6a << 8) | 0x5a]: 7,
  [(0x9a << 8) | 0x5a]: 6,
  [(0x3a << 8) | 0x6a]: 5,
};

function isTenthsByte(p2: number): boolean {
  return p2 >= 0x6d && p2 <= 0x7f && (0x7f - p2) % 2 === 0;
}

export function decodeShotClock(prefix: Buffer): ShotClockReading | null {
  if (prefix.length < 4) return null;
  const p1 = prefix[1]!;
  const p2 = prefix[2]!;
  const p3 = prefix[3]!;
  const runningHint = prefix.length > 4 && prefix[4] === 0x2d;

  // 1. Tenths mode — classify on p2 range first.
  if (isTenthsByte(p2) && p1 in TENTHS_INT) {
    const integer = TENTHS_INT[p1]!;
    const tenths = (0x7f - p2) / 2;
    const value = integer + tenths / 10;
    const text = value === 0 ? "0" : `${integer}.${tenths}`;
    return { value, text, runningHint };
  }

  // 2. Two-digit 10-24.
  if (p1 === 0x98 || p1 === 0xa8) {
    const decade = p1 === 0x98 ? 20 : 10;
    if (p2 in TWO_DIGIT_UNITS) {
      const value = decade + TWO_DIGIT_UNITS[p2]!;
      return { value, text: String(value), runningHint };
    }
    return null;
  }

  // 3. Single-digit plain 5-9.
  if (p1 === 0x68) {
    const v = SINGLE[(p2 << 8) | p3];
    if (v !== undefined) return { value: v, text: String(v), runningHint };
    return null;
  }

  return null;
}

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findScoreFrames, decodeScoreFrame } from "./stramatel-decoder";
import type { StramatelSnapshot } from "./stramatel-decoder";

const fixturePath = resolve(
  import.meta.dirname,
  "__fixtures__/stramatel-sample.bin",
);

describe("findScoreFrames", () => {
  it("returns no frames for empty input", () => {
    expect(findScoreFrames(Buffer.alloc(0))).toEqual([]);
  });

  it("returns one frame from a single F8 33 ... 0D sequence", () => {
    const f = Buffer.concat([
      Buffer.from([0xf8, 0x33]),
      Buffer.from(" 0  6 1 0   0   0  0 0 0  1  0", "ascii"),
      Buffer.from([0x0d]),
    ]);
    const frames = findScoreFrames(f);
    expect(frames).toHaveLength(1);
    const frame0 = frames[0]!;
    expect(frame0[0]).toBe(0xf8);
    expect(frame0[frame0.length - 1]).toBe(0x0d);
  });

  it("ignores incomplete trailing data", () => {
    const f = Buffer.concat([
      Buffer.from([0xf8, 0x33]),
      Buffer.from("payload", "ascii"),
      Buffer.from([0x0d]),
      Buffer.from([0xf8, 0x33]),
      Buffer.from("partial", "ascii"),
    ]);
    expect(findScoreFrames(f)).toHaveLength(1);
  });

  it("returns one frame from a single E8 E8 E4 ... 0D sequence", () => {
    const f = Buffer.concat([
      Buffer.from([0xe8, 0xe8, 0xe4]),
      Buffer.from(" 0  6 1 0   0   0  0 0 0  1  0", "ascii"),
      Buffer.from([0x0d]),
    ]);
    const frames = findScoreFrames(f);
    expect(frames).toHaveLength(1);
    const frame0 = frames[0]!;
    expect(frame0[0]).toBe(0xe8);
    expect(frame0[frame0.length - 1]).toBe(0x0d);
  });

  it("extracts many frames from the captured fixture", () => {
    const buf = readFileSync(fixturePath);
    const frames = findScoreFrames(buf);
    expect(frames.length).toBeGreaterThan(1000);
  });
});

function frame(payload: string): Buffer {
  return Buffer.concat([
    Buffer.from([0xf8, 0x33]),
    Buffer.from(payload, "ascii"),
    Buffer.from([0x0d]),
  ]);
}

describe("decodeScoreFrame", () => {
  it("decodes a MM:SS clock frame", () => {
    // Payload (48 bytes total) decoded by fixed offsets:
    //   [2..4]="10"  mm
    //   [4..6]="00"  ss   -> testCond.trim()="00" length 2 -> MM:SS branch
    //   [6..9]=" 45" scoreHome
    //   [9..12]=" 32" scoreGuest
    //   [12]="2"     period
    //   [13]="3"     foulsHome
    //   [14]="2"     foulsGuest
    //   [15]="1"     timeoutsHome
    //   [16]="0"     timeoutsGuest
    //   [18]=" "     status (not "1") -> clockRunning=true
    //   [19]=" "     timeout running -> timeoutActive=false
    //   [44..46]="  " timeoutDuration
    //   [46..48]="14" shotClock
    const payload =
      "  " + // 0..2 filler
      "10" + // 2..4 mm
      "00" + // 4..6 ss
      " 45" + // 6..9 scoreHome
      " 32" + // 9..12 scoreGuest
      "2" + // 12 period
      "3" + // 13 foulsHome
      "2" + // 14 foulsGuest
      "1" + // 15 timeoutsHome
      "0" + // 16 timeoutsGuest
      " " + // 17 filler
      " " + // 18 status (running)
      " " + // 19 timeout (inactive)
      "                        " + // 20..44 (24 chars)
      "  " + // 44..46 timeoutDuration
      "14"; // 46..48 shotClock

    const snapshot = decodeScoreFrame(frame(payload));
    expect(snapshot).not.toBeNull();
    expect(snapshot).toMatchObject({
      scoreHome: 45,
      scoreGuest: 32,
      period: 2,
      foulsHome: 3,
      foulsGuest: 2,
      timeoutsHome: 1,
      timeoutsGuest: 0,
      shotClock: 14,
      clockRunning: true,
      timeoutActive: false,
      clockText: "10:00",
      clockSeconds: 600,
    });
  });

  it("zero-pads single-digit minutes to MM:SS", () => {
    // Stramatel sends " 1" for minute=1; decoder must emit "01:23", not " 1:23".
    const payload =
      "  " + // 0..2 filler
      " 1" + // 2..4 mm (space-padded)
      "23" + // 4..6 ss
      "   " + // 6..9 scoreHome
      "   " + // 9..12 scoreGuest
      "1" + // 12 period
      "0" + // 13 foulsHome
      "0" + // 14 foulsGuest
      "0" + // 15 timeoutsHome
      "0" + // 16 timeoutsGuest
      " " + // 17 filler
      " " + // 18 status
      " " + // 19 timeout
      "                        " + // 20..44
      "  " + // 44..46 timeoutDuration
      "24"; // 46..48 shotClock

    const snapshot = decodeScoreFrame(frame(payload));
    expect(snapshot?.clockText).toBe("01:23");
    expect(snapshot?.clockSeconds).toBe(83);
  });

  it("decodes a sub-second clock frame as SS.t", () => {
    // Payload (48 bytes total):
    //   [2..4]="59"   mm-slot used as seconds
    //   [3]="9"       (decoder forms clockText = payload[2..4] + "." + payload[3..4])
    //   [4..6]=" 0"   testCond.trim()="0" length 1 -> SS.t branch
    //   clockText becomes "59" + "." + "9" = "59.9", clockSeconds = 59
    //   [12]="1"      period
    //   [18]="1"      status -> clockRunning=false
    //   [46..48]="08" shotClock=8
    const payload =
      "  " + // 0..2 filler
      "59" + // 2..4 mm slot ("5" at byte 2, "9" at byte 3)
      " 0" + // 4..6 ss slot, trims to "0" length 1 -> SS.t
      "   " + // 6..9 scoreHome -> 0
      "   " + // 9..12 scoreGuest -> 0
      "1" + // 12 period
      "0" + // 13 foulsHome
      "0" + // 14 foulsGuest
      "0" + // 15 timeoutsHome
      "0" + // 16 timeoutsGuest
      " " + // 17 filler
      "1" + // 18 status -> clockRunning=false
      " " + // 19 timeout (inactive)
      "                        " + // 20..44
      "  " + // 44..46 timeoutDuration
      "08"; // 46..48 shotClock=8

    const snapshot = decodeScoreFrame(frame(payload));
    expect(snapshot?.clockText).toBe("59.9");
    expect(snapshot?.clockSeconds).toBe(59);
    expect(snapshot?.clockRunning).toBe(false);
    expect(snapshot?.shotClock).toBe(8);
  });

  it("returns null for too-short frames", () => {
    expect(decodeScoreFrame(frame("  10  00 0"))).toBeNull();
  });

  it("decodes a frame with the E8 E8 E4 alt header", () => {
    // Same payload layout as the MM:SS test, but wrapped with the 3-byte alt start token.
    const payload =
      "  " + // 0..2 filler
      "10" + // 2..4 mm
      "00" + // 4..6 ss -> MM:SS branch
      " 45" + // 6..9 scoreHome
      " 32" + // 9..12 scoreGuest
      "2" + // 12 period
      "3" + // 13 foulsHome
      "2" + // 14 foulsGuest
      "1" + // 15 timeoutsHome
      "0" + // 16 timeoutsGuest
      " " + // 17 filler
      " " + // 18 status (running)
      " " + // 19 timeout (inactive)
      "                        " + // 20..44 filler (24 chars)
      "  " + // 44..46 timeoutDuration
      "14"; // 46..48 shotClock

    const altFrame = Buffer.concat([
      Buffer.from([0xe8, 0xe8, 0xe4]),
      Buffer.from(payload, "ascii"),
      Buffer.from([0x0d]),
    ]);

    const snapshot = decodeScoreFrame(altFrame);
    expect(snapshot).not.toBeNull();
    expect(snapshot).toMatchObject({
      scoreHome: 45,
      scoreGuest: 32,
      period: 2,
      foulsHome: 3,
      foulsGuest: 2,
      timeoutsHome: 1,
      timeoutsGuest: 0,
      shotClock: 14,
      clockRunning: true,
      timeoutActive: false,
      clockText: "10:00",
      clockSeconds: 600,
    });
  });

  it("falls back to raw MM:SS when minute/second bytes are non-numeric", () => {
    // testCond ("??".trim()) length 2 puts us in the MM:SS branch, but
    // parseInt yields NaN, so the decoder must keep the raw slice and
    // emit clockSeconds=null instead of zero-padding garbage.
    const payload =
      "  " + // 0..2 filler
      "??" + // 2..4 mm (non-numeric)
      "??" + // 4..6 ss (non-numeric) -> length 2 -> MM:SS branch
      "   " + // 6..9 scoreHome
      "   " + // 9..12 scoreGuest
      "1" + // 12 period
      "0" + // 13 foulsHome
      "0" + // 14 foulsGuest
      "0" + // 15 timeoutsHome
      "0" + // 16 timeoutsGuest
      " " + // 17 filler
      " " + // 18 status
      " " + // 19 timeout
      "                        " + // 20..44
      "  " + // 44..46 timeoutDuration
      "00"; // 46..48 shotClock

    const snapshot = decodeScoreFrame(frame(payload));
    expect(snapshot).not.toBeNull();
    expect(snapshot?.clockText).toBe("??:??");
    expect(snapshot?.clockSeconds).toBeNull();
  });

  it("treats non-numeric numeric fields as zero", () => {
    // Same overall layout as the MM:SS test, but score/foul/period bytes are non-numeric.
    const payload =
      "  " + // 0..2 filler
      "10" + // 2..4 mm (valid)
      "00" + // 4..6 ss (valid -> MM:SS branch, decoder doesn't return null)
      " ??" + // 6..9 scoreHome -> 0
      " ??" + // 9..12 scoreGuest -> 0
      "X" + // 12 period -> 0
      "?" + // 13 foulsHome -> 0
      "?" + // 14 foulsGuest -> 0
      "?" + // 15 timeoutsHome -> 0
      "?" + // 16 timeoutsGuest -> 0
      " " + // 17 filler
      " " + // 18 status
      " " + // 19 timeout
      "                        " + // 20..44
      "  " + // 44..46 timeoutDuration
      "??"; // 46..48 shotClock -> 0

    const snapshot = decodeScoreFrame(frame(payload));
    expect(snapshot).not.toBeNull();
    expect(snapshot?.scoreHome).toBe(0);
    expect(snapshot?.scoreGuest).toBe(0);
    expect(snapshot?.period).toBe(0);
    expect(snapshot?.shotClock).toBe(0);
  });
});

describe("fixture", () => {
  const buf = readFileSync(fixturePath);
  const frames = findScoreFrames(buf);

  it("has at least 1000 frames", () => {
    expect(frames.length).toBeGreaterThan(1000);
  });

  it("decodes every frame within sane ranges", { timeout: 30000 }, () => {
    for (const f of frames) {
      const s = decodeScoreFrame(f);
      if (!s) continue;
      expect(s.scoreHome).toBeGreaterThanOrEqual(0);
      expect(s.scoreHome).toBeLessThanOrEqual(200);
      expect(s.scoreGuest).toBeGreaterThanOrEqual(0);
      expect(s.scoreGuest).toBeLessThanOrEqual(200);
      expect(s.period).toBeGreaterThanOrEqual(0);
      expect(s.period).toBeLessThanOrEqual(10);
      expect(s.foulsHome).toBeGreaterThanOrEqual(0);
      expect(s.foulsHome).toBeLessThanOrEqual(9);
      expect(s.foulsGuest).toBeGreaterThanOrEqual(0);
      expect(s.foulsGuest).toBeLessThanOrEqual(9);
      expect(s.timeoutsHome).toBeGreaterThanOrEqual(0);
      expect(s.timeoutsHome).toBeLessThanOrEqual(9);
      expect(s.timeoutsGuest).toBeGreaterThanOrEqual(0);
      expect(s.timeoutsGuest).toBeLessThanOrEqual(9);
      expect(s.shotClock).toBeGreaterThanOrEqual(0);
      expect(s.shotClock).toBeLessThanOrEqual(99);
      if (s.clockSeconds !== null) {
        expect(s.clockSeconds).toBeGreaterThanOrEqual(0);
        // The Stramatel timer field is 4 ASCII digits (max 99:99 = 6039 s);
        // 9999 is a generous sanity bound that catches sign/garbage bugs
        // without rejecting between-period or warm-up clocks above 10:00.
        expect(s.clockSeconds).toBeLessThanOrEqual(9999);
      }
    }
  });

  it("dedupe rule reduces total to a smaller change set", () => {
    const dedupeKeys: ReadonlyArray<keyof StramatelSnapshot> = [
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
    ];
    let prev: StramatelSnapshot | null = null;
    let changes = 0;
    let total = 0;
    for (const f of frames) {
      const s = decodeScoreFrame(f);
      if (!s) continue;
      total += 1;
      if (
        prev === null ||
        dedupeKeys.some((k) => prev?.[k] !== s[k])
      ) {
        changes += 1;
      }
      prev = s;
    }
    expect(total).toBeGreaterThan(0);
    expect(changes).toBeLessThan(total);
  });
});

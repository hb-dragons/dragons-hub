import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decodeDigit,
  decodeSegmentBlock,
  findSegmentFrames,
} from "./stramatel-segment-decoder";
import {
  BLANK_CELL,
  buildTypeCBlock,
  segmentDigit,
} from "../../test/segment-block-builder";

function fixture(name: string): Buffer {
  return readFileSync(resolve(import.meta.dirname, "__fixtures__", name));
}

describe("decodeDigit", () => {
  it("decodes all ten digit bytes", () => {
    const bytes = [0x9f, 0x9d, 0x9b, 0x99, 0x97, 0x95, 0x93, 0x91, 0x8f, 0x8d];
    bytes.forEach((byte, digit) => {
      expect(decodeDigit(byte)).toBe(digit);
    });
  });

  it("returns null for a blank cell", () => {
    expect(decodeDigit(0xbf)).toBeNull();
  });

  it("returns null for a byte outside the segment table", () => {
    expect(decodeDigit(0x00)).toBeNull();
    expect(decodeDigit(0x9e)).toBeNull(); // even byte inside the value range
    expect(decodeDigit(0xff)).toBeNull();
  });
});

describe("findSegmentFrames", () => {
  it("returns no frames for an empty buffer", () => {
    expect(findSegmentFrames(Buffer.alloc(0))).toEqual([]);
  });

  it("returns no frames when the marker is absent", () => {
    expect(findSegmentFrames(Buffer.from("deadbeefcafe", "hex"))).toEqual([]);
  });

  it("extracts type-C blocks from a real fixture", () => {
    const frames = findSegmentFrames(fixture("segment-base.bin"));
    expect(frames.length).toBeGreaterThan(30);
    for (const f of frames) {
      expect(f).toHaveLength(57);
      expect(f[4]).toBe(0x1e);
      expect(f[5]).toBe(0x66);
      expect(f[56]).toBe(0xe5);
    }
  });

  it("ignores type A and type B blocks", () => {
    const typeA = buildTypeCBlock({ 4: 0x0f, 5: 0x64 });
    const typeB = buildTypeCBlock({ 4: 0x0f, 5: 0xec });
    const typeC = buildTypeCBlock();
    const frames = findSegmentFrames(Buffer.concat([typeA, typeB, typeC]));
    expect(frames).toHaveLength(1);
    expect(frames[0]![4]).toBe(0x1e);
  });

  it("drops a truncated trailing block", () => {
    const whole = buildTypeCBlock();
    const truncated = buildTypeCBlock().subarray(0, 30);
    const frames = findSegmentFrames(Buffer.concat([whole, truncated]));
    expect(frames).toHaveLength(1);
  });

  it("drops a block whose terminator is wrong", () => {
    const bad = buildTypeCBlock({ 56: 0x00 });
    expect(findSegmentFrames(bad)).toEqual([]);
  });
});

describe("decodeSegmentBlock — structural guards", () => {
  it("returns null for a block of the wrong length", () => {
    expect(decodeSegmentBlock(buildTypeCBlock().subarray(0, 56))).toBeNull();
  });

  it("returns null when the marker is wrong", () => {
    expect(decodeSegmentBlock(buildTypeCBlock({ 0: 0x01 }))).toBeNull();
  });

  it("returns null for a non-type-C block", () => {
    expect(decodeSegmentBlock(buildTypeCBlock({ 4: 0x0f, 5: 0x64 }))).toBeNull();
  });

  it("returns null when the terminator is wrong", () => {
    expect(decodeSegmentBlock(buildTypeCBlock({ 56: 0x00 }))).toBeNull();
  });
});

describe("decodeSegmentBlock — fields", () => {
  it("decodes the baseline synthetic block", () => {
    expect(decodeSegmentBlock(buildTypeCBlock())).toEqual({
      scoreHome: 0,
      scoreGuest: 0,
      foulsHome: 0,
      foulsGuest: 0,
      timeoutsHome: 0,
      timeoutsGuest: 0,
      period: 1,
      clockText: "10:00",
      clockSeconds: 600,
      clockRunning: false,
      shotClock: 0,
      timeoutActive: false,
      timeoutDuration: "",
    });
  });

  it("decodes a two-digit home score (tens + units)", () => {
    const block = buildTypeCBlock({ 12: segmentDigit(1), 13: segmentDigit(7) });
    expect(decodeSegmentBlock(block)!.scoreHome).toBe(17);
  });

  it("treats an invalid digit byte as 0", () => {
    const block = buildTypeCBlock({ 13: 0x00 });
    expect(decodeSegmentBlock(block)!.scoreHome).toBe(0);
  });

  it("decodes the clock-running and timeout-active flags", () => {
    const block = buildTypeCBlock({ 23: 0x9f, 24: 0x9f });
    const snapshot = decodeSegmentBlock(block)!;
    expect(snapshot.clockRunning).toBe(true);
    expect(snapshot.timeoutActive).toBe(true);
  });

  it("decodes a sub-minute clock (byte 10 blank)", () => {
    const block = buildTypeCBlock({
      7: segmentDigit(5),
      8: segmentDigit(7),
      9: segmentDigit(9),
      10: BLANK_CELL,
    });
    const snapshot = decodeSegmentBlock(block)!;
    expect(snapshot.clockText).toBe("57.9");
    expect(snapshot.clockSeconds).toBe(57);
  });

  it("decodes an MM:SS clock with blanked minutes-tens", () => {
    const block = buildTypeCBlock({
      7: BLANK_CELL,
      8: segmentDigit(9),
      9: segmentDigit(2),
      10: segmentDigit(2),
    });
    const snapshot = decodeSegmentBlock(block)!;
    expect(snapshot.clockText).toBe("09:22");
    expect(snapshot.clockSeconds).toBe(562);
  });

  it("emits clockSeconds null when a clock byte is unparseable", () => {
    const block = buildTypeCBlock({ 9: 0x00 });
    const snapshot = decodeSegmentBlock(block)!;
    expect(snapshot.clockSeconds).toBeNull();
    expect(snapshot.clockText).toBe("10:00");
  });

  it("emits clockSeconds null in sub-minute mode when a clock byte is unparseable", () => {
    const block = buildTypeCBlock({ 7: 0x00, 10: BLANK_CELL });
    const snapshot = decodeSegmentBlock(block)!;
    expect(snapshot.clockSeconds).toBeNull();
    expect(snapshot.clockText).toBe("0.0");
  });

  it("decodes a two-digit timeout countdown", () => {
    const block = buildTypeCBlock({
      24: 0x9f,
      49: segmentDigit(4),
      50: segmentDigit(1),
    });
    expect(decodeSegmentBlock(block)!.timeoutDuration).toBe("41");
  });
});

describe("decodeSegmentBlock — fixtures", () => {
  function decodeFixture(name: string) {
    const frames = findSegmentFrames(fixture(name));
    expect(frames.length).toBeGreaterThan(0);
    const snapshot = decodeSegmentBlock(frames[0]!);
    expect(snapshot).not.toBeNull();
    return snapshot!;
  }

  it("segment-base.bin → 0–0, period 1, 10:00 stopped", () => {
    expect(decodeFixture("segment-base.bin")).toMatchObject({
      scoreHome: 0,
      scoreGuest: 0,
      foulsHome: 0,
      foulsGuest: 0,
      timeoutsHome: 0,
      timeoutsGuest: 0,
      period: 1,
      clockText: "10:00",
      clockSeconds: 600,
      clockRunning: false,
      timeoutActive: false,
      shotClock: 0,
    });
  });

  it("segment-score-h2.bin → home 2, guest 0", () => {
    expect(decodeFixture("segment-score-h2.bin")).toMatchObject({
      scoreHome: 2,
      scoreGuest: 0,
    });
  });

  it("segment-score-h10.bin → home 10, guest 1", () => {
    expect(decodeFixture("segment-score-h10.bin")).toMatchObject({
      scoreHome: 10,
      scoreGuest: 1,
    });
  });

  it("segment-period-3.bin → period 3", () => {
    expect(decodeFixture("segment-period-3.bin").period).toBe(3);
  });

  it("segment-foul-h3.bin → home fouls 3", () => {
    expect(decodeFixture("segment-foul-h3.bin").foulsHome).toBe(3);
  });

  it("segment-clock-0059.bin → sub-minute 57.9", () => {
    expect(decodeFixture("segment-clock-0059.bin")).toMatchObject({
      clockText: "57.9",
      clockSeconds: 57,
    });
  });

  it("segment-clock-run-0930.bin → MM:SS clock, running", () => {
    expect(decodeFixture("segment-clock-run-0930.bin")).toMatchObject({
      clockText: "09:22",
      clockSeconds: 562,
      clockRunning: true,
    });
  });

  it("segment-to-running.bin → timeout active, countdown running", () => {
    expect(decodeFixture("segment-to-running.bin")).toMatchObject({
      timeoutActive: true,
      timeoutsGuest: 1,
      timeoutDuration: "40",
    });
  });

  it("segment-poss-left.bin → decodes cleanly, stale guest timeout", () => {
    // Possession (byte 6) is not mapped to StramatelSnapshot. This fixture was
    // captured with a leftover guest timeout — byte 21 reflects that, not a
    // possession side effect (see STRAMATEL-PROTOCOL.md Provenance note).
    expect(decodeFixture("segment-poss-left.bin")).toMatchObject({
      scoreHome: 0,
      scoreGuest: 0,
      timeoutsGuest: 1,
    });
  });

  it("segment-score-g10.bin → guest score 12 confirms byte 15", () => {
    // Live capture with the panel set to guest score 12. Byte 15 (guest score
    // tens) was unconfirmed in the original reverse engineering — no capture
    // had a guest score ≥ 10. This fixture closes that gap: byte 15 carries the
    // tens digit with the same linear encoding as the home-score pair.
    expect(decodeFixture("segment-score-g10.bin")).toMatchObject({
      scoreHome: 0,
      scoreGuest: 12,
    });
  });
});

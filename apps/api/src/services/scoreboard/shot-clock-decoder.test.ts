import { describe, expect, it } from "vitest";
import { decodeShotClock } from "./shot-clock-decoder";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findSegmentFrames } from "./stramatel-segment-decoder";

// Prefix bytes are passed directly (sync+3 .. first C3), p[0] = flicker byte.
const px = (...bytes: number[]) => Buffer.from(bytes);

describe("decodeShotClock", () => {
  it("returns null for a short (no-shot-data) prefix", () => {
    expect(decodeShotClock(px(0x78, 0xfc))).toBeNull();
    expect(decodeShotClock(Buffer.alloc(0))).toBeNull();
  });

  it("decodes two-digit values (decade-independent units)", () => {
    expect(decodeShotClock(px(0x18, 0x98, 0x8b, 0x2d, 0x95, 0x95, 0x7f, 0xf0)))
      .toMatchObject({ value: 24, text: "24" });
    expect(decodeShotClock(px(0x18, 0x98, 0x99, 0x2d, 0x95, 0x95, 0x6f, 0xf0)))
      .toMatchObject({ value: 20, text: "20" });
    expect(decodeShotClock(px(0x18, 0xa8, 0x8b, 0x2d, 0x95, 0x95, 0x7f, 0xf0)))
      .toMatchObject({ value: 14, text: "14" });
    expect(decodeShotClock(px(0x18, 0xa8, 0xc7, 0x4b, 0x4b, 0x65, 0x5b)))
      .toMatchObject({ value: 19, text: "19" });
  });

  it("decodes single-digit plain values 5-9 via (p2,p3)", () => {
    expect(decodeShotClock(px(0x18, 0x68, 0x3a, 0x5a, 0x95, 0x95, 0x73, 0xf0)))
      .toMatchObject({ value: 9, text: "9" });
    expect(decodeShotClock(px(0x18, 0x68, 0x3a, 0x6a, 0xaa, 0x95, 0x6f, 0xf0)))
      .toMatchObject({ value: 5, text: "5" }); // p2=3a collides with 9; p3=6a => 5
  });

  it("decodes tenths under 5s: value fractional, text 'I.t'", () => {
    expect(decodeShotClock(px(0x18, 0x58, 0x7f, 0x2d, 0x95, 0x95, 0x7f, 0xf0)))
      .toMatchObject({ value: 4, text: "4.0" });
    expect(decodeShotClock(px(0x18, 0x68, 0x7d, 0x2d, 0x95, 0x95, 0x7d, 0xf0)))
      .toMatchObject({ value: 3.1, text: "3.1" });
    expect(decodeShotClock(px(0x18, 0xc8, 0x75, 0x2d, 0x95, 0x95, 0x75, 0xf0)))
      .toMatchObject({ value: 0.5, text: "0.5" });
  });

  it("decodes expiry 0 (encoded as 0.0) with display '0'", () => {
    expect(decodeShotClock(px(0x18, 0xc8, 0x7f, 0x2d, 0x95, 0x95, 0x7f, 0xf0)))
      .toMatchObject({ value: 0, text: "0" });
  });

  it("reports the running hint from p[4] on 8-byte prefixes", () => {
    expect(decodeShotClock(px(0x18, 0x98, 0x8d, 0x2d, 0x2d, 0x95, 0x6d, 0xf0))?.runningHint).toBe(true);
    expect(decodeShotClock(px(0x18, 0x98, 0x8b, 0x2d, 0x95, 0x95, 0x7f, 0xf0))?.runningHint).toBe(false);
  });
});

function prefixesOf(name: string): Buffer[] {
  const buf = readFileSync(resolve(import.meta.dirname, "__fixtures__", name));
  return findSegmentFrames(buf)
    .map((f) => {
      const c3 = f.indexOf(0xc3, 3);
      return f.subarray(3, c3);
    })
    .filter((p) => p.length >= 4);
}

describe("decodeShotClock fixtures", () => {
  const cases: Array<[string, number, string]> = [
    ["segment-shot-24.bin", 24, "24"],
    ["segment-shot-20.bin", 20, "20"],
    ["segment-shot-14.bin", 14, "14"],
    ["segment-shot-9.bin", 9, "9"],
    ["segment-shot-8.bin", 8, "8"],
    ["segment-shot-7.bin", 7, "7"],
    ["segment-shot-6.bin", 6, "6"],
    ["segment-shot-5.bin", 5, "5"],
    ["segment-shot-40.bin", 4, "4.0"],
    ["segment-shot-30.bin", 3, "3.0"],
    ["segment-shot-20t.bin", 2, "2.0"],
    ["segment-shot-10t.bin", 1, "1.0"],
    ["segment-shot-31.bin", 3.1, "3.1"],
    ["segment-shot-05.bin", 0.5, "0.5"],
    ["segment-shot-expiry0.bin", 0, "0"],
  ];
  it.each(cases)("%s decodes to the labelled value", (name, value, text) => {
    const readings = prefixesOf(name).map(decodeShotClock).filter(Boolean);
    expect(readings.length).toBeGreaterThan(0);
    for (const r of readings) {
      expect(r!.value).toBe(value);
      expect(r!.text).toBe(text);
    }
  });

  it("decodes the full running descent with no garbage values", () => {
    const seen = new Set<number>();
    for (const p of prefixesOf("segment-shot-desc.bin")) {
      const r = decodeShotClock(p);
      if (r) seen.add(r.value);
    }
    expect([...seen].every((v) => v >= 0 && v <= 24)).toBe(true);
    expect(seen.has(24)).toBe(true);
    expect(seen.has(0)).toBe(true);
  });
});

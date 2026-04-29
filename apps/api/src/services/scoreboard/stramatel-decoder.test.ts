import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findScoreFrames } from "./stramatel-decoder";

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
    expect(frames[0][0]).toBe(0xf8);
    expect(frames[0][frames[0].length - 1]).toBe(0x0d);
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

  it("extracts many frames from the captured fixture", () => {
    const buf = readFileSync(fixturePath);
    const frames = findScoreFrames(buf);
    expect(frames.length).toBeGreaterThan(1000);
  });
});

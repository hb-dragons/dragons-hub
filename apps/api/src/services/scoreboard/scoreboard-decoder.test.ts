import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeLatestFrame } from "./scoreboard-decoder";
import { buildTypeCBlock, segmentDigit } from "../../test/segment-block-builder";

function fixture(name: string): Buffer {
  return readFileSync(resolve(import.meta.dirname, "__fixtures__", name));
}

// A minimal old-protocol frame: F8 33 + 48-byte ASCII payload + 0D.
// Payload layout matches stramatel-decoder.ts fixed offsets — home score
// "  9" at bytes 6..9, guest "  4" at bytes 9..12, MM:SS "10:00".
function oldProtocolFrame(): Buffer {
  const payload =
    "  " + // 0..2 filler
    "10" + // 2..4 mm
    "00" + // 4..6 ss
    "  9" + // 6..9 scoreHome
    "  4" + // 9..12 scoreGuest
    "1" + // 12 period
    "0" + // 13 foulsHome
    "0" + // 14 foulsGuest
    "0" + // 15 timeoutsHome
    "0" + // 16 timeoutsGuest
    " " + // 17 filler
    " " + // 18 status
    " " + // 19 timeout
    "                        " + // 20..44 filler (24 chars)
    "00" + // 44..46 timeoutDuration
    "20"; // 46..48 shotClock
  return Buffer.concat([
    Buffer.from([0xf8, 0x33]),
    Buffer.from(payload, "ascii"),
    Buffer.from([0x0d]),
  ]);
}

describe("decodeLatestFrame", () => {
  it("routes a segment-protocol buffer through the segment decoder", () => {
    const result = decodeLatestFrame(fixture("segment-score-h2.bin"));
    expect(result).not.toBeNull();
    expect(result!.frame).toHaveLength(57);
    expect(result!.snapshot.scoreHome).toBe(2);
    expect(result!.snapshot.scoreGuest).toBe(0);
  });

  it("falls back to the old decoder when no segment frame is present", () => {
    const result = decodeLatestFrame(oldProtocolFrame());
    expect(result).not.toBeNull();
    expect(result!.frame[0]).toBe(0xf8);
    expect(result!.snapshot.scoreHome).toBe(9);
    expect(result!.snapshot.scoreGuest).toBe(4);
  });

  it("returns null for a buffer with no recognizable frame", () => {
    expect(decodeLatestFrame(Buffer.from("deadbeefcafe", "hex"))).toBeNull();
  });

  it("returns the last decodable type-C block when several are present", () => {
    const first = buildTypeCBlock({ 13: segmentDigit(3) }); // home score 3
    const last = buildTypeCBlock({ 13: segmentDigit(7) }); // home score 7
    const result = decodeLatestFrame(Buffer.concat([first, last]));
    expect(result).not.toBeNull();
    expect(result!.snapshot.scoreHome).toBe(7);
  });
});

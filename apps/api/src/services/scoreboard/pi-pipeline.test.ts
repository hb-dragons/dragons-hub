/**
 * End-to-end regression test for the wire between the Raspberry Pi and this API.
 *
 * The Pi does not post the panel's bytes as it read them: `apps/pi` normalises,
 * re-frames and hex-encodes every read before POSTing it. Testing the decoder on
 * raw captures leaves that transformation untested — which is how a change on
 * the Pi that mangled every frame shipped with this suite green (issue #94).
 *
 * So these tests run the real Pi code. `apps/pi/scripts/replay-pipeline.py`
 * feeds a capture through `panel_pipeline.replay` — the same function
 * `Panel2Net.py` uses in its read loop — and prints the POST bodies; each body
 * goes through `decodeLatestFrame` exactly as the ingest route does. Anything
 * the Pi drops or corrupts on the way out shows up here as a frame that no
 * longer decodes.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { decodeLatestFrame, decodeLatestShot } from "./scoreboard-decoder";
import {
  BLANK_CELL,
  buildSc24Block,
  segmentDigit,
} from "../../test/segment-block-builder";

const REPLAY_SCRIPT = resolve(
  import.meta.dirname,
  "../../../../pi/scripts/replay-pipeline.py",
);

const SC24_CAPTURE = resolve(
  import.meta.dirname,
  "__fixtures__",
  "segment-sc24-connected.bin",
);

/** The bodies the Pi would POST for a stream of panel bytes. */
function pipeThroughPi(capturePath: string): string[] {
  let stdout: string;
  try {
    stdout = execFileSync("python3", [REPLAY_SCRIPT, capturePath], {
      encoding: "utf8",
    });
  } catch (err) {
    throw new Error(
      `could not run the Pi pipeline (${REPLAY_SCRIPT}) — python3 is required ` +
        `for this test: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return stdout.split("\n").filter((line) => line.length > 0);
}

describe("Pi pipeline -> API decoder", () => {
  const bodies = pipeThroughPi(SC24_CAPTURE);

  it("posts one hex body per serial read", () => {
    expect(bodies).toHaveLength(44);
    for (const body of bodies) {
      // Buffer.from(hex, "hex") truncates silently at the first non-hex
      // character, so a body that is not hex throughout loses data unnoticed.
      expect(body).toMatch(/^[0-9A-F]+$/);
      expect(body.length % 2).toBe(0);
    }
  });

  it("every posted frame decodes to a full board, not a shot-clock-only frame", () => {
    const decoded = bodies.map((body) =>
      decodeLatestFrame(Buffer.from(body, "hex")),
    );

    // A null here is the production failure mode: ingest falls back to the
    // shot-clock-only branch and carries the previous board forward, so the
    // shot clock ticks while score, clock, period, fouls and timeouts freeze.
    expect(decoded.filter((d) => d !== null)).toHaveLength(44);

    for (const frame of decoded) {
      expect(frame!.snapshot).toMatchObject({
        scoreHome: 0,
        scoreGuest: 0,
        period: 1,
        foulsHome: 0,
        foulsGuest: 0,
        timeoutsHome: 0,
        timeoutsGuest: 0,
        clockText: "07:45",
        clockSeconds: 465,
        clockRunning: false,
      });
    }
  });

  it("keeps the shot-clock readings the capture carries", () => {
    const withShot = bodies.filter((body) =>
      decodeLatestShot(Buffer.from(body, "hex")),
    );
    expect(withShot).toHaveLength(10);
    expect(
      decodeLatestShot(Buffer.from(withShot[0]!, "hex")),
    ).toMatchObject({ value: 24, text: "24" });
  });

  it("carries every scoreboard field across the wire unchanged", () => {
    // Byte offsets are into the 57-byte type-C block (possession byte at 6).
    const board = buildSc24Block({
      7: segmentDigit(0), // clock "05:37"
      8: segmentDigit(5),
      9: segmentDigit(3),
      10: segmentDigit(7),
      11: BLANK_CELL, // home 87
      12: segmentDigit(8),
      13: segmentDigit(7),
      14: BLANK_CELL, // guest 64
      15: segmentDigit(6),
      16: segmentDigit(4),
      17: segmentDigit(3), // period 3
      18: segmentDigit(4), // fouls 4 / 2
      19: segmentDigit(2),
      20: segmentDigit(1), // timeouts 1 / 3
      21: segmentDigit(3),
      23: 0x9f, // clock running
    });
    // Two blocks back to back, so the transformation has to re-frame rather
    // than pass a single read straight through.
    const stream = Buffer.concat([board, board]);
    const capture = join(mkdtempSync(join(tmpdir(), "pi-pipeline-")), "sc24.bin");
    writeFileSync(capture, stream);

    const posted = pipeThroughPi(capture);
    expect(posted).toHaveLength(1);

    const decoded = decodeLatestFrame(Buffer.from(posted[0]!, "hex"));
    expect(decoded?.snapshot).toMatchObject({
      scoreHome: 87,
      scoreGuest: 64,
      period: 3,
      foulsHome: 4,
      foulsGuest: 2,
      timeoutsHome: 1,
      timeoutsGuest: 3,
      clockText: "05:37",
      clockSeconds: 337,
      clockRunning: true,
      timeoutActive: false,
    });
  });
});

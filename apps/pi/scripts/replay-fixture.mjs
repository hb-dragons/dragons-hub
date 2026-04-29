#!/usr/bin/env node
/**
 * Replay frames from the bundled Stramatel fixture into a running ingest API.
 *
 * Usage:
 *   INGEST_KEY=<bearer> node apps/pi/scripts/replay-fixture.mjs
 *
 * Optional env:
 *   INGEST_URL   default http://localhost:3001/api/scoreboard/ingest
 *   DEVICE_ID    default dragons-1
 *   INTERVAL_MS  default 1000  (delay between POSTs)
 *   MAX_FRAMES   default 0     (0 = unlimited until end of fixture)
 *   FIXTURE      default ../api/src/services/scoreboard/__fixtures__/stramatel-sample.bin
 *
 * Behaviour:
 *  - Walks every decodable F8 33 frame in order.
 *  - De-duplicates consecutive frames whose decoded score / fouls / timeouts /
 *    period / clock-second / clock-running / shot-clock / timeout-active are
 *    identical, so each tick advances the perceived game state.
 *  - POSTs one frame per tick. Prints status + decoded summary.
 *  - Ctrl-C exits cleanly.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const INGEST_URL =
  process.env.INGEST_URL ?? "http://localhost:3001/api/scoreboard/ingest";
const INGEST_KEY = process.env.INGEST_KEY;
const DEVICE_ID = process.env.DEVICE_ID ?? "dragons-1";
const INTERVAL_MS = Number.parseInt(process.env.INTERVAL_MS ?? "1000", 10);
const MAX_FRAMES = Number.parseInt(process.env.MAX_FRAMES ?? "0", 10);
const FIXTURE =
  process.env.FIXTURE ??
  resolve(
    __dirname,
    "../../api/src/services/scoreboard/__fixtures__/stramatel-sample.bin",
  );

if (!INGEST_KEY) {
  console.error("INGEST_KEY env var is required.");
  process.exit(1);
}

const START = Buffer.from([0xf8, 0x33]);
const END = 0x0d;
const PAYLOAD_MIN = 48;

const DEDUPE_KEYS = [
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

function readSlice(buf, start, length) {
  return buf.subarray(start, start + length).toString("ascii");
}

function parseInt0(s) {
  const t = s.trim();
  if (!t) return 0;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : 0;
}

function decode(frame) {
  const payload = frame.subarray(2, frame.length - 1);
  if (payload.length < PAYLOAD_MIN) return null;
  for (let i = 0; i < payload.length; i++)
    if (payload[i] > 0x7e) return null;

  const testCond = readSlice(payload, 4, 2).trim();
  let clockText;
  let clockSeconds;
  if (testCond.length === 1) {
    clockText = `${readSlice(payload, 2, 2)}.${readSlice(payload, 3, 1)}`;
    const f = Number.parseFloat(clockText);
    clockSeconds = Number.isFinite(f) ? Math.floor(f) : null;
  } else {
    const mm = readSlice(payload, 2, 2);
    const ss = readSlice(payload, 4, 2);
    clockText = `${mm}:${ss}`;
    const m = Number.parseInt(mm.trim(), 10);
    const s = Number.parseInt(ss.trim(), 10);
    clockSeconds =
      Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null;
  }
  return {
    scoreHome: parseInt0(readSlice(payload, 6, 3)),
    scoreGuest: parseInt0(readSlice(payload, 9, 3)),
    period: parseInt0(readSlice(payload, 12, 1)),
    foulsHome: parseInt0(readSlice(payload, 13, 1)),
    foulsGuest: parseInt0(readSlice(payload, 14, 1)),
    timeoutsHome: parseInt0(readSlice(payload, 15, 1)),
    timeoutsGuest: parseInt0(readSlice(payload, 16, 1)),
    clockText,
    clockSeconds,
    clockRunning: readSlice(payload, 18, 1) !== "1",
    shotClock: parseInt0(readSlice(payload, 46, 2)),
    timeoutActive: readSlice(payload, 19, 1) !== " ",
  };
}

function findFrames(buf) {
  const frames = [];
  let cursor = 0;
  while (cursor < buf.length) {
    const s = buf.indexOf(START, cursor);
    if (s === -1) break;
    const e = buf.indexOf(END, s + 2);
    if (e === -1) break;
    frames.push(buf.subarray(s, e + 1));
    cursor = e + 1;
  }
  return frames;
}

function isDifferent(a, b) {
  if (!a) return true;
  return DEDUPE_KEYS.some((k) => a[k] !== b[k]);
}

async function main() {
  const buf = readFileSync(FIXTURE);
  const allFrames = findFrames(buf);
  const decoded = allFrames
    .map((f) => ({ frame: f, snap: decode(f) }))
    .filter((x) => x.snap !== null);

  // Compress into one frame per state change.
  const replay = [];
  let prev = null;
  for (const { frame, snap } of decoded) {
    if (isDifferent(prev, snap)) {
      replay.push({ frame, snap });
      prev = snap;
    }
  }

  console.log(
    `loaded ${allFrames.length} raw frames, ${decoded.length} decodable, ${replay.length} state changes`,
  );
  console.log(
    `posting to ${INGEST_URL} as device ${DEVICE_ID} every ${INTERVAL_MS} ms`,
  );

  let stopped = false;
  process.on("SIGINT", () => {
    console.log("\ninterrupt — stopping after current frame");
    stopped = true;
  });

  const limit = MAX_FRAMES > 0 ? Math.min(MAX_FRAMES, replay.length) : replay.length;
  for (let i = 0; i < limit && !stopped; i++) {
    const { frame, snap } = replay[i];
    const hex = frame.toString("hex");
    const t0 = Date.now();
    let outcome;
    try {
      const res = await fetch(INGEST_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${INGEST_KEY}`,
          Device_ID: DEVICE_ID,
          "Content-Type": "text/plain",
        },
        body: hex,
      });
      const body = await res.text();
      outcome = `${res.status} ${body}`;
    } catch (err) {
      outcome = `ERR ${(err instanceof Error ? err.message : String(err))}`;
    }
    const dt = Date.now() - t0;
    const summary =
      `Q${snap.period} ${snap.clockText.padStart(5)} | ` +
      `H ${String(snap.scoreHome).padStart(3)} (${snap.foulsHome}f ${snap.timeoutsHome}t) | ` +
      `G ${String(snap.scoreGuest).padStart(3)} (${snap.foulsGuest}f ${snap.timeoutsGuest}t) | ` +
      `SC ${String(snap.shotClock).padStart(2)}` +
      (snap.timeoutActive ? " TO" : "") +
      (snap.clockRunning ? " ▶" : " ⏸");
    console.log(
      `[${(i + 1).toString().padStart(4)}/${limit}] ${dt}ms ${outcome.split("\n")[0]} ${summary}`,
    );
    if (i + 1 < limit && !stopped) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  }
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

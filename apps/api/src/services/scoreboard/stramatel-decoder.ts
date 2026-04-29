const START_TOKEN = Buffer.from([0xf8, 0x33]);
const END_TOKEN = 0x0d;

export function findScoreFrames(input: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const start = input.indexOf(START_TOKEN, cursor);
    if (start === -1) break;
    const end = input.indexOf(END_TOKEN, start + START_TOKEN.length);
    if (end === -1) break;
    frames.push(input.subarray(start, end + 1));
    cursor = end + 1;
  }
  return frames;
}

export interface StramatelSnapshot {
  scoreHome: number;
  scoreGuest: number;
  foulsHome: number;
  foulsGuest: number;
  timeoutsHome: number;
  timeoutsGuest: number;
  period: number;
  clockText: string;
  clockSeconds: number | null;
  clockRunning: boolean;
  shotClock: number;
  timeoutActive: boolean;
  timeoutDuration: string;
}

const PAYLOAD_MIN_LENGTH = 48;

function readSlice(buf: Buffer, start: number, length: number): string {
  return buf.subarray(start, start + length).toString("ascii");
}

function parseInt0(input: string): number {
  const trimmed = input.trim();
  if (trimmed.length === 0) return 0;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : 0;
}

export function decodeScoreFrame(frame: Buffer): StramatelSnapshot | null {
  // Frame starts with F8 33 (2 bytes) and ends with 0D (1 byte).
  // The PHP reference operates on the substring between those markers.
  const payload = frame.subarray(2, frame.length - 1);
  if (payload.length < PAYLOAD_MIN_LENGTH) return null;

  const testCond = readSlice(payload, 4, 2).trim();
  let clockText: string;
  let clockSeconds: number | null;
  if (testCond.length === 1) {
    // Sub-second: payload[2..4] + "." + payload[3..4]
    clockText = `${readSlice(payload, 2, 2)}.${readSlice(payload, 3, 1)}`;
    const f = Number.parseFloat(clockText);
    clockSeconds = Number.isFinite(f) ? Math.floor(f) : null;
  } else {
    // MM:SS: payload[2..4] + ":" + payload[4..6]
    const mm = readSlice(payload, 2, 2);
    const ss = readSlice(payload, 4, 2);
    clockText = `${mm}:${ss}`;
    const m = Number.parseInt(mm.trim(), 10);
    const s = Number.parseInt(ss.trim(), 10);
    clockSeconds =
      Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null;
  }

  const scoreHome = parseInt0(readSlice(payload, 6, 3));
  const scoreGuest = parseInt0(readSlice(payload, 9, 3));
  const period = parseInt0(readSlice(payload, 12, 1));
  const foulsHome = parseInt0(readSlice(payload, 13, 1));
  const foulsGuest = parseInt0(readSlice(payload, 14, 1));
  const timeoutsHome = parseInt0(readSlice(payload, 15, 1));
  const timeoutsGuest = parseInt0(readSlice(payload, 16, 1));

  const statusByte = readSlice(payload, 18, 1);
  const clockRunning = statusByte !== "1";

  const timeoutByte = readSlice(payload, 19, 1);
  const timeoutActive = timeoutByte !== " ";

  const timeoutDuration = readSlice(payload, 44, 2);
  const shotClock = parseInt0(readSlice(payload, 46, 2));

  return {
    scoreHome,
    scoreGuest,
    foulsHome,
    foulsGuest,
    timeoutsHome,
    timeoutsGuest,
    period,
    clockText,
    clockSeconds,
    clockRunning,
    shotClock,
    timeoutActive,
    timeoutDuration,
  };
}

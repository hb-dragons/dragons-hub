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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  closeSub: vi.fn(),
  selectLive: vi.fn(),
  selectReplay: vi.fn(),
}));

vi.mock("./pubsub", () => ({
  subscribeSnapshots: (...a: unknown[]) => mocks.subscribe(...a),
}));

vi.mock("../../config/database", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mocks.selectLive(),
          orderBy: () => ({
            limit: async () => mocks.selectReplay(),
          }),
        }),
      }),
    }),
  },
}));

import { createScoreboardStream } from "./sse";

beforeEach(() => {
  mocks.subscribe.mockReset();
  mocks.closeSub.mockReset();
  mocks.subscribe.mockResolvedValue(async () => mocks.closeSub());
  mocks.selectLive.mockResolvedValue([
    { deviceId: "d1", scoreHome: 1, scoreGuest: 0 },
  ]);
  mocks.selectReplay.mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

async function readChunks(
  stream: ReadableStream<Uint8Array>,
  count: number,
): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  while (chunks.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(decoder.decode(value));
  }
  await reader.cancel();
  return chunks;
}

describe("createScoreboardStream", () => {
  it("emits a snapshot-on-connect for fresh client", async () => {
    const res = createScoreboardStream({
      deviceId: "d1",
      lastEventId: undefined,
    });
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const chunks = await readChunks(res.body!, 2);
    const joined = chunks.join("");
    expect(joined).toContain("event: snapshot");
    expect(joined).toContain('"scoreHome":1');
    expect(mocks.subscribe).toHaveBeenCalledWith("d1", expect.any(Function));
  });

  it("uses replay query when Last-Event-ID is present", async () => {
    mocks.selectReplay.mockResolvedValue([
      { id: 11, deviceId: "d1", scoreHome: 2, scoreGuest: 0 },
    ]);
    const res = createScoreboardStream({ deviceId: "d1", lastEventId: 10 });
    const chunks = await readChunks(res.body!, 2);
    const joined = chunks.join("");
    expect(joined).toContain("id: 11");
    expect(joined).toContain('"scoreHome":2');
    expect(mocks.selectLive).not.toHaveBeenCalled();
  });
});

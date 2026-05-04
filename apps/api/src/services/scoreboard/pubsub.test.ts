import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MessageHandler = (channel: string, message: string) => void;

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  on: vi.fn<(event: string, fn: MessageHandler) => void>(),
  quit: vi.fn(),
}));

vi.mock("../../config/redis", () => ({
  createRedisClient: () => ({
    publish: (...a: unknown[]) => mocks.publish(...a),
    subscribe: (...a: unknown[]) => mocks.subscribe(...a),
    unsubscribe: (...a: unknown[]) => mocks.unsubscribe(...a),
    on: (event: string, fn: MessageHandler) => mocks.on(event, fn),
    quit: (...a: unknown[]) => mocks.quit(...a),
  }),
}));

vi.mock("../../config/logger", () => ({
  logger: { child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) },
}));

let messageHandler: MessageHandler | null = null;
function deliver(channel: string, message: string): void {
  messageHandler?.(channel, message);
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  messageHandler = null;
  mocks.subscribe.mockResolvedValue(undefined);
  mocks.unsubscribe.mockResolvedValue(undefined);
  mocks.on.mockImplementation((event, fn) => {
    if (event === "message") messageHandler = fn;
  });
});
afterEach(() => {
  vi.clearAllMocks();
});

async function loadPubsub() {
  return import("./pubsub");
}

describe("pubsub", () => {
  it("namespaces channels by device id", async () => {
    const { channelFor, broadcastChannelFor } = await loadPubsub();
    expect(channelFor("dragons-1")).toBe("scoreboard:dragons-1");
    expect(broadcastChannelFor("d1")).toBe("broadcast:d1");
  });

  it("publishes JSON-encoded payloads", async () => {
    const { publishSnapshot } = await loadPubsub();
    mocks.publish.mockResolvedValue(1);
    await publishSnapshot("dragons-1", { scoreHome: 1 });
    expect(mocks.publish).toHaveBeenCalledWith(
      "scoreboard:dragons-1",
      JSON.stringify({ scoreHome: 1 }),
    );
  });

  it("subscribes once per channel and forwards messages to all listeners", async () => {
    const { subscribeSnapshots } = await loadPubsub();
    const a: unknown[] = [];
    const b: unknown[] = [];
    const closeA = await subscribeSnapshots("d1", (s) => a.push(s));
    const closeB = await subscribeSnapshots("d1", (s) => b.push(s));
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    deliver("scoreboard:other", JSON.stringify({ skip: true }));
    deliver("scoreboard:d1", JSON.stringify({ keep: true }));
    expect(a).toEqual([{ keep: true }]);
    expect(b).toEqual([{ keep: true }]);
    await closeA();
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    await closeB();
    expect(mocks.unsubscribe).toHaveBeenCalledWith("scoreboard:d1");
  });

  it("discards malformed JSON without invoking the handler", async () => {
    const { subscribeSnapshots } = await loadPubsub();
    const received: unknown[] = [];
    await subscribeSnapshots("d1", (s) => received.push(s));
    deliver("scoreboard:d1", "not-json");
    expect(received).toEqual([]);
  });

  it("subscribeBroadcast forwards JSON and ignores other channels", async () => {
    const { subscribeBroadcast } = await loadPubsub();
    const received: unknown[] = [];
    const close = await subscribeBroadcast("d1", (s) => received.push(s));
    deliver("broadcast:other", JSON.stringify({ skip: true }));
    deliver("broadcast:d1", "not-json");
    deliver("broadcast:d1", JSON.stringify({ keep: true }));
    expect(received).toEqual([{ keep: true }]);
    await close();
    expect(mocks.unsubscribe).toHaveBeenCalledWith("broadcast:d1");
  });

  it("publish reuses a single publisher across calls", async () => {
    const { publishSnapshot, publishBroadcast } = await loadPubsub();
    mocks.publish.mockResolvedValue(1);
    await publishSnapshot("d1", { a: 1 });
    await publishSnapshot("d2", { b: 2 });
    await publishBroadcast("d3", { c: 3 });
    expect(mocks.publish).toHaveBeenCalledTimes(3);
  });
});

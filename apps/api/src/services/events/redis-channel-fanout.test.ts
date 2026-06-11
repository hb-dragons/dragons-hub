import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MessageHandler = (channel: string, message: string) => void;

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  on: vi.fn<(event: string, fn: MessageHandler) => void>(),
  created: 0,
}));

vi.mock("../../config/redis", () => ({
  createRedisClient: () => {
    mocks.created += 1;
    return {
      publish: (...a: unknown[]) => mocks.publish(...a),
      subscribe: (...a: unknown[]) => mocks.subscribe(...a),
      unsubscribe: (...a: unknown[]) => mocks.unsubscribe(...a),
      on: (event: string, fn: MessageHandler) => mocks.on(event, fn),
    };
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) },
}));

let messageHandler: MessageHandler | null = null;
function deliver(channel: string, message: string): void {
  messageHandler?.(channel, message);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  messageHandler = null;
  mocks.created = 0;
  mocks.subscribe.mockResolvedValue(undefined);
  mocks.unsubscribe.mockResolvedValue(undefined);
  mocks.on.mockImplementation((event, fn) => {
    if (event === "message") messageHandler = fn;
  });
});
afterEach(() => vi.clearAllMocks());

async function makeFanout() {
  const { createChannelFanout } = await import("./redis-channel-fanout");
  return createChannelFanout("test");
}

describe("createChannelFanout", () => {
  it("subscribes once per channel and forwards parsed payloads to all listeners", async () => {
    const fanout = await makeFanout();
    const a: unknown[] = [];
    const b: unknown[] = [];
    const closeA = await fanout.subscribe("ch", (p) => a.push(p));
    const closeB = await fanout.subscribe("ch", (p) => b.push(p));

    expect(mocks.subscribe).toHaveBeenCalledTimes(1);

    deliver("other", JSON.stringify({ skip: true }));
    deliver("ch", JSON.stringify({ keep: true }));

    expect(a).toEqual([{ keep: true }]);
    expect(b).toEqual([{ keep: true }]);

    await closeA();
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    await closeB();
    expect(mocks.unsubscribe).toHaveBeenCalledWith("ch");
  });

  it("drops malformed JSON without invoking handlers", async () => {
    const fanout = await makeFanout();
    const received: unknown[] = [];
    await fanout.subscribe("ch", (p) => received.push(p));
    deliver("ch", "not-json");
    expect(received).toEqual([]);
  });

  it("reuses one subscriber and one publisher connection", async () => {
    const fanout = await makeFanout();
    mocks.publish.mockResolvedValue(1);
    await fanout.subscribe("a", () => {});
    await fanout.subscribe("b", () => {});
    await fanout.publish("a", { x: 1 });
    await fanout.publish("b", { y: 2 });
    // 1 subscriber (lazily, on first subscribe) + 1 publisher (on first publish)
    expect(mocks.created).toBe(2);
    expect(mocks.publish).toHaveBeenCalledWith("a", JSON.stringify({ x: 1 }));
  });
});

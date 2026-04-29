import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  on: vi.fn(),
  quit: vi.fn(),
}));

vi.mock("../../config/redis", () => ({
  createRedisClient: () => ({
    publish: (...a: unknown[]) => mocks.publish(...a),
    subscribe: (...a: unknown[]) => mocks.subscribe(...a),
    unsubscribe: (...a: unknown[]) => mocks.unsubscribe(...a),
    on: (...a: unknown[]) => mocks.on(...a),
    quit: (...a: unknown[]) => mocks.quit(...a),
  }),
}));

import { publishSnapshot, subscribeSnapshots, channelFor } from "./pubsub";

describe("pubsub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("namespaces channels by device id", () => {
    expect(channelFor("dragons-1")).toBe("scoreboard:dragons-1");
  });

  it("publishes JSON-encoded payloads", async () => {
    mocks.publish.mockResolvedValue(1);
    await publishSnapshot("dragons-1", { scoreHome: 1 });
    expect(mocks.publish).toHaveBeenCalledWith(
      "scoreboard:dragons-1",
      JSON.stringify({ scoreHome: 1 }),
    );
  });

  it("subscribes and forwards messages on the right channel", async () => {
    type MessageHandler = (channel: string, message: string) => void;
    let messageHandler: MessageHandler | null = null;
    mocks.on.mockImplementation((event: string, fn: MessageHandler) => {
      if (event === "message") messageHandler = fn;
    });
    mocks.subscribe.mockResolvedValue(undefined);
    const received: unknown[] = [];
    const close = await subscribeSnapshots("dragons-1", (snap) => {
      received.push(snap);
    });
    expect(mocks.subscribe).toHaveBeenCalledWith("scoreboard:dragons-1");
    (messageHandler as MessageHandler | null)?.("scoreboard:other", JSON.stringify({ skip: true }));
    (messageHandler as MessageHandler | null)?.("scoreboard:dragons-1", JSON.stringify({ keep: true }));
    expect(received).toEqual([{ keep: true }]);
    await close();
    expect(mocks.unsubscribe).toHaveBeenCalledWith("scoreboard:dragons-1");
    expect(mocks.quit).toHaveBeenCalled();
  });
});

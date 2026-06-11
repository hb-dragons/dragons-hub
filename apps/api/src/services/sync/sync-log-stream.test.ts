import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("../events/redis-channel-fanout", () => ({
  createChannelFanout: () => ({
    subscribe: (...a: unknown[]) => mocks.subscribe(...a),
    publish: (...a: unknown[]) => mocks.publish(...a),
  }),
}));

import { subscribeSyncLog, syncLogChannel } from "./sync-log-stream";

beforeEach(() => vi.clearAllMocks());

describe("sync-log-stream", () => {
  it("namespaces the channel by sync run id", () => {
    expect(syncLogChannel(42)).toBe("sync:42:logs");
  });

  it("subscribes to the run's channel via the shared fanout", async () => {
    const close = async () => {};
    mocks.subscribe.mockResolvedValue(close);
    const onMessage = () => {};

    const result = await subscribeSyncLog(7, onMessage);

    expect(mocks.subscribe).toHaveBeenCalledWith("sync:7:logs", onMessage);
    expect(result).toBe(close);
  });
});

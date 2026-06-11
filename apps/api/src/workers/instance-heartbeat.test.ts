import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// --- Mock setup ---

const mockRedisSet = vi.fn().mockResolvedValue("OK");
const mockRedisExists = vi.fn().mockResolvedValue(0);

vi.mock("../config/redis", () => ({
  redis: {
    set: (...args: unknown[]) => mockRedisSet(...args),
    exists: (...args: unknown[]) => mockRedisExists(...args),
  },
}));

vi.mock("../config/logger", () => {
  const log = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  log.child.mockReturnValue(log);
  return { logger: log };
});

import {
  INSTANCE_ID,
  writeHeartbeat,
  isInstanceAlive,
  startHeartbeat,
  stopHeartbeat,
} from "./instance-heartbeat";

beforeEach(() => {
  vi.clearAllMocks();
  // Ensure heartbeat timer is clean between tests
  stopHeartbeat();
});

afterEach(() => {
  stopHeartbeat();
  vi.useRealTimers();
});

describe("INSTANCE_ID", () => {
  it("is a non-empty string", () => {
    expect(typeof INSTANCE_ID).toBe("string");
    expect(INSTANCE_ID.length).toBeGreaterThan(0);
  });
});

describe("writeHeartbeat", () => {
  it("calls redis.set with the correct key, value, EX flag, and TTL", async () => {
    await writeHeartbeat();

    expect(mockRedisSet).toHaveBeenCalledOnce();
    expect(mockRedisSet).toHaveBeenCalledWith(
      `worker:hb:${INSTANCE_ID}`,
      "1",
      "EX",
      60,
    );
  });

  it("propagates redis errors", async () => {
    mockRedisSet.mockRejectedValueOnce(new Error("redis down"));

    await expect(writeHeartbeat()).rejects.toThrow("redis down");
  });
});

describe("isInstanceAlive", () => {
  it("returns false without calling redis when instanceId is null", async () => {
    const result = await isInstanceAlive(null);

    expect(result).toBe(false);
    expect(mockRedisExists).not.toHaveBeenCalled();
  });

  it("returns true when redis.exists returns 1", async () => {
    mockRedisExists.mockResolvedValueOnce(1);

    const result = await isInstanceAlive("some-instance-id");

    expect(result).toBe(true);
    expect(mockRedisExists).toHaveBeenCalledWith("worker:hb:some-instance-id");
  });

  it("returns false when redis.exists returns 0", async () => {
    mockRedisExists.mockResolvedValueOnce(0);

    const result = await isInstanceAlive("some-instance-id");

    expect(result).toBe(false);
    expect(mockRedisExists).toHaveBeenCalledWith("worker:hb:some-instance-id");
  });
});

describe("startHeartbeat / stopHeartbeat", () => {
  it("calls writeHeartbeat immediately on start", async () => {
    vi.useFakeTimers();

    startHeartbeat();

    // Flush the immediate writeHeartbeat promise (void promise schedules a microtask)
    await Promise.resolve();

    expect(mockRedisSet).toHaveBeenCalledOnce();

    stopHeartbeat();
  });

  it("does not start a second interval if already running", async () => {
    vi.useFakeTimers();

    startHeartbeat();
    await Promise.resolve();
    const callsAfterFirst = mockRedisSet.mock.calls.length;

    startHeartbeat(); // second call — should be no-op
    await Promise.resolve();

    expect(mockRedisSet.mock.calls.length).toBe(callsAfterFirst);

    stopHeartbeat();
  });

  it("fires the interval callback after HB_REFRESH_MS", async () => {
    vi.useFakeTimers();

    startHeartbeat();
    await Promise.resolve(); // flush initial write

    const callsBeforeInterval = mockRedisSet.mock.calls.length;

    await vi.advanceTimersByTimeAsync(20_000);

    expect(mockRedisSet.mock.calls.length).toBeGreaterThan(callsBeforeInterval);

    stopHeartbeat();
  });

  it("stopHeartbeat clears the interval so no further writes occur", async () => {
    vi.useFakeTimers();

    startHeartbeat();
    await Promise.resolve();

    stopHeartbeat();

    const callsAfterStop = mockRedisSet.mock.calls.length;

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockRedisSet.mock.calls.length).toBe(callsAfterStop);
  });

  it("stopHeartbeat is safe to call when not running", () => {
    expect(() => stopHeartbeat()).not.toThrow();
  });
});

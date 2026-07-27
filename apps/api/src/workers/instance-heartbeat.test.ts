import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// --- Mock setup ---

const mockRedisSet = vi.fn().mockResolvedValue("OK");
const mockPipelineExists = vi.fn();
const mockPipelineExec = vi.fn<() => Promise<[Error | null, unknown][] | null>>(async () => []);
const mockPipeline = vi.fn();

vi.mock("../config/redis", () => ({
  getRedis: () => ({
    set: (...args: unknown[]) => mockRedisSet(...args),
    pipeline: () => {
      mockPipeline();
      return {
        exists: (...args: unknown[]) => mockPipelineExists(...args),
        exec: () => mockPipelineExec(),
      };
    },
  }),
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
  filterAliveInstances,
  startHeartbeat,
  stopHeartbeat,
} from "./instance-heartbeat";

beforeEach(() => {
  vi.clearAllMocks();
  mockPipelineExec.mockImplementation(async () => []);
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

describe("filterAliveInstances", () => {
  it.each([[[]], [[null, null]]])(
    "returns an empty set without touching redis for %j",
    async (ids: (string | null)[]) => {
      const alive = await filterAliveInstances(ids);

      expect(alive).toEqual(new Set());
      expect(mockPipeline).not.toHaveBeenCalled();
    },
  );

  it("probes every id in one pipelined round trip", async () => {
    mockPipelineExec.mockResolvedValueOnce([
      [null, 1],
      [null, 0],
    ]);

    const alive = await filterAliveInstances(["a", "b"]);

    expect(alive).toEqual(new Set(["a"]));
    expect(mockPipeline).toHaveBeenCalledOnce();
    expect(mockPipelineExec).toHaveBeenCalledOnce();
    expect(mockPipelineExists.mock.calls).toEqual([["worker:hb:a"], ["worker:hb:b"]]);
  });

  // One instance owns many runs; probing the same heartbeat key once per run
  // is what made the boot-time reclaim N round trips in the first place.
  it("deduplicates ids and drops nulls before probing", async () => {
    mockPipelineExec.mockResolvedValueOnce([[null, 1]]);

    const alive = await filterAliveInstances(["a", "a", null]);

    expect(alive).toEqual(new Set(["a"]));
    expect(mockPipelineExists).toHaveBeenCalledOnce();
  });

  // Marking a run failed is destructive. A probe we could not complete must
  // not be read as "the owner is dead".
  it("assumes alive when a probe errors", async () => {
    mockPipelineExec.mockResolvedValueOnce([
      [new Error("redis down"), null],
      [null, 0],
    ]);

    const alive = await filterAliveInstances(["a", "b"]);

    expect(alive).toEqual(new Set(["a"]));
  });

  it("assumes alive when the pipeline returns no result for an id", async () => {
    mockPipelineExec.mockResolvedValueOnce(null);

    const alive = await filterAliveInstances(["a", "b"]);

    expect(alive).toEqual(new Set(["a", "b"]));
  });

  it("propagates a pipeline-level failure", async () => {
    mockPipelineExec.mockRejectedValueOnce(new Error("redis down"));

    await expect(filterAliveInstances(["a"])).rejects.toThrow("redis down");
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

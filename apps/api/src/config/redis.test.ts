import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const handlers: Record<string, (...args: unknown[]) => void> = {};
const mockOn = vi.fn().mockImplementation(function (this: unknown, event: string, handler: (...args: unknown[]) => void) {
  handlers[event] = handler;
  return this;
});

const constructed: { url: string; options: Record<string, unknown> }[] = [];

const mockEval = vi.fn();
const mockIncr = vi.fn();
const mockExpire = vi.fn();

vi.mock("ioredis", () => ({
  default: class MockRedis {
    constructor(url: string, options: Record<string, unknown>) {
      constructed.push({ url, options });
    }
    on = mockOn;
    ping = vi.fn().mockResolvedValue("PONG");
    quit = vi.fn().mockResolvedValue("OK");
    eval = mockEval;
    incr = mockIncr;
    expire = mockExpire;
  },
}));

describe("redis config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    constructed.length = 0;
  });

  it("creates redis lazily on first call", async () => {
    const { getRedis } = await import("./redis");

    const result = await getRedis().ping();

    expect(result).toBe("PONG");
  });

  it("registers connect and error handlers", async () => {
    const { getRedis } = await import("./redis");

    // Trigger initialization
    getRedis();

    expect(mockOn).toHaveBeenCalledWith("connect", expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("connect handler logs message", async () => {
    const { logger } = await import("./logger");
    const { getRedis } = await import("./redis");
    getRedis();

    const connectHandler = handlers["connect"];
    expect(connectHandler).toBeDefined();
    connectHandler!();
    expect(logger.info).toHaveBeenCalledWith("Redis connected");
  });

  it("error handler logs error message", async () => {
    const { logger } = await import("./logger");
    const { getRedis } = await import("./redis");
    getRedis();

    const err = new Error("connection failed");
    const errorHandler = handlers["error"];
    expect(errorHandler).toBeDefined();
    errorHandler!(err);
    expect(logger.error).toHaveBeenCalledWith(
      { err, kind: "request" },
      "Redis connection error",
    );
  });

  // An ioredis client with no `error` listener turns a connection drop into an
  // unhandled rejection, which takes the process down. Every factory in this
  // module has to attach one, so the assertion is over the factories, not over
  // one of them.
  it.each([
    ["getRedis", "request"],
    ["createRedisClient", "blocking"],
  ] as const)("%s attaches an error listener", async (factory, kind) => {
    const mod = (await import("./redis")) as unknown as Record<string, () => unknown>;
    const { logger } = await import("./logger");

    mod[factory]!();

    expect(mockOn).toHaveBeenCalledWith("error", expect.any(Function));
    const err = new Error("boom");
    handlers["error"]!(err);
    expect(logger.error).toHaveBeenCalledWith({ err, kind }, "Redis connection error");
  });

  it("closeRedis quits the client and clears the singleton", async () => {
    const { getRedis, closeRedis } = await import("./redis");
    const client = getRedis();

    await closeRedis();

    expect(client.quit).toHaveBeenCalled();
    expect(getRedis()).not.toBe(client);
  });

  it("closeRedis is a no-op when no client exists", async () => {
    const { closeRedis } = await import("./redis");
    await expect(closeRedis()).resolves.toBeUndefined();
  });

  // `maxRetriesPerRequest: null` makes a command issued while Redis is down sit
  // in the offline queue forever — it never resolves and never rejects. On the
  // request path that turns every "fail open" catch into dead code and hangs
  // the request, so the request-path client must use a finite value.
  it("gives the request-path client a finite maxRetriesPerRequest", async () => {
    const { getRedis } = await import("./redis");

    getRedis();

    expect(constructed).toHaveLength(1);
    const { options } = constructed[0]!;
    expect(typeof options.maxRetriesPerRequest).toBe("number");
    expect(options.maxRetriesPerRequest).toBeGreaterThan(0);
  });

  // BullMQ mandates `null` on connections it owns (a blocking read must survive
  // reconnects), so that option keeps its own factory.
  it("keeps maxRetriesPerRequest null on blocking/BullMQ-style clients", async () => {
    const { createRedisClient } = await import("./redis");

    createRedisClient();

    expect(constructed).toHaveLength(1);
    expect(constructed[0]!.options.maxRetriesPerRequest).toBeNull();
  });

  it("builds request-path and blocking clients as separate instances", async () => {
    const { getRedis, createRedisClient } = await import("./redis");

    const request = getRedis();
    const blocking = createRedisClient();

    expect(request).not.toBe(blocking);
    expect(constructed).toHaveLength(2);
    expect(constructed[0]!.options.maxRetriesPerRequest).not.toBeNull();
    expect(constructed[1]!.options.maxRetriesPerRequest).toBeNull();
  });
});

// The counter and its expiry used to be an INCR followed by a separate EXPIRE.
// Anything that interrupted the process between them left a key with no TTL,
// and a key that never expires never resets: a rate-limited caller stayed
// limited forever, and the sign-in failure counter accumulated across all time
// until it locked out a legitimate user. EVAL runs the whole thing server-side
// in one atomic step, so there is no gap to be interrupted in.
describe("incrementWithTtl", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    constructed.length = 0;
  });

  it("issues exactly one Redis command, never a separate INCR and EXPIRE", async () => {
    const { incrementWithTtl } = await import("./redis");
    mockEval.mockResolvedValue(1);

    await incrementWithTtl("rl:qa:u1:99", 60);

    expect(mockEval).toHaveBeenCalledTimes(1);
    expect(mockIncr).not.toHaveBeenCalled();
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("passes the key and TTL to a script that sets the expiry", async () => {
    const { incrementWithTtl } = await import("./redis");
    mockEval.mockResolvedValue(1);

    await incrementWithTtl("rl:qa:u1:99", 60);

    const [script, numKeys, key, ttl] = mockEval.mock.calls[0]!;
    expect(numKeys).toBe(1);
    expect(key).toBe("rl:qa:u1:99");
    expect(ttl).toBe("60");
    expect(script).toContain("INCR");
    expect(script).toContain("EXPIRE");
  });

  it("re-applies the expiry to a key that already lost its TTL", async () => {
    const { incrementWithTtl } = await import("./redis");
    mockEval.mockResolvedValue(7);

    await incrementWithTtl("rl:qa:u1:99", 60);

    // Counters stranded without a TTL by the previous non-atomic code heal on
    // their next request rather than needing a manual flush.
    const [script] = mockEval.mock.calls[0]!;
    expect(script).toContain("TTL");
    expect(script).toMatch(/count == 1 or/);
  });

  it("returns the counter as a number", async () => {
    const { incrementWithTtl } = await import("./redis");
    mockEval.mockResolvedValue("4");

    await expect(incrementWithTtl("rl:qa:u1:99", 60)).resolves.toBe(4);
  });

  it("propagates a Redis failure so callers can fail open", async () => {
    const { incrementWithTtl } = await import("./redis");
    mockEval.mockRejectedValue(new Error("redis down"));

    await expect(incrementWithTtl("rl:qa:u1:99", 60)).rejects.toThrow("redis down");
  });
});

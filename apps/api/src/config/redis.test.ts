import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

const handlers: Record<string, (...args: unknown[]) => void> = {};
const mockOn = vi.fn().mockImplementation(function (this: unknown, event: string, handler: (...args: unknown[]) => void) {
  handlers[event] = handler;
  return this;
});

vi.mock("ioredis", () => ({
  default: class MockRedis {
    on = mockOn;
    ping = vi.fn().mockResolvedValue("PONG");
  },
}));

describe("redis config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates redis lazily on first access", async () => {
    const { redis } = await import("./redis");

    const result = await redis.ping();

    expect(result).toBe("PONG");
  });

  it("registers connect and error handlers", async () => {
    const { redis } = await import("./redis");

    // Trigger initialization
    void redis.ping;

    expect(mockOn).toHaveBeenCalledWith("connect", expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("connect handler logs message", async () => {
    const { redis } = await import("./redis");
    void redis.ping;

    const connectHandler = handlers["connect"];
    expect(connectHandler).toBeDefined();
    connectHandler!(); // Should not throw
  });

  it("error handler logs error message", async () => {
    const { redis } = await import("./redis");
    void redis.ping;

    const errorHandler = handlers["error"];
    expect(errorHandler).toBeDefined();
    errorHandler!(new Error("connection failed")); // Should not throw
  });
});

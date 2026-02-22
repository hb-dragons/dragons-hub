import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

vi.mock("../../config/env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
vi.mock("../../config/database", () => ({
  db: { insert: (...args: unknown[]) => mockInsert(...args) },
}));

vi.mock("@dragons/db/schema", () => ({
  syncRunEntries: Symbol("syncRunEntries"),
}));

const mockPublish = vi.fn().mockResolvedValue(1);
const mockQuit = vi.fn().mockResolvedValue("OK");

vi.mock("ioredis", () => ({
  default: class MockRedis {
    publish = mockPublish;
    quit = mockQuit;
  },
}));

import { SyncLogger, createSyncLogger, type LogEntry } from "./sync-logger";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SyncLogger", () => {
  it("creates with correct channel name", () => {
    const logger = new SyncLogger(42);

    expect(logger.getChannelName()).toBe("sync:42:logs");
  });

  it("flushes entries to the database", async () => {
    const logger = new SyncLogger(1);
    await logger.log({
      entityType: "league",
      entityId: "100",
      entityName: "Test",
      action: "created",
      message: "Created",
    });

    await logger.flush();

    expect(mockInsert).toHaveBeenCalled();
  });

  it("does not flush when no entries", async () => {
    const logger = new SyncLogger(1);

    await logger.flush();

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("publishes to Redis on log", async () => {
    const logger = new SyncLogger(1);

    await logger.log({
      entityType: "league",
      entityId: "1",
      action: "created",
    });

    expect(mockPublish).toHaveBeenCalledWith(
      "sync:1:logs",
      expect.stringContaining('"entityType":"league"'),
    );
  });

  it("disables Redis publish on failure", async () => {
    mockPublish.mockRejectedValueOnce(new Error("Redis down"));
    const logger = new SyncLogger(1);

    await logger.log({ entityType: "league", entityId: "1", action: "created" });
    // Second call should not attempt publish
    await logger.log({ entityType: "league", entityId: "2", action: "created" });

    expect(mockPublish).toHaveBeenCalledTimes(1);
  });

  it("emits entry events", async () => {
    const logger = new SyncLogger(1);
    const listener = vi.fn();
    logger.on("entry", listener);

    const entry: LogEntry = { entityType: "team", entityId: "5", action: "updated" };
    await logger.log(entry);

    expect(listener).toHaveBeenCalledWith(entry);
  });

  it("removes event listeners with off()", async () => {
    const logger = new SyncLogger(1);
    const listener = vi.fn();
    logger.on("entry", listener);
    logger.off("entry", listener);

    await logger.log({ entityType: "team", entityId: "5", action: "updated" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("auto-flushes at batch size", async () => {
    const logger = new SyncLogger(1);

    for (let i = 0; i < 50; i++) {
      await logger.log({ entityType: "league", entityId: String(i), action: "created" });
    }

    // Should have flushed once at 50 items
    expect(mockInsert).toHaveBeenCalled();
  });

  it("logBatch delegates to log for each entry", async () => {
    const logger = new SyncLogger(1);
    const entries: LogEntry[] = [
      { entityType: "league", entityId: "1", action: "created" },
      { entityType: "team", entityId: "2", action: "updated" },
    ];

    await logger.logBatch(entries);

    expect(mockPublish).toHaveBeenCalledTimes(2);
  });

  it("retains entries on flush error", async () => {
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockRejectedValueOnce(new Error("DB error")),
    });
    const logger = new SyncLogger(1);

    await logger.log({ entityType: "league", entityId: "1", action: "created" });
    await logger.flush();

    // Should retry on next flush
    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    await logger.flush();

    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it("close() flushes and publishes complete event", async () => {
    const logger = new SyncLogger(1);
    const completeListener = vi.fn();
    logger.on("complete", completeListener);

    await logger.log({ entityType: "league", entityId: "1", action: "created" });
    await logger.close();

    expect(mockInsert).toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalledWith(
      "sync:1:logs",
      JSON.stringify({ type: "complete" }),
    );
    expect(mockQuit).toHaveBeenCalled();
    expect(completeListener).toHaveBeenCalled();
  });

  it("close() handles Redis quit failure", async () => {
    mockQuit.mockRejectedValueOnce(new Error("fail"));
    const logger = new SyncLogger(1);

    // Should not throw
    await logger.close();
  });
});

describe("createSyncLogger", () => {
  it("returns a SyncLogger instance", () => {
    const logger = createSyncLogger(99);

    expect(logger).toBeInstanceOf(SyncLogger);
    expect(logger.getChannelName()).toBe("sync:99:logs");
  });
});

describe("SyncLogger with Redis failure", () => {
  it("handles Redis constructor failure gracefully", async () => {
    // Reset modules to test with a failing Redis constructor
    vi.resetModules();
    vi.doMock("ioredis", () => ({
      default: class FailingRedis {
        constructor() {
          throw new Error("Redis unavailable");
        }
      },
    }));
    vi.doMock("../../config/env", () => ({
      env: { REDIS_URL: "redis://localhost:6379" },
    }));
    vi.doMock("../../config/database", () => ({
      db: { insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }) },
    }));
    vi.doMock("@dragons/db/schema", () => ({
      syncRunEntries: Symbol("syncRunEntries"),
    }));

    const { SyncLogger: SyncLoggerWithoutRedis } = await import("./sync-logger");
    const logger = new SyncLoggerWithoutRedis(1);

    // Should still work for non-Redis operations
    await logger.log({ entityType: "league", entityId: "1", action: "created" });
    await logger.close();
  });
});

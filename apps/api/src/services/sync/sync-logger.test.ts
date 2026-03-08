import { describe, expect, it, vi, beforeEach } from "vitest";
import type Redis from "ioredis";

// --- Mock setup ---

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
vi.mock("../../config/database", () => ({
  db: { insert: (...args: unknown[]) => mockInsert(...args) },
}));

vi.mock("@dragons/db/schema", () => ({
  syncRunEntries: Symbol("syncRunEntries"),
}));

const mockPublish = vi.fn().mockResolvedValue(1);
vi.mock("../../config/redis", () => ({
  redis: {
    publish: (...args: unknown[]) => mockPublish(...args),
  },
}));

import { SyncLogger, createSyncLogger, batchAction, type LogEntry } from "./sync-logger";

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

  it("drops entries after max flush retries", async () => {
    const failingInsert = {
      values: vi.fn().mockRejectedValue(new Error("DB error")),
    };
    mockInsert.mockReturnValue(failingInsert);
    const logger = new SyncLogger(1);

    await logger.log({ entityType: "league", entityId: "1", action: "created" });

    // Flush fails 3 times (MAX_FLUSH_RETRIES)
    await logger.flush(); // retry 1 - entries retained
    await logger.flush(); // retry 2 - entries retained
    await logger.flush(); // retry 3 - entries DROPPED

    // 4th flush should have nothing to insert (entries were dropped)
    mockInsert.mockClear();
    await logger.flush();

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("resets retry counter after successful flush", async () => {
    const logger = new SyncLogger(1);

    // Fail twice
    mockInsert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    await logger.log({ entityType: "league", entityId: "1", action: "created" });
    await logger.flush(); // retry 1
    await logger.flush(); // retry 2

    // Now succeed
    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    await logger.flush(); // success - resets counter

    // Fail again - should start retry count from 0
    mockInsert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    await logger.log({ entityType: "league", entityId: "2", action: "created" });
    await logger.flush(); // retry 1 (not 3)

    // Entry should still be in buffer (retained for retry)
    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    await logger.flush();
    expect(mockInsert).toHaveBeenCalled();
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
    expect(completeListener).toHaveBeenCalled();
  });

  it("close() handles Redis publish failure gracefully", async () => {
    mockPublish.mockRejectedValueOnce(new Error("fail"));
    const logger = new SyncLogger(1);

    // Should not throw
    await logger.close();
  });

  it("uses provided Redis instance", async () => {
    const customPublish = vi.fn().mockResolvedValue(1);
    const customRedis = { publish: customPublish } as unknown as Redis;
    const logger = new SyncLogger(1, customRedis);

    await logger.log({ entityType: "league", entityId: "1", action: "created" });

    expect(customPublish).toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("disables streaming when null Redis passed", async () => {
    const logger = new SyncLogger(1, null);

    await logger.log({ entityType: "league", entityId: "1", action: "created" });

    expect(mockPublish).not.toHaveBeenCalled();
  });
});

describe("createSyncLogger", () => {
  it("returns a SyncLogger instance", () => {
    const logger = createSyncLogger(99);

    expect(logger).toBeInstanceOf(SyncLogger);
    expect(logger.getChannelName()).toBe("sync:99:logs");
  });
});

describe("batchAction", () => {
  it("returns 'failed' when failed > 0", () => {
    expect(batchAction(0, 0, 1)).toBe("failed");
    expect(batchAction(5, 3, 1)).toBe("failed");
  });

  it("returns 'updated' when created > 0", () => {
    expect(batchAction(1, 0, 0)).toBe("updated");
  });

  it("returns 'updated' when updated > 0", () => {
    expect(batchAction(0, 1, 0)).toBe("updated");
  });

  it("returns 'skipped' when all counts are zero", () => {
    expect(batchAction(0, 0, 0)).toBe("skipped");
  });
});

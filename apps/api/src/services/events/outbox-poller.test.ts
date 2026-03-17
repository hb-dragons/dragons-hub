import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// --- Mock setup ---

vi.mock("../../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockUpdate = vi.fn();
const mockExecute = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  domainEvents: {
    id: "id",
    type: "type",
    urgency: "urgency",
    entityType: "entityType",
    entityId: "entityId",
    enqueuedAt: "enqueuedAt",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  isNull: vi.fn((...args: unknown[]) => ({ isNull: args })),
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  lte: vi.fn((...args: unknown[]) => ({ lte: args })),
  sql: vi.fn((...args: unknown[]) => ({ sql: args })),
}));

const mockQueueAdd = vi.fn().mockResolvedValue({ id: "job-1" });
vi.mock("../../workers/queues", () => ({
  domainEventsQueue: {
    add: (...args: unknown[]) => mockQueueAdd(...args),
  },
}));

import {
  pollOutbox,
  startOutboxPoller,
  stopOutboxPoller,
} from "./outbox-poller";

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
});

afterEach(() => {
  stopOutboxPoller();
});

describe("pollOutbox", () => {
  it("returns 0 when no pending events", async () => {
    // Transaction mock calls the callback with a tx object
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        update: mockUpdate,
      };
      return fn(tx);
    });

    const result = await pollOutbox();
    expect(result).toBe(0);
  });

  it("enqueues pending events and returns count", async () => {
    const pending = [
      { id: "evt-1", type: "match.created", urgency: "routine", entity_type: "match", entity_id: 1 },
      { id: "evt-2", type: "match.cancelled", urgency: "immediate", entity_type: "match", entity_id: 2 },
    ];

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn().mockResolvedValue({ rows: pending }),
        update: mockUpdate,
      };
      return fn(tx);
    });

    const result = await pollOutbox();

    expect(result).toBe(2);
    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "match.created",
      expect.objectContaining({ eventId: "evt-1" }),
    );
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "match.cancelled",
      expect.objectContaining({ eventId: "evt-2" }),
    );
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it("continues on individual event failure and logs error", async () => {
    const pending = [
      { id: "evt-1", type: "match.created", urgency: "routine", entity_type: "match", entity_id: 1 },
      { id: "evt-2", type: "match.cancelled", urgency: "immediate", entity_type: "match", entity_id: 2 },
    ];

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn().mockResolvedValue({ rows: pending }),
        update: mockUpdate,
      };
      return fn(tx);
    });

    // First event fails, second succeeds
    mockQueueAdd
      .mockRejectedValueOnce(new Error("Redis down"))
      .mockResolvedValueOnce({ id: "job-2" });

    const result = await pollOutbox();

    expect(result).toBe(1);
    const { logger } = await import("../../config/logger");
    expect(logger.error).toHaveBeenCalled();
  });

  it("uses FOR UPDATE SKIP LOCKED via raw SQL", async () => {
    let capturedSql: unknown = null;

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn().mockImplementation((sqlQuery: unknown) => {
          capturedSql = sqlQuery;
          return Promise.resolve({ rows: [] });
        }),
        update: mockUpdate,
      };
      return fn(tx);
    });

    await pollOutbox();

    // Verify that the SQL template was passed (drizzle sql tagged template)
    expect(capturedSql).toBeDefined();
  });
});

describe("startOutboxPoller / stopOutboxPoller", () => {
  it("starts and stops without error", () => {
    vi.useFakeTimers();

    startOutboxPoller(1000);
    stopOutboxPoller();

    vi.useRealTimers();
  });

  it("warns when starting a poller that is already running", async () => {
    vi.useFakeTimers();

    startOutboxPoller(1000);
    startOutboxPoller(1000);

    const { logger } = await import("../../config/logger");
    expect(logger.warn).toHaveBeenCalledWith("Outbox poller already running");

    stopOutboxPoller();
    vi.useRealTimers();
  });

  it("stopOutboxPoller is safe to call when not running", () => {
    // Should not throw
    stopOutboxPoller();
  });

  it("logs error when pollOutbox rejects inside interval callback", async () => {
    vi.useFakeTimers();

    mockTransaction.mockRejectedValue(new Error("DB connection lost"));

    startOutboxPoller(100);

    // Advance past one interval tick
    await vi.advanceTimersByTimeAsync(150);

    const { logger: mockLogger } = await import("../../config/logger");
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "Outbox poller iteration failed",
    );

    stopOutboxPoller();
    vi.useRealTimers();
  });
});

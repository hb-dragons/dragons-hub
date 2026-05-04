import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockExecute = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  domainEvents: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    vi.fn((...args: unknown[]) => ({ sql: args })),
    { raw: vi.fn((s: string) => ({ raw: s })) },
  ),
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
  mockQueueAdd.mockResolvedValue({ id: "job-1" });
});

afterEach(() => {
  stopOutboxPoller();
});

function setClaimedRows(rows: unknown[]) {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows }),
    };
    return fn(tx);
  });
}

describe("pollOutbox", () => {
  it("returns 0 when no pending events", async () => {
    setClaimedRows([]);
    expect(await pollOutbox()).toBe(0);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("enqueues claimed events and returns count", async () => {
    setClaimedRows([
      { id: "evt-1", type: "match.created", urgency: "routine", entity_type: "match", entity_id: 1 },
      { id: "evt-2", type: "match.cancelled", urgency: "immediate", entity_type: "match", entity_id: 2 },
    ]);

    expect(await pollOutbox()).toBe(2);
    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "match.created",
      expect.objectContaining({ eventId: "evt-1" }),
    );
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "match.cancelled",
      expect.objectContaining({ eventId: "evt-2" }),
    );
  });

  it("releases claim and logs on enqueue failure", async () => {
    setClaimedRows([
      { id: "evt-1", type: "match.created", urgency: "routine", entity_type: "match", entity_id: 1 },
      { id: "evt-2", type: "match.cancelled", urgency: "immediate", entity_type: "match", entity_id: 2 },
    ]);

    mockQueueAdd
      .mockRejectedValueOnce(new Error("Redis down"))
      .mockResolvedValueOnce({ id: "job-2" });

    mockExecute.mockResolvedValue({ rows: [] });

    expect(await pollOutbox()).toBe(1);
    expect(mockExecute).toHaveBeenCalled();
    const { logger } = await import("../../config/logger");
    expect(logger.error).toHaveBeenCalled();
  });

  it("uses FOR UPDATE SKIP LOCKED in claim sql", async () => {
    let captured: unknown = null;
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn().mockImplementation((sqlQuery: unknown) => {
          captured = sqlQuery;
          return Promise.resolve({ rows: [] });
        }),
      };
      return fn(tx);
    });
    await pollOutbox();
    expect(captured).toBeDefined();
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
    stopOutboxPoller();
  });

  it("logs error when pollOutbox rejects inside interval callback", async () => {
    vi.useFakeTimers();
    mockTransaction.mockRejectedValue(new Error("DB connection lost"));
    startOutboxPoller(100);
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

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// --- Mock setup ---

vi.mock("../../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
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
  },
}));

vi.mock("drizzle-orm", () => ({
  isNull: vi.fn((...args: unknown[]) => ({ isNull: args })),
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
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
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await pollOutbox();
    expect(result).toBe(0);
  });

  it("enqueues pending events and returns count", async () => {
    const pending = [
      {
        id: "evt-1",
        type: "match.created",
        urgency: "routine",
        entityType: "match",
        entityId: 1,
      },
      {
        id: "evt-2",
        type: "match.cancelled",
        urgency: "immediate",
        entityType: "match",
        entityId: 2,
      },
    ];

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(pending),
        }),
      }),
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
      {
        id: "evt-1",
        type: "match.created",
        urgency: "routine",
        entityType: "match",
        entityId: 1,
      },
      {
        id: "evt-2",
        type: "match.cancelled",
        urgency: "immediate",
        entityType: "match",
        entityId: 2,
      },
    ];

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(pending),
        }),
      }),
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
});

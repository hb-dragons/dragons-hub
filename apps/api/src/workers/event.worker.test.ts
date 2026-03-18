import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Capture the processor function from BullMQ Worker ---

let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;

vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: (job: unknown) => Promise<unknown>, _opts: unknown) {
      capturedProcessor = processor;
    }
    on() { return this; }
  },
  Job: class MockJob {},
}));

// --- Mock logger ---

vi.mock("../config/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// --- Mock env ---

vi.mock("../config/env", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
  },
}));

// --- Mock database ---

const mockDbSelect = vi.fn();
vi.mock("../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

// --- Mock schema ---

vi.mock("@dragons/db/schema", () => ({
  domainEvents: { id: "id" },
}));

// --- Mock drizzle-orm ---

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ _eq: val })),
}));

// --- Mock notification pipeline ---

const mockProcessEvent = vi.fn();
vi.mock("../services/notifications/notification-pipeline", () => ({
  processEvent: (...args: unknown[]) => mockProcessEvent(...args),
}));

// --- Mock queues ---

const mockDigestQueueAdd = vi.fn().mockResolvedValue({ id: "digest-job-1" });
vi.mock("./queues", () => ({
  digestQueue: {
    add: (...args: unknown[]) => mockDigestQueueAdd(...args),
  },
}));

// --- Mock shared ---

vi.mock("@dragons/shared", () => ({
  EVENT_TYPES: {
    SYNC_COMPLETED: "sync.completed",
  },
}));

// --- Import the module (triggers Worker constructor, captures processor) ---

await import("./event.worker");

// --- Helpers ---

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    data: {
      eventId: "evt-1",
      type: "match.cancelled",
      urgency: "immediate",
      entityType: "match",
      entityId: 42,
      ...overrides,
    },
  };
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    type: "match.cancelled",
    urgency: "immediate",
    payload: { matchId: 42, reason: "weather" },
    source: "sync",
    entityName: "Dragons vs. Tigers",
    entityType: "match",
    entityId: 42,
    ...overrides,
  };
}

function makeChannelConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    type: "in_app",
    enabled: true,
    digestMode: "per_sync",
    config: { locale: "de" },
    ...overrides,
  };
}

/** Set up DB mocks for event lookup */
function setupDbMocks(opts: {
  event?: Record<string, unknown> | null;
}) {
  const event = opts.event === undefined ? makeEvent() : opts.event;
  const data = event ? [event] : [];

  mockDbSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => {
        const result = Promise.resolve(data);
        (result as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue(data);
        return result;
      }),
    }),
  }));
}

// --- Tests ---

describe("event worker processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessEvent.mockResolvedValue({
      dispatched: 0,
      buffered: 0,
      coalesced: 0,
      muted: 0,
      configs: [],
    });
  });

  it("captures the processor function from BullMQ Worker", () => {
    expect(capturedProcessor).toBeTypeOf("function");
  });

  describe("event not found", () => {
    it("returns skipped result when event is not in DB", async () => {
      setupDbMocks({ event: null });

      const result = await capturedProcessor!(makeJob());

      expect(result).toEqual({ skipped: true, reason: "event_not_found" });
    });

    it("does not call processEvent when event is missing", async () => {
      setupDbMocks({ event: null });

      await capturedProcessor!(makeJob());

      expect(mockProcessEvent).not.toHaveBeenCalled();
    });
  });

  describe("pipeline delegation", () => {
    it("calls processEvent with the full event from DB", async () => {
      const event = makeEvent();
      setupDbMocks({ event });

      await capturedProcessor!(makeJob());

      expect(mockProcessEvent).toHaveBeenCalledTimes(1);
      expect(mockProcessEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "evt-1",
          type: "match.cancelled",
        }),
      );
    });

    it("returns dispatched and buffered counts from pipeline", async () => {
      setupDbMocks({ event: makeEvent() });
      mockProcessEvent.mockResolvedValue({
        dispatched: 3,
        buffered: 5,
        coalesced: 1,
        muted: 0,
      });

      const result = await capturedProcessor!(makeJob());

      expect(result).toEqual({ dispatched: 3, buffered: 5 });
    });

    it("returns zero counts when pipeline processes nothing", async () => {
      setupDbMocks({ event: makeEvent() });

      const result = await capturedProcessor!(makeJob());

      expect(result).toEqual({ dispatched: 0, buffered: 0 });
    });
  });

  describe("digest triggering for sync.completed", () => {
    it("enqueues digest jobs for per_sync channel configs from pipeline result", async () => {
      const config1 = makeChannelConfig({ id: 10, digestMode: "per_sync", enabled: true });
      const config2 = makeChannelConfig({ id: 20, digestMode: "per_sync", enabled: true });
      const event = makeEvent({ type: "sync.completed", urgency: "routine" });
      setupDbMocks({ event });
      mockProcessEvent.mockResolvedValue({
        dispatched: 0, buffered: 0, coalesced: 0, muted: 0,
        configs: [config1, config2],
      });

      await capturedProcessor!(makeJob({ type: "sync.completed" }));

      expect(mockDigestQueueAdd).toHaveBeenCalledTimes(2);
      expect(mockDigestQueueAdd).toHaveBeenCalledWith(
        "digest:10",
        expect.objectContaining({ channelConfigId: 10 }),
      );
      expect(mockDigestQueueAdd).toHaveBeenCalledWith(
        "digest:20",
        expect.objectContaining({ channelConfigId: 20 }),
      );
    });

    it("skips configs that are not per_sync", async () => {
      const config1 = makeChannelConfig({ id: 10, digestMode: "per_sync", enabled: true });
      const config2 = makeChannelConfig({ id: 20, digestMode: "scheduled", enabled: true });
      const event = makeEvent({ type: "sync.completed", urgency: "routine" });
      setupDbMocks({ event });
      mockProcessEvent.mockResolvedValue({
        dispatched: 0, buffered: 0, coalesced: 0, muted: 0,
        configs: [config1, config2],
      });

      await capturedProcessor!(makeJob({ type: "sync.completed" }));

      expect(mockDigestQueueAdd).toHaveBeenCalledTimes(1);
      expect(mockDigestQueueAdd).toHaveBeenCalledWith(
        "digest:10",
        expect.objectContaining({ channelConfigId: 10 }),
      );
    });

    it("skips disabled configs for per_sync digest", async () => {
      const config = makeChannelConfig({ id: 10, digestMode: "per_sync", enabled: false });
      const event = makeEvent({ type: "sync.completed", urgency: "routine" });
      setupDbMocks({ event });
      mockProcessEvent.mockResolvedValue({
        dispatched: 0, buffered: 0, coalesced: 0, muted: 0,
        configs: [config],
      });

      await capturedProcessor!(makeJob({ type: "sync.completed" }));

      expect(mockDigestQueueAdd).not.toHaveBeenCalled();
    });

    it("does not enqueue digest jobs when configs list is empty", async () => {
      const event = makeEvent({ type: "sync.completed", urgency: "routine" });
      setupDbMocks({ event });
      mockProcessEvent.mockResolvedValue({
        dispatched: 0, buffered: 0, coalesced: 0, muted: 0,
        configs: [],
      });

      await capturedProcessor!(makeJob({ type: "sync.completed" }));

      expect(mockDigestQueueAdd).not.toHaveBeenCalled();
    });

    it("does not trigger digests for non-sync.completed events", async () => {
      setupDbMocks({ event: makeEvent() });

      await capturedProcessor!(makeJob());

      expect(mockDigestQueueAdd).not.toHaveBeenCalled();
    });

    it("handles digest queue add failure gracefully", async () => {
      const config = makeChannelConfig({ id: 10, digestMode: "per_sync", enabled: true });
      const event = makeEvent({ type: "sync.completed", urgency: "routine" });
      setupDbMocks({ event });
      mockProcessEvent.mockResolvedValue({
        dispatched: 0, buffered: 0, coalesced: 0, muted: 0,
        configs: [config],
      });
      mockDigestQueueAdd.mockRejectedValueOnce(new Error("Redis error"));

      // Should not throw
      const result = await capturedProcessor!(makeJob({ type: "sync.completed" }));

      expect(result).toEqual({ dispatched: 0, buffered: 0 });
    });
  });
});

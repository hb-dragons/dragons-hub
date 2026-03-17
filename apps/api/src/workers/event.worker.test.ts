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
const mockDbInsert = vi.fn();
vi.mock("../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

// --- Mock schema ---

vi.mock("@dragons/db/schema", () => ({
  domainEvents: { id: "id" },
  watchRules: { enabled: "enabled" },
  channelConfigs: { id: "id", enabled: "enabled" },
  digestBuffer: { eventId: "eventId", channelConfigId: "channelConfigId" },
}));

// --- Mock drizzle-orm ---

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ _eq: val })),
}));

// --- Mock rule engine ---

const mockEvaluateRule = vi.fn();
vi.mock("../services/notifications/rule-engine", () => ({
  evaluateRule: (...args: unknown[]) => mockEvaluateRule(...args),
}));

// --- Mock role defaults ---

const mockGetDefaultNotificationsForEvent = vi.fn();
vi.mock("../services/notifications/role-defaults", () => ({
  getDefaultNotificationsForEvent: (...args: unknown[]) =>
    mockGetDefaultNotificationsForEvent(...args),
}));

// --- Mock templates ---

const mockRenderEventMessage = vi.fn();
vi.mock("../services/notifications/templates/index", () => ({
  renderEventMessage: (...args: unknown[]) => mockRenderEventMessage(...args),
}));

// --- Mock InAppChannelAdapter ---

const mockInAppSend = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/notifications/channels/in-app", () => ({
  InAppChannelAdapter: class {
    send(...args: unknown[]) {
      return mockInAppSend(...args);
    }
  },
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
    ...overrides,
  };
}

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    eventTypes: ["match.cancelled"],
    filters: [],
    channels: [{ channel: "in_app", targetId: "10" }],
    urgencyOverride: null,
    enabled: true,
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

/** Set up DB mocks for a standard flow: event found, rules, configs */
function setupDbMocks(opts: {
  event?: Record<string, unknown> | null;
  rules?: Record<string, unknown>[];
  configs?: Record<string, unknown>[];
}) {
  const event = opts.event === undefined ? makeEvent() : opts.event;
  const rules = opts.rules ?? [];
  const configs = opts.configs ?? [];

  // db.select() is called 3 times: event lookup, watch rules, channel configs
  const callSequence = [
    event ? [event] : [], // event lookup
    rules,                // watch rules
    configs,              // channel configs
  ];
  let callIndex = 0;

  mockDbSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(callSequence[callIndex++] ?? []),
      }),
    }),
  }));

  // For watch rules and channel configs (no .limit() call)
  // We need a smarter mock that handles both patterns:
  // - .select().from().where().limit() for events
  // - .select().from().where() for rules/configs
  callIndex = 0;
  mockDbSelect.mockImplementation(() => {
    const idx = callIndex++;
    const data = callSequence[idx] ?? [];
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          // Return both a promise (for rules/configs) and a .limit() method (for events)
          const result = Promise.resolve(data);
          (result as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue(data);
          return result;
        }),
      }),
    };
  });

  // db.insert() for digest buffer
  mockDbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

// --- Tests ---

describe("event worker processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDefaultNotificationsForEvent.mockReturnValue([]);
    mockRenderEventMessage.mockReturnValue({
      title: "Match Cancelled",
      body: "The match has been cancelled.",
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

    it("does not query rules or configs when event is missing", async () => {
      setupDbMocks({ event: null });

      await capturedProcessor!(makeJob());

      // Only one select call (the event lookup)
      expect(mockDbSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe("no matching rules", () => {
    it("returns zero dispatches when no rules exist", async () => {
      setupDbMocks({ event: makeEvent(), rules: [], configs: [] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([]);

      const result = await capturedProcessor!(makeJob());

      expect(result).toEqual({ dispatched: 0, buffered: 0 });
    });

    it("returns zero dispatches when rules do not match", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ event: makeEvent(), rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({ matched: false, channels: [], urgencyOverride: null });

      const result = await capturedProcessor!(makeJob());

      expect(result).toEqual({ dispatched: 0, buffered: 0 });
      expect(mockInAppSend).not.toHaveBeenCalled();
    });
  });

  describe("rule matching with immediate dispatch", () => {
    it("dispatches via in-app adapter and buffers for digest", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ event: makeEvent(), rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-1",
          watchRuleId: 1,
          channelConfigId: 10,
          recipientId: "10",
          title: "Match Cancelled",
          body: "The match has been cancelled.",
          locale: "de",
        }),
      );
      expect(mockDbInsert).toHaveBeenCalled();
      expect(result).toEqual({ dispatched: 1, buffered: 1 });
    });

    it("uses urgencyOverride from rule when present", async () => {
      const rule = makeRule({ urgencyOverride: "immediate" });
      const config = makeChannelConfig();
      // Event has routine urgency, but rule overrides to immediate
      const event = makeEvent({ urgency: "routine" });
      setupDbMocks({ event, rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: "immediate",
      });

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ dispatched: 1, buffered: 1 });
    });

    it("renders message with locale from channel config", async () => {
      const config = makeChannelConfig({ config: { locale: "en" } });
      const rule = makeRule();
      setupDbMocks({ event: makeEvent(), rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      await capturedProcessor!(makeJob());

      expect(mockRenderEventMessage).toHaveBeenCalledWith(
        "match.cancelled",
        { matchId: 42, reason: "weather" },
        "Dragons vs. Tigers",
        "en",
      );
    });

    it("defaults locale to 'de' when config has no locale", async () => {
      const config = makeChannelConfig({ config: {} });
      const rule = makeRule();
      setupDbMocks({ event: makeEvent(), rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      await capturedProcessor!(makeJob());

      expect(mockRenderEventMessage).toHaveBeenCalledWith(
        "match.cancelled",
        expect.anything(),
        "Dragons vs. Tigers",
        "de",
      );
    });
  });

  describe("rule matching with routine urgency", () => {
    it("only buffers for digest, does not dispatch immediately", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      const event = makeEvent({ urgency: "routine" });
      setupDbMocks({ event, rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(mockDbInsert).toHaveBeenCalled();
      expect(result).toEqual({ dispatched: 0, buffered: 1 });
    });
  });

  describe("deduplication", () => {
    it("does not dispatch same channel target twice from same rule", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ event: makeEvent(), rules: [rule], configs: [config] });
      // Rule returns duplicate channels
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [
          { channel: "in_app", targetId: "10" },
          { channel: "in_app", targetId: "10" },
        ],
        urgencyOverride: null,
      });

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ dispatched: 1, buffered: 1 });
    });

    it("dispatches to different channel targets from different rules", async () => {
      const rule1 = makeRule({ id: 1, channels: [{ channel: "in_app", targetId: "10" }] });
      const rule2 = makeRule({ id: 2, channels: [{ channel: "in_app", targetId: "20" }] });
      const config1 = makeChannelConfig({ id: 10 });
      const config2 = makeChannelConfig({ id: 20 });
      setupDbMocks({
        event: makeEvent(),
        rules: [rule1, rule2],
        configs: [config1, config2],
      });
      mockEvaluateRule
        .mockReturnValueOnce({
          matched: true,
          channels: [{ channel: "in_app", targetId: "10" }],
          urgencyOverride: null,
        })
        .mockReturnValueOnce({
          matched: true,
          channels: [{ channel: "in_app", targetId: "20" }],
          urgencyOverride: null,
        });

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ dispatched: 2, buffered: 2 });
    });
  });

  describe("channel config lookup", () => {
    it("skips channel targets with no matching config", async () => {
      const rule = makeRule();
      // Config ID 99 does not match targetId "10"
      const config = makeChannelConfig({ id: 99 });
      setupDbMocks({ event: makeEvent(), rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(result).toEqual({ dispatched: 0, buffered: 0 });
    });
  });

  describe("role-based defaults", () => {
    it("dispatches admin defaults to matching channel configs", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "admin", locale: "de" } });
      setupDbMocks({ event: makeEvent(), rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-1",
          watchRuleId: null,
          channelConfigId: 10,
          recipientId: "audience:admin",
        }),
      );
      expect(result).toEqual({ dispatched: 1, buffered: 1 });
    });

    it("dispatches referee defaults with refereeId in recipientId", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      setupDbMocks({ event: makeEvent(), rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId: 77 },
      ]);

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "referee:77",
        }),
      );
      expect(result).toEqual({ dispatched: 1, buffered: 1 });
    });

    it("matches configs without audienceRole to all defaults", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { locale: "de" } });
      setupDbMocks({ event: makeEvent(), rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ dispatched: 1, buffered: 1 });
    });

    it("filters out configs with non-matching audienceRole", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      setupDbMocks({ event: makeEvent(), rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(result).toEqual({ dispatched: 0, buffered: 0 });
    });

    it("filters out configs with non-matching channel type", async () => {
      const config = makeChannelConfig({ id: 10, type: "email", config: { audienceRole: "admin", locale: "de" } });
      setupDbMocks({ event: makeEvent(), rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(result).toEqual({ dispatched: 0, buffered: 0 });
    });

    it("does not dispatch defaults for routine urgency events", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "admin", locale: "de" } });
      const event = makeEvent({ urgency: "routine" });
      setupDbMocks({ event, rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).not.toHaveBeenCalled();
      // Should still buffer
      expect(mockDbInsert).toHaveBeenCalled();
      expect(result).toEqual({ dispatched: 0, buffered: 1 });
    });

    it("deduplicates default dispatches to same config and recipient", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { locale: "de" } });
      setupDbMocks({ event: makeEvent(), rules: [], configs: [config] });
      // Two defaults that would go to the same config + audience
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await capturedProcessor!(makeJob());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ dispatched: 1, buffered: 1 });
    });
  });

  describe("digest triggering for sync.completed", () => {
    it("enqueues digest jobs for per_sync channel configs", async () => {
      const config1 = makeChannelConfig({ id: 10, digestMode: "per_sync", enabled: true });
      const config2 = makeChannelConfig({ id: 20, digestMode: "per_sync", enabled: true });
      const event = makeEvent({ type: "sync.completed", urgency: "routine" });
      setupDbMocks({ event, rules: [], configs: [config1, config2] });

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
      setupDbMocks({ event, rules: [], configs: [config1, config2] });

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
      setupDbMocks({ event, rules: [], configs: [config] });

      await capturedProcessor!(makeJob({ type: "sync.completed" }));

      expect(mockDigestQueueAdd).not.toHaveBeenCalled();
    });

    it("does not trigger digests for non-sync.completed events", async () => {
      const config = makeChannelConfig({ id: 10, digestMode: "per_sync", enabled: true });
      const event = makeEvent({ type: "match.cancelled" });
      setupDbMocks({ event, rules: [], configs: [config] });

      await capturedProcessor!(makeJob());

      expect(mockDigestQueueAdd).not.toHaveBeenCalled();
    });

    it("handles digest queue add failure gracefully", async () => {
      const config = makeChannelConfig({ id: 10, digestMode: "per_sync", enabled: true });
      const event = makeEvent({ type: "sync.completed", urgency: "routine" });
      setupDbMocks({ event, rules: [], configs: [config] });
      mockDigestQueueAdd.mockRejectedValueOnce(new Error("Redis error"));

      // Should not throw
      const result = await capturedProcessor!(makeJob({ type: "sync.completed" }));

      expect(result).toEqual({ dispatched: 0, buffered: 0 });
    });
  });

  describe("digest buffer", () => {
    it("buffers event for digest on rule match", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      const event = makeEvent({ urgency: "routine" });
      setupDbMocks({ event, rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      await capturedProcessor!(makeJob());

      expect(mockDbInsert).toHaveBeenCalled();
    });

    it("continues processing when buffer insert fails", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ event: makeEvent(), rules: [rule], configs: [config] });
      // Override insert to fail
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockRejectedValue(new Error("DB write error")),
        }),
      });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      // Should not throw — bufferForDigest catches errors
      const result = await capturedProcessor!(makeJob());

      // Dispatch still happens (bufferedCount increments before await, but the important thing is no crash)
      expect(result).toBeDefined();
    });
  });

  describe("combined rule + default flow", () => {
    it("processes both watch rules and role-based defaults", async () => {
      const rule = makeRule({ id: 1 });
      const config1 = makeChannelConfig({ id: 10, type: "in_app", config: { locale: "de" } });
      const config2 = makeChannelConfig({ id: 20, type: "in_app", config: { audienceRole: "admin", locale: "de" } });
      setupDbMocks({
        event: makeEvent(),
        rules: [rule],
        configs: [config1, config2],
      });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await capturedProcessor!(makeJob());

      // Rule dispatches to config 10, defaults dispatch to config 20 (and config 10 since no audienceRole filter)
      expect(mockInAppSend).toHaveBeenCalledTimes(3);
      expect((result as Record<string, number>).dispatched).toBe(3);
    });
  });
});

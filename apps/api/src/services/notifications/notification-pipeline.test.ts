import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  watchRules: { enabled: "enabled" },
  channelConfigs: { id: "id", enabled: "enabled" },
  digestBuffer: { eventId: "eventId", channelConfigId: "channelConfigId" },
  userNotificationPreferences: {
    userId: "userId",
    mutedEventTypes: "mutedEventTypes",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ _eq: val })),
  inArray: vi.fn((...args: unknown[]) => ({ _inArray: args })),
}));

const mockEvaluateRule = vi.fn();
vi.mock("./rule-engine", () => ({
  evaluateRule: (...args: unknown[]) => mockEvaluateRule(...args),
}));

const mockGetDefaultNotificationsForEvent = vi.fn();
vi.mock("./role-defaults", () => ({
  getDefaultNotificationsForEvent: (...args: unknown[]) =>
    mockGetDefaultNotificationsForEvent(...args),
}));

const mockRenderEventMessage = vi.fn();
vi.mock("./templates/index", () => ({
  renderEventMessage: (...args: unknown[]) => mockRenderEventMessage(...args),
}));

const mockInAppSend = vi.fn().mockResolvedValue(undefined);
vi.mock("./channels/in-app", () => ({
  InAppChannelAdapter: class {
    send(...args: unknown[]) {
      return mockInAppSend(...args);
    }
  },
}));

vi.mock("../../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// --- Import after mocks ---

import { processEvent, clearCoalesceCache } from "./notification-pipeline";

// --- Helpers ---

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
    deepLinkPath: "/admin/matches/42",
    actor: null,
    syncRunId: null,
    enqueuedAt: new Date(),
    createdAt: new Date(),
    occurredAt: new Date(),
    ...overrides,
  } as never;
}

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    eventTypes: ["match.cancelled"],
    filters: [],
    channels: [{ channel: "in_app", targetId: "10" }],
    urgencyOverride: null,
    enabled: true,
    name: "Test Rule",
    createdBy: "admin",
    templateOverride: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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
    name: "Admin In-App",
    digestCron: null,
    digestTimezone: "Europe/Berlin",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setupDbMocks(opts: {
  rules?: Record<string, unknown>[];
  configs?: Record<string, unknown>[];
}) {
  const rules = opts.rules ?? [];
  const configs = opts.configs ?? [];

  // db.select() is called for rules and configs (via Promise.all)
  let callIndex = 0;
  const callSequence = [rules, configs];

  mockDbSelect.mockImplementation(() => {
    const idx = callIndex++;
    const data = callSequence[idx] ?? [];
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(data),
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

describe("processEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCoalesceCache();
    mockGetDefaultNotificationsForEvent.mockReturnValue([]);
    mockRenderEventMessage.mockReturnValue({
      title: "Match Cancelled",
      body: "The match has been cancelled.",
    });
  });

  describe("no matching rules", () => {
    it("returns zero counts when no rules exist", async () => {
      setupDbMocks({ rules: [], configs: [] });

      const result = await processEvent(makeEvent());

      expect(result).toEqual({ dispatched: 0, buffered: 0, coalesced: 0, muted: 0 });
    });

    it("returns zero counts when rules do not match", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({ matched: false, channels: [], urgencyOverride: null });

      const result = await processEvent(makeEvent());

      expect(result).toEqual({ dispatched: 0, buffered: 0, coalesced: 0, muted: 0 });
      expect(mockInAppSend).not.toHaveBeenCalled();
    });
  });

  describe("rule matching with immediate dispatch", () => {
    it("dispatches via in-app adapter and buffers for digest", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      const result = await processEvent(makeEvent());

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
      expect(result).toEqual({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("uses urgencyOverride from rule when present", async () => {
      const rule = makeRule({ urgencyOverride: "immediate" });
      const config = makeChannelConfig();
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: "immediate",
      });

      const result = await processEvent(makeEvent({ urgency: "routine" }));

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result.dispatched).toBe(1);
    });

    it("renders message with locale from channel config", async () => {
      const config = makeChannelConfig({ config: { locale: "en" } });
      const rule = makeRule();
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      await processEvent(makeEvent());

      expect(mockRenderEventMessage).toHaveBeenCalledWith(
        "match.cancelled",
        { matchId: 42, reason: "weather" },
        "Dragons vs. Tigers",
        "en",
      );
    });
  });

  describe("routine urgency", () => {
    it("only buffers for digest, does not dispatch immediately", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      const result = await processEvent(makeEvent({ urgency: "routine" }));

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(mockDbInsert).toHaveBeenCalled();
      expect(result).toEqual({ dispatched: 0, buffered: 1, coalesced: 0, muted: 0 });
    });
  });

  describe("deduplication", () => {
    it("does not dispatch same channel target twice from same rule", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [
          { channel: "in_app", targetId: "10" },
          { channel: "in_app", targetId: "10" },
        ],
        urgencyOverride: null,
      });

      const result = await processEvent(makeEvent());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("dispatches to different channel targets from different rules", async () => {
      const rule1 = makeRule({ id: 1, channels: [{ channel: "in_app", targetId: "10" }] });
      const rule2 = makeRule({ id: 2, channels: [{ channel: "in_app", targetId: "20" }] });
      const config1 = makeChannelConfig({ id: 10 });
      const config2 = makeChannelConfig({ id: 20 });
      setupDbMocks({ rules: [rule1, rule2], configs: [config1, config2] });
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

      const result = await processEvent(makeEvent());

      expect(mockInAppSend).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ dispatched: 2, buffered: 2, coalesced: 0, muted: 0 });
    });
  });

  describe("channel config lookup", () => {
    it("skips channel targets with no matching config", async () => {
      const rule = makeRule();
      const config = makeChannelConfig({ id: 99 });
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      const result = await processEvent(makeEvent());

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(result).toEqual({ dispatched: 0, buffered: 0, coalesced: 0, muted: 0 });
    });
  });

  describe("role-based defaults", () => {
    it("dispatches admin defaults to matching channel configs", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "admin", locale: "de" } });
      setupDbMocks({ rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(makeEvent());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-1",
          watchRuleId: null,
          channelConfigId: 10,
          recipientId: "audience:admin",
        }),
      );
      expect(result).toEqual({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("dispatches referee defaults with refereeId in recipientId", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      setupDbMocks({ rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId: 77 },
      ]);

      const result = await processEvent(makeEvent());

      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: "referee:77",
        }),
      );
      expect(result).toEqual({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("matches configs without audienceRole to all defaults", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { locale: "de" } });
      setupDbMocks({ rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(makeEvent());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result.dispatched).toBe(1);
    });

    it("filters out configs with non-matching audienceRole", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      setupDbMocks({ rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(makeEvent());

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(result.dispatched).toBe(0);
    });

    it("does not dispatch defaults for routine urgency events", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "admin", locale: "de" } });
      setupDbMocks({ rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(makeEvent({ urgency: "routine" }));

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(mockDbInsert).toHaveBeenCalled();
      expect(result).toEqual({ dispatched: 0, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("deduplicates default dispatches to same config and recipient", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { locale: "de" } });
      setupDbMocks({ rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(makeEvent());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });
  });

  describe("coalescing window", () => {
    it("coalesces rapid-fire immediate events for the same entity", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      // First event dispatches normally
      const result1 = await processEvent(makeEvent());
      expect(result1.dispatched).toBe(1);
      expect(result1.coalesced).toBe(0);

      // Reset mocks for second call, re-setup DB mocks
      vi.clearAllMocks();
      mockRenderEventMessage.mockReturnValue({
        title: "Match Cancelled",
        body: "The match has been cancelled.",
      });
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      // Second event for same entity within coalescing window → coalesced
      const result2 = await processEvent(makeEvent({ id: "evt-2" }));
      expect(result2.dispatched).toBe(0);
      expect(result2.coalesced).toBe(1);
      expect(result2.buffered).toBe(1); // still buffered for digest
    });

    it("does not coalesce events for different entities", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      // First event for entity 42
      await processEvent(makeEvent({ entityId: 42 }));

      // Reset for second call
      vi.clearAllMocks();
      mockRenderEventMessage.mockReturnValue({
        title: "Match Cancelled",
        body: "The match has been cancelled.",
      });
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      // Second event for different entity 99 → dispatches normally
      const result = await processEvent(makeEvent({ id: "evt-2", entityId: 99 }));
      expect(result.dispatched).toBe(1);
      expect(result.coalesced).toBe(0);
    });
  });

  describe("combined rule + default flow", () => {
    it("processes both watch rules and role-based defaults", async () => {
      const rule = makeRule({ id: 1 });
      const config1 = makeChannelConfig({ id: 10, type: "in_app", config: { locale: "de" } });
      const config2 = makeChannelConfig({ id: 20, type: "in_app", config: { audienceRole: "admin", locale: "de" } });
      setupDbMocks({ rules: [rule], configs: [config1, config2] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(makeEvent());

      // Rule dispatches to config 10, defaults dispatch to config 20 (and config 10 since no audienceRole)
      expect(mockInAppSend).toHaveBeenCalledTimes(3);
      expect(result.dispatched).toBe(3);
    });
  });

  describe("digest buffer", () => {
    it("continues processing when buffer insert fails", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ rules: [rule], configs: [config] });
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
      const result = await processEvent(makeEvent());
      expect(result).toBeDefined();
    });
  });
});

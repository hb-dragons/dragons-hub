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

const mockWhatsAppSend = vi.fn().mockResolvedValue({ success: true });
vi.mock("./channels/whatsapp-group", () => ({
  WhatsAppGroupAdapter: class {
    send(...args: unknown[]) {
      return mockWhatsAppSend(...args);
    }
  },
}));

const mockRenderRefereeSlotsWhatsApp = vi.fn().mockReturnValue("*Referee slots message*");
vi.mock("./templates/referee-slots", () => ({
  renderRefereeSlotsWhatsApp: (...args: unknown[]) => mockRenderRefereeSlotsWhatsApp(...args),
}));

vi.mock("../../config/env", () => ({
  env: {
    TRUSTED_ORIGINS: ["http://localhost:3000"],
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
  prefs?: Record<string, unknown>[];
}) {
  const rules = opts.rules ?? [];
  const configs = opts.configs ?? [];
  const prefs = opts.prefs ?? [];

  // db.select() is called for:
  // 1+2: rules and configs (via Promise.all in loadRulesAndConfigs)
  // 3: userNotificationPreferences (in loadMutedEventTypes)
  let callIndex = 0;
  const callSequence = [rules, configs, prefs];

  mockDbSelect.mockImplementation(() => {
    const idx = callIndex++;
    const data = callSequence[idx] ?? [];
    // Some queries use .where() (rules, configs), others don't (prefs).
    // Return a mock that resolves via either path.
    const mockResult = Promise.resolve(data);
    return {
      from: vi.fn().mockReturnValue({
        ...mockResult,
        where: vi.fn().mockResolvedValue(data),
        then: mockResult.then.bind(mockResult),
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

      expect(result).toMatchObject({ dispatched: 0, buffered: 0, coalesced: 0, muted: 0 });
    });

    it("returns zero counts when rules do not match", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({ matched: false, channels: [], urgencyOverride: null });

      const result = await processEvent(makeEvent());

      expect(result).toMatchObject({ dispatched: 0, buffered: 0, coalesced: 0, muted: 0 });
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
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
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
    it("still dispatches in_app channels for routine events", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      const result = await processEvent(makeEvent({ urgency: "routine" }));

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(mockDbInsert).toHaveBeenCalled();
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("does not dispatch external channels for routine events", async () => {
      const rule = makeRule({
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
      });
      const config = makeChannelConfig({ id: 10, type: "whatsapp_group" });
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
        urgencyOverride: null,
      });

      const result = await processEvent(makeEvent({ urgency: "routine" }));

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(mockDbInsert).toHaveBeenCalled();
      expect(result).toMatchObject({ dispatched: 0, buffered: 1, coalesced: 0, muted: 0 });
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
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
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
      expect(result).toMatchObject({ dispatched: 2, buffered: 2, coalesced: 0, muted: 0 });
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
      expect(result).toMatchObject({ dispatched: 0, buffered: 0, coalesced: 0, muted: 0 });
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
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
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
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
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

    it("dispatches in_app defaults even for routine urgency events", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "admin", locale: "de" } });
      setupDbMocks({ rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(makeEvent({ urgency: "routine" }));

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(mockDbInsert).toHaveBeenCalled();
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("does not dispatch external channel defaults for routine urgency events", async () => {
      const config = makeChannelConfig({ id: 10, type: "whatsapp_group", config: { groupId: "grp-1", locale: "de" } });
      setupDbMocks({ rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "whatsapp_group" },
      ]);

      const result = await processEvent(makeEvent({ urgency: "routine" }));

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(mockDbInsert).toHaveBeenCalled();
      expect(result).toMatchObject({ dispatched: 0, buffered: 1, coalesced: 0, muted: 0 });
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
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
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

  describe("defaults coalescing", () => {
    it("coalesces rapid-fire default dispatches for the same entity", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "admin", locale: "de" } });

      // First event — dispatches normally via defaults
      setupDbMocks({ rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);
      const result1 = await processEvent(makeEvent());
      expect(result1.dispatched).toBe(1);
      expect(result1.coalesced).toBe(0);

      // Second event for same entity — should be coalesced
      vi.clearAllMocks();
      mockRenderEventMessage.mockReturnValue({
        title: "Match Cancelled",
        body: "The match has been cancelled.",
      });
      setupDbMocks({ rules: [], configs: [config] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);
      const result2 = await processEvent(makeEvent({ id: "evt-2" }));
      expect(result2.coalesced).toBe(1);
      expect(result2.dispatched).toBe(0);
      expect(result2.buffered).toBe(1);
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

  describe("muted event types", () => {
    it("skips dispatch and buffer for recipients who muted the event type", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      setupDbMocks({
        rules: [],
        configs: [config],
        prefs: [
          { userId: "referee:77", mutedEventTypes: ["match.cancelled"] },
        ],
      });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId: 77 },
      ]);

      const result = await processEvent(makeEvent());

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(result.muted).toBe(1);
      expect(result.dispatched).toBe(0);
      expect(result.buffered).toBe(0);
    });

    it("does not mute when event type is not in muted list", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      setupDbMocks({
        rules: [],
        configs: [config],
        prefs: [
          { userId: "referee:77", mutedEventTypes: ["match.created"] },
        ],
      });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId: 77 },
      ]);

      const result = await processEvent(makeEvent()); // type is match.cancelled, not match.created

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result.muted).toBe(0);
      expect(result.dispatched).toBe(1);
    });

    it("does not apply muting to watch rule matches", async () => {
      const rule = makeRule();
      const config = makeChannelConfig();
      setupDbMocks({
        rules: [rule],
        configs: [config],
        prefs: [
          { userId: "10", mutedEventTypes: ["match.cancelled"] },
        ],
      });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "in_app", targetId: "10" }],
        urgencyOverride: null,
      });

      const result = await processEvent(makeEvent());

      // Watch rules are admin-configured, not subject to user muting
      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result.muted).toBe(0);
    });
  });

  describe("loadMutedEventTypes error handling", () => {
    it("continues processing when preferences query fails", async () => {
      const config = makeChannelConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      const rules: Record<string, unknown>[] = [];
      const configs = [config];

      // Override select to make the prefs query (3rd call) throw
      let callIndex = 0;
      mockDbSelect.mockImplementation(() => {
        const idx = callIndex++;
        if (idx < 2) {
          // rules and configs queries
          const data = idx === 0 ? rules : configs;
          const mockResult = Promise.resolve(data);
          return {
            from: vi.fn().mockReturnValue({
              ...mockResult,
              where: vi.fn().mockResolvedValue(data),
              then: mockResult.then.bind(mockResult),
            }),
          };
        }
        // Prefs query — throw
        const rejected = Promise.reject(new Error("DB error"));
        return {
          from: vi.fn().mockReturnValue({
            ...rejected,
            then: rejected.then.bind(rejected),
            catch: rejected.catch.bind(rejected),
          }),
        };
      });

      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        }),
      });

      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId: 77 },
      ]);

      // Should not throw — loadMutedEventTypes catches errors
      const result = await processEvent(makeEvent());
      expect(result.dispatched).toBe(1);
      expect(result.muted).toBe(0); // no muting applied due to error
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

  describe("configs passthrough", () => {
    it("returns loaded configs in the result for reuse", async () => {
      const config = makeChannelConfig({ id: 10 });
      setupDbMocks({ rules: [], configs: [config] });

      const result = await processEvent(makeEvent());

      expect(result.configs).toHaveLength(1);
      expect(result.configs[0]).toMatchObject({ id: 10 });
    });
  });

  describe("whatsapp group dispatch", () => {
    it("dispatches via whatsapp adapter with valid groupId", async () => {
      const rule = makeRule({
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
      });
      const config = makeChannelConfig({
        id: 10,
        type: "whatsapp_group",
        config: { groupId: "120363@g.us", locale: "de" },
      });
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
        urgencyOverride: "immediate",
      });

      const result = await processEvent(makeEvent());

      expect(mockWhatsAppSend).toHaveBeenCalledTimes(1);
      expect(mockWhatsAppSend).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-1",
          channelConfigId: 10,
        }),
        "120363@g.us",
      );
      expect(result.dispatched).toBe(1);
      expect(result.buffered).toBe(1);
    });

    it("uses rich template for referee.slots.needed events", async () => {
      const rule = makeRule({
        eventTypes: ["referee.slots.needed"],
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
      });
      const config = makeChannelConfig({
        id: 10,
        type: "whatsapp_group",
        config: { groupId: "120363@g.us", locale: "de" },
      });
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
        urgencyOverride: "immediate",
      });

      await processEvent(makeEvent({ type: "referee.slots.needed" }));

      expect(mockRenderRefereeSlotsWhatsApp).toHaveBeenCalled();
      expect(mockWhatsAppSend).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "*Referee slots message*",
        }),
        "120363@g.us",
      );
    });

    it("uses rich template for referee.slots.reminder events", async () => {
      const rule = makeRule({
        eventTypes: ["referee.slots.reminder"],
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
      });
      const config = makeChannelConfig({
        id: 10,
        type: "whatsapp_group",
        config: { groupId: "120363@g.us", locale: "de" },
      });
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
        urgencyOverride: "immediate",
      });

      await processEvent(makeEvent({ type: "referee.slots.reminder" }));

      expect(mockRenderRefereeSlotsWhatsApp).toHaveBeenCalled();
    });

    it("uses generic text for non-slot whatsapp events", async () => {
      const rule = makeRule({
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
      });
      const config = makeChannelConfig({
        id: 10,
        type: "whatsapp_group",
        config: { groupId: "120363@g.us", locale: "de" },
      });
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
        urgencyOverride: "immediate",
      });

      await processEvent(makeEvent({ type: "match.cancelled" }));

      expect(mockRenderRefereeSlotsWhatsApp).not.toHaveBeenCalled();
      expect(mockWhatsAppSend).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("Match Cancelled"),
        }),
        "120363@g.us",
      );
    });

    it("skips dispatch when groupId is missing", async () => {
      const rule = makeRule({
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
      });
      const config = makeChannelConfig({
        id: 10,
        type: "whatsapp_group",
        config: { groupId: "", locale: "de" },
      });
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
        urgencyOverride: "immediate",
      });

      const result = await processEvent(makeEvent());

      expect(mockWhatsAppSend).not.toHaveBeenCalled();
      expect(result.dispatched).toBe(0);
    });

    it("returns false for unknown channel type", async () => {
      const rule = makeRule({
        channels: [{ channel: "sms", targetId: "10" }],
      });
      const config = makeChannelConfig({
        id: 10,
        type: "sms",
        config: { locale: "de" },
      });
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "sms", targetId: "10" }],
        urgencyOverride: "immediate",
      });

      const result = await processEvent(makeEvent());

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(mockWhatsAppSend).not.toHaveBeenCalled();
      expect(result.dispatched).toBe(0);
      expect(result.buffered).toBe(1);
    });

    it("counts failed whatsapp send as not dispatched", async () => {
      mockWhatsAppSend.mockResolvedValueOnce({ success: false, error: "WAHA error" });
      const rule = makeRule({
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
      });
      const config = makeChannelConfig({
        id: 10,
        type: "whatsapp_group",
        config: { groupId: "120363@g.us", locale: "de" },
      });
      setupDbMocks({ rules: [rule], configs: [config] });
      mockEvaluateRule.mockReturnValue({
        matched: true,
        channels: [{ channel: "whatsapp_group", targetId: "10" }],
        urgencyOverride: "immediate",
      });

      const result = await processEvent(makeEvent());

      expect(result.dispatched).toBe(0);
      expect(result.buffered).toBe(1);
    });
  });
});

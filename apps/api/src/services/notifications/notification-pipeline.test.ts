import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are NOT mocked here. Four of this
// pipeline's five DB touches are predicates that decide behaviour:
//   loadRulesAndConfigs      eq(watchRules.enabled,true) / eq(channelConfigs.enabled,true)
//   loadMutedEventTypes      inArray(userNotificationPreferences.userId, lookupIds)
//   resolveLocaleForRecipient eq(userNotificationPreferences.userId, userId)
//   bufferForDigest          insert into digest_buffer ... onConflictDoNothing
// The old fixture stubbed `eq`/`inArray` to identity and handed the four selects
// back canned arrays *by call order*, so a disabled rule still fired, another
// user's mute still muted, and `expect(mockDbInsert).toHaveBeenCalled()` said
// nothing about what was buffered. The DB is therefore a real (PGlite,
// in-process) Postgres, and digest buffering is asserted on the rows that land.
//
// Redis stays mocked, but backed by a real in-memory key store so SET NX / DEL
// behave like Redis across several processEvent calls — the shared dev Redis is
// used by concurrent runs and must not be written to. The channel adapters and
// the rule/template engines stay mocked: they are separately tested units and
// this file is about the pipeline's own decisions.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
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

const mockInAppSend = vi.fn().mockResolvedValue({ success: true });
vi.mock("./channels/in-app", () => ({
  InAppChannelAdapter: class {
    send(...args: unknown[]) {
      return mockInAppSend(...args);
    }
  },
}));

const mockPushSend = vi.fn().mockResolvedValue({ success: true });
vi.mock("./channels/push", () => ({
  PushChannelAdapter: class {
    send(...args: unknown[]) {
      return mockPushSend(...args);
    }
  },
}));

const mockEmailSend = vi.fn().mockResolvedValue({ success: true });
vi.mock("./channels/email", () => ({
  EmailChannelAdapter: class {
    send(...args: unknown[]) {
      return mockEmailSend(...args);
    }
  },
}));

vi.mock("./expo-push.client", () => ({
  ExpoPushClient: class {
    constructor() {}
  },
}));

const mockResolveRecipientUserIds = vi.fn().mockResolvedValue([]);
vi.mock("./recipient-resolver", () => ({
  resolveRecipientUserIds: (...args: unknown[]) => mockResolveRecipientUserIds(...args),
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

const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn().mockResolvedValue(1);
vi.mock("../../config/redis", () => ({
  getRedis: () => ({
    set: (...args: unknown[]) => mockRedisSet(...args),
    del: (...args: unknown[]) => mockRedisDel(...args),
  }),
}));

// --- Import after mocks ---

import { processEvent, DISPATCHABLE_CHANNEL_TYPES } from "./notification-pipeline";
import { logger } from "../../config/logger";
import { domainEvents, type DomainEventRow } from "@dragons/db/schema";
import { CHANNEL_TYPES } from "@dragons/shared";
import type { EventUrgency } from "@dragons/shared";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  dbHolder.ref = ctx.db;
  useFakeRedisStore();
  mockGetDefaultNotificationsForEvent.mockReturnValue([]);
  mockEvaluateRule.mockReturnValue({ matched: false, channels: [], urgencyOverride: null });
  mockRenderEventMessage.mockReturnValue({
    title: "Match Cancelled",
    body: "The match has been cancelled.",
  });
  mockInAppSend.mockResolvedValue({ success: true });
  mockPushSend.mockResolvedValue({ success: true });
  mockEmailSend.mockResolvedValue({ success: true });
  mockWhatsAppSend.mockResolvedValue({ success: true });
  mockRenderRefereeSlotsWhatsApp.mockReturnValue("*Referee slots message*");
  mockResolveRecipientUserIds.mockResolvedValue([]);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

/**
 * Back the Redis mock with a real in-memory key store so SET NX / DEL behave
 * like Redis across several processEvent calls. Without this a test cannot tell
 * "second attempt at the same event" apart from "second distinct event".
 */
function useFakeRedisStore(): Map<string, string> {
  const store = new Map<string, string>();
  mockRedisSet.mockImplementation((key: string, value: string) => {
    if (store.has(key)) return Promise.resolve(null);
    store.set(key, value);
    return Promise.resolve("OK");
  });
  mockRedisDel.mockImplementation((key: string) =>
    Promise.resolve(store.delete(key) ? 1 : 0),
  );
  return store;
}

interface EventInput {
  id?: string;
  type?: string;
  urgency?: EventUrgency;
  payload?: Record<string, unknown>;
  source?: string;
  entityName?: string;
  entityType?: string;
  entityId?: number;
  deepLinkPath?: string;
}

function eventValues(overrides: EventInput = {}) {
  return {
    id: overrides.id ?? "evt-1",
    type: overrides.type ?? "match.cancelled",
    source: overrides.source ?? "sync",
    urgency: overrides.urgency ?? "immediate",
    occurredAt: new Date("2026-03-15T10:00:00Z"),
    entityType: overrides.entityType ?? "match",
    entityId: overrides.entityId ?? 42,
    entityName: overrides.entityName ?? "Dragons vs. Tigers",
    deepLinkPath: overrides.deepLinkPath ?? "/admin/matches/42",
    payload: overrides.payload ?? { matchId: 42, reason: "weather" },
  };
}

/** Persist a domain event and hand back the row exactly as the worker loads it. */
async function seedEvent(overrides: EventInput = {}): Promise<DomainEventRow> {
  const [row] = await ctx.db.insert(domainEvents).values(eventValues(overrides)).returning();
  return row!;
}

/** Build an event row that is deliberately NOT persisted (digest FK will fail). */
function unpersistedEvent(overrides: EventInput = {}): DomainEventRow {
  return {
    ...eventValues(overrides),
    actor: null,
    syncRunId: null,
    enqueuedAt: null,
    processedAt: null,
    createdAt: new Date(),
  } as DomainEventRow;
}

interface RuleInput {
  id?: number;
  enabled?: boolean;
  eventTypes?: string[];
  channels?: { channel: string; targetId: string }[];
  urgencyOverride?: string | null;
}

async function seedRule(input: RuleInput = {}): Promise<number> {
  const id = input.id ?? 1;
  await ctx.client.query(
    `INSERT INTO watch_rules (id, name, enabled, created_by, event_types, filters, channels, urgency_override)
     VALUES ($1, $2, $3, 'admin', $4, '[]'::jsonb, $5::jsonb, $6)`,
    [
      id,
      `Rule ${id}`,
      input.enabled ?? true,
      input.eventTypes ?? ["match.cancelled"],
      JSON.stringify(input.channels ?? [{ channel: "in_app", targetId: "10" }]),
      input.urgencyOverride ?? null,
    ],
  );
  return id;
}

interface ConfigInput {
  id?: number;
  type?: string;
  enabled?: boolean;
  digestMode?: string;
  config?: Record<string, unknown>;
}

async function seedConfig(input: ConfigInput = {}): Promise<number> {
  const id = input.id ?? 10;
  await ctx.client.query(
    `INSERT INTO channel_configs (id, name, type, enabled, config, digest_mode)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      id,
      `Config ${id}`,
      input.type ?? "in_app",
      input.enabled ?? true,
      JSON.stringify(input.config ?? { locale: "de" }),
      input.digestMode ?? "per_sync",
    ],
  );
  return id;
}

async function seedPref(
  userId: string,
  opts: { mutedEventTypes?: string[]; locale?: string } = {},
): Promise<void> {
  await ctx.client.query(
    `INSERT INTO user_notification_preferences (user_id, muted_event_types, locale)
     VALUES ($1, $2, $3)`,
    [userId, opts.mutedEventTypes ?? [], opts.locale ?? "de"],
  );
}

let nextRefereeApiId = 9000;

async function seedReferee(apiId: number = nextRefereeApiId++): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO referees (api_id, first_name) VALUES ($1, 'Ref') RETURNING id`,
    [apiId],
  );
  return r.rows[0]!.id;
}

async function seedUser(id: string, opts: { refereeId?: number } = {}): Promise<void> {
  await ctx.client.query(
    `INSERT INTO "user" (id, name, email, email_verified, referee_id, created_at, updated_at)
     VALUES ($1, $1, $2, true, $3, now(), now())`,
    [id, `${id}@test.de`, opts.refereeId ?? null],
  );
}

/**
 * A referee identity with the account that carries it, and that account's mute
 * list. Returns the referee id the pipeline addresses as `referee:<id>`.
 */
async function seedRefereeWithAccount(
  userId: string,
  opts: { apiId?: number; mutedEventTypes?: string[] } = {},
): Promise<number> {
  const refereeId = await seedReferee(opts.apiId);
  await seedUser(userId, { refereeId });
  if (opts.mutedEventTypes) {
    await seedPref(userId, { mutedEventTypes: opts.mutedEventTypes });
  }
  return refereeId;
}

async function digestBufferRows(): Promise<{ event_id: string; channel_config_id: number }[]> {
  const r = await ctx.client.query<{ event_id: string; channel_config_id: number }>(
    `SELECT event_id, channel_config_id FROM digest_buffer ORDER BY id`,
  );
  return r.rows;
}

function ruleMatches(channels: { channel: string; targetId: string }[], urgencyOverride: string | null = null) {
  mockEvaluateRule.mockReturnValue({ matched: true, channels, urgencyOverride });
}

// --- Tests ---

describe("processEvent", () => {
  describe("no matching rules", () => {
    it("returns zero counts when no rules exist", async () => {
      const result = await processEvent(await seedEvent());

      expect(result).toMatchObject({ dispatched: 0, buffered: 0, coalesced: 0, muted: 0 });
      expect(await digestBufferRows()).toEqual([]);
    });

    it("returns zero counts when rules do not match", async () => {
      await seedRule();
      await seedConfig();
      mockEvaluateRule.mockReturnValue({ matched: false, channels: [], urgencyOverride: null });

      const result = await processEvent(await seedEvent());

      expect(result).toMatchObject({ dispatched: 0, buffered: 0, coalesced: 0, muted: 0 });
      expect(mockInAppSend).not.toHaveBeenCalled();
    });
  });

  describe("loading rules and configs", () => {
    it("never evaluates a disabled watch rule", async () => {
      await seedRule({ id: 1, enabled: false });
      await seedConfig({ id: 10 });
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      const result = await processEvent(await seedEvent());

      expect(mockEvaluateRule).not.toHaveBeenCalled();
      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(result).toMatchObject({ dispatched: 0, buffered: 0 });
    });

    it("evaluates only the enabled rules when both exist", async () => {
      await seedRule({ id: 1, enabled: false });
      await seedRule({ id: 2, enabled: true });
      await seedConfig({ id: 10 });
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      const result = await processEvent(await seedEvent());

      expect(mockEvaluateRule).toHaveBeenCalledTimes(1);
      expect(result.dispatched).toBe(1);
      // The dispatch is attributed to the enabled rule, not the disabled one.
      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({ watchRuleId: 2 }),
      );
    });

    it("does not load a disabled channel config", async () => {
      await seedRule({ id: 1 });
      await seedConfig({ id: 10, enabled: false });
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      const result = await processEvent(await seedEvent());

      // The rule's channel target resolves to nothing, so nothing is buffered.
      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(result).toMatchObject({ dispatched: 0, buffered: 0 });
      expect(result.configs).toEqual([]);
    });
  });

  describe("rule matching with immediate dispatch", () => {
    it("dispatches via in-app adapter using the config's audience as recipientId, not the config id", async () => {
      await seedRule();
      await seedConfig({ config: { audienceRole: "admin", locale: "de" } });
      ruleMatches([{ channel: "in_app", targetId: "10" }]);
      const event = await seedEvent();

      const result = await processEvent(event);

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-1",
          watchRuleId: 1,
          channelConfigId: 10,
          // must be an inbox-addressable recipient, NOT the bare config id "10"
          recipientId: "audience:admin",
          title: "Match Cancelled",
          body: "The match has been cancelled.",
          locale: "de",
        }),
      );
      expect(await digestBufferRows()).toEqual([
        { event_id: "evt-1", channel_config_id: 10 },
      ]);
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("routes a referee-audience in_app config to audience:referee", async () => {
      await seedRule();
      await seedConfig({ config: { audienceRole: "referee", locale: "de" } });
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      await processEvent(await seedEvent());

      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: "audience:referee" }),
      );
    });

    it("uses urgencyOverride from rule when present", async () => {
      await seedRule({ urgencyOverride: "immediate" });
      await seedConfig();
      ruleMatches([{ channel: "in_app", targetId: "10" }], "immediate");

      const result = await processEvent(await seedEvent({ urgency: "routine" }));

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result.dispatched).toBe(1);
    });

    it("renders message with locale from channel config", async () => {
      await seedRule();
      await seedConfig({ config: { locale: "en" } });
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      await processEvent(await seedEvent());

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
      await seedRule();
      await seedConfig();
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      const result = await processEvent(await seedEvent({ urgency: "routine" }));

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(await digestBufferRows()).toHaveLength(1);
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("buffers but does not dispatch external channels for routine events", async () => {
      await seedRule({ channels: [{ channel: "whatsapp_group", targetId: "10" }] });
      await seedConfig({ id: 10, type: "whatsapp_group" });
      ruleMatches([{ channel: "whatsapp_group", targetId: "10" }]);

      const result = await processEvent(await seedEvent({ urgency: "routine" }));

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(mockWhatsAppSend).not.toHaveBeenCalled();
      expect(await digestBufferRows()).toEqual([
        { event_id: "evt-1", channel_config_id: 10 },
      ]);
      expect(result).toMatchObject({ dispatched: 0, buffered: 1, coalesced: 0, muted: 0 });
    });
  });

  describe("deduplication", () => {
    it("does not dispatch same channel target twice from same rule", async () => {
      await seedRule();
      await seedConfig();
      ruleMatches([
        { channel: "in_app", targetId: "10" },
        { channel: "in_app", targetId: "10" },
      ]);

      const result = await processEvent(await seedEvent());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(await digestBufferRows()).toHaveLength(1);
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("dispatches to different channel targets from different rules", async () => {
      await seedRule({ id: 1, channels: [{ channel: "in_app", targetId: "10" }] });
      await seedRule({ id: 2, channels: [{ channel: "in_app", targetId: "20" }] });
      await seedConfig({ id: 10 });
      await seedConfig({ id: 20 });
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

      const result = await processEvent(await seedEvent());

      expect(mockInAppSend).toHaveBeenCalledTimes(2);
      expect(await digestBufferRows()).toEqual([
        { event_id: "evt-1", channel_config_id: 10 },
        { event_id: "evt-1", channel_config_id: 20 },
      ]);
      expect(result).toMatchObject({ dispatched: 2, buffered: 2, coalesced: 0, muted: 0 });
    });
  });

  describe("channel config lookup", () => {
    it("skips channel targets with no matching config", async () => {
      await seedRule();
      await seedConfig({ id: 99 });
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      const result = await processEvent(await seedEvent());

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(await digestBufferRows()).toEqual([]);
      expect(result).toMatchObject({ dispatched: 0, buffered: 0, coalesced: 0, muted: 0 });
    });
  });

  describe("role-based defaults", () => {
    it("dispatches admin defaults to matching channel configs", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { audienceRole: "admin", locale: "de" } });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(await seedEvent());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-1",
          watchRuleId: null,
          channelConfigId: 10,
          recipientId: "audience:admin",
        }),
      );
      expect(await digestBufferRows()).toEqual([
        { event_id: "evt-1", channel_config_id: 10 },
      ]);
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("dispatches referee defaults with refereeId in recipientId", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId: 77 },
      ]);

      const result = await processEvent(await seedEvent());

      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: "referee:77" }),
      );
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("matches configs without audienceRole to all defaults", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { locale: "de" } });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(await seedEvent());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result.dispatched).toBe(1);
    });

    it("filters out configs with non-matching audienceRole", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(await seedEvent());

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(result.dispatched).toBe(0);
    });

    it("dispatches in_app defaults even for routine urgency events", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { audienceRole: "admin", locale: "de" } });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(await seedEvent({ urgency: "routine" }));

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(await digestBufferRows()).toHaveLength(1);
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("does not dispatch external channel defaults for routine urgency events", async () => {
      await seedConfig({
        id: 10,
        type: "whatsapp_group",
        config: { groupId: "grp-1", locale: "de" },
      });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "whatsapp_group" },
      ]);

      const result = await processEvent(await seedEvent({ urgency: "routine" }));

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(await digestBufferRows()).toHaveLength(1);
      expect(result).toMatchObject({ dispatched: 0, buffered: 1, coalesced: 0, muted: 0 });
    });

    it("deduplicates default dispatches to same config and recipient", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { locale: "de" } });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(await seedEvent());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(await digestBufferRows()).toHaveLength(1);
      expect(result).toMatchObject({ dispatched: 1, buffered: 1, coalesced: 0, muted: 0 });
    });
  });

  describe("coalescing window (Redis SET NX)", () => {
    it("coalesces a second distinct event for the same entity inside the window", async () => {
      await seedRule();
      await seedConfig();
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      const result1 = await processEvent(await seedEvent({ id: "evt-1" }));
      expect(result1.dispatched).toBe(1);
      expect(result1.coalesced).toBe(0);

      const result2 = await processEvent(await seedEvent({ id: "evt-2" }));
      expect(result2.dispatched).toBe(0);
      expect(result2.coalesced).toBe(1);
      expect(result2.buffered).toBe(1); // still buffered for digest
      expect(await digestBufferRows()).toEqual([
        { event_id: "evt-1", channel_config_id: 10 },
        { event_id: "evt-2", channel_config_id: 10 },
      ]);
    });

    it("does not coalesce events for different entities (different Redis keys)", async () => {
      await seedRule();
      await seedConfig();
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      await processEvent(await seedEvent({ id: "evt-1", entityId: 42 }));
      const result = await processEvent(await seedEvent({ id: "evt-2", entityId: 99 }));

      expect(result.dispatched).toBe(1);
      expect(result.coalesced).toBe(0);
    });

    it("uses the correct Redis key and 60-second TTL with NX flag", async () => {
      await seedRule();
      await seedConfig();
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      await processEvent(await seedEvent({ entityType: "match", entityId: 42 }));

      // Key carries the dispatch target (rule + channel + config) so one
      // channel's failure cannot suppress the others' retry (#99).
      expect(mockRedisSet).toHaveBeenCalledWith(
        "coalesce:match.cancelled:match:42:rule:1:in_app:10",
        "1",
        "EX",
        60,
        "NX",
      );
    });

    it("embeds event.type in the coalesce key so different event types on one entity don't collide (#61)", async () => {
      await seedRule();
      await seedConfig();
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      await processEvent(
        await seedEvent({ type: "match.venue.changed", entityType: "match", entityId: 42 }),
      );

      // Key must include the event type — otherwise a second, distinct event on
      // the same entity within the window collides and is dropped.
      expect(mockRedisSet).toHaveBeenCalledWith(
        "coalesce:match.venue.changed:match:42:rule:1:in_app:10",
        "1",
        "EX",
        60,
        "NX",
      );
    });

    it("releases the coalesce key when claim was OK but nothing was dispatched", async () => {
      // Adapter returns failure so dispatched stays 0, but we claimed the key.
      // The key must be released so retries are not wrongly suppressed.
      mockWhatsAppSend.mockResolvedValueOnce({ success: false, error: "WAHA down" });
      await seedRule({ channels: [{ channel: "whatsapp_group", targetId: "10" }] });
      await seedConfig({
        id: 10,
        type: "whatsapp_group",
        config: { groupId: "120363@g.us", locale: "de" },
      });
      ruleMatches([{ channel: "whatsapp_group", targetId: "10" }], "immediate");

      const result = await processEvent(
        await seedEvent({ entityType: "match", entityId: 42 }),
      );

      expect(result.dispatched).toBe(0);
      expect(mockRedisDel).toHaveBeenCalledWith(
        "coalesce:match.cancelled:match:42:rule:1:whatsapp_group:10",
      );
    });

    it("does not release the coalesce key when at least one dispatch succeeded", async () => {
      await seedRule();
      await seedConfig();
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      const result = await processEvent(
        await seedEvent({ entityType: "match", entityId: 42 }),
      );

      expect(result.dispatched).toBe(1);
      expect(mockRedisDel).not.toHaveBeenCalled();
    });
  });

  describe("defaults coalescing (Redis SET NX)", () => {
    it("coalesces rapid-fire default dispatches for the same entity", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { audienceRole: "admin", locale: "de" } });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result1 = await processEvent(await seedEvent({ id: "evt-1" }));
      expect(result1.dispatched).toBe(1);
      expect(result1.coalesced).toBe(0);

      const result2 = await processEvent(await seedEvent({ id: "evt-2" }));
      expect(result2.coalesced).toBe(1);
      expect(result2.dispatched).toBe(0);
      expect(result2.buffered).toBe(1);
    });
  });

  describe("mid-pipeline throw + retry inside the coalesce window (#99)", () => {
    /** One admin recipient reachable on two channels: in_app (10) and push (20). */
    async function setupTwoChannelDefaults() {
      await seedConfig({
        id: 10,
        type: "in_app",
        config: { audienceRole: "admin", locale: "de" },
      });
      await seedConfig({
        id: 20,
        type: "push",
        config: { audienceRole: "admin", locale: "de" },
      });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
        { audience: "admin", channel: "push" },
      ]);
      mockResolveRecipientUserIds.mockResolvedValue(["user-abc"]);
    }

    it("re-delivers the channel whose dispatch threw when the job is retried inside the window", async () => {
      await setupTwoChannelDefaults();
      const event = await seedEvent();

      // Attempt 1: in-app lands, then the push branch throws (a DB blip).
      mockPushSend.mockRejectedValueOnce(new Error("db blip"));
      await expect(processEvent(event)).rejects.toThrow("db blip");
      expect(mockInAppSend).toHaveBeenCalledTimes(1);

      // Attempt 2: BullMQ retries the same event 5s later — still inside the
      // 60s window. The push notification must actually go out this time.
      const result = await processEvent(event);

      expect(mockPushSend).toHaveBeenCalledTimes(2);
      expect(result.dispatched).toBe(1);
      // The in-app that already landed stays claimed and is not sent twice.
      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result.coalesced).toBe(1);
    });

    it("still coalesces a genuine duplicate event inside the window", async () => {
      await setupTwoChannelDefaults();

      const first = await processEvent(await seedEvent({ id: "evt-1" }));
      expect(first.dispatched).toBe(2);
      expect(first.coalesced).toBe(0);

      // A second, distinct domain event for the same type + entity arrives
      // inside the window: nothing may be delivered again.
      const second = await processEvent(await seedEvent({ id: "evt-2" }));

      expect(second.dispatched).toBe(0);
      expect(second.coalesced).toBe(2);
      expect(second.buffered).toBe(2);
      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(mockPushSend).toHaveBeenCalledTimes(1);
      // Both events still reach the digest.
      expect(await digestBufferRows()).toEqual([
        { event_id: "evt-1", channel_config_id: 10 },
        { event_id: "evt-1", channel_config_id: 20 },
        { event_id: "evt-2", channel_config_id: 10 },
        { event_id: "evt-2", channel_config_id: 20 },
      ]);
    });

    it("releases the coalesce claim of the target whose dispatch threw", async () => {
      await setupTwoChannelDefaults();
      mockPushSend.mockRejectedValueOnce(new Error("db blip"));

      await expect(processEvent(await seedEvent())).rejects.toThrow("db blip");

      expect(mockRedisDel).toHaveBeenCalledWith(
        "coalesce:match.cancelled:match:42:default:20:audience:admin",
      );
      // ...while the target that was delivered keeps its claim.
      expect(mockRedisDel).not.toHaveBeenCalledWith(
        "coalesce:match.cancelled:match:42:default:10:audience:admin",
      );
    });

    it("propagates the dispatch error (so the worker never stamps processed_at) even if releasing the claim fails", async () => {
      await setupTwoChannelDefaults();
      mockPushSend.mockRejectedValueOnce(new Error("db blip"));
      mockRedisDel.mockImplementation(() => Promise.reject(new Error("redis down")));

      await expect(processEvent(await seedEvent())).rejects.toThrow("db blip");
    });
  });

  describe("combined rule + default flow", () => {
    it("processes both watch rules and role-based defaults", async () => {
      await seedRule({ id: 1 });
      await seedConfig({ id: 10, type: "in_app", config: { locale: "de" } });
      await seedConfig({ id: 20, type: "in_app", config: { audienceRole: "admin", locale: "de" } });
      ruleMatches([{ channel: "in_app", targetId: "10" }]);
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      const result = await processEvent(await seedEvent());

      // Rule dispatches to config 10, defaults dispatch to config 20 (and config 10 since no audienceRole)
      expect(mockInAppSend).toHaveBeenCalledTimes(3);
      expect(result.dispatched).toBe(3);
      // digest_buffer is unique on (event, channel) — config 10 is buffered once
      // by the rule and once by the default, and the second is swallowed.
      expect(await digestBufferRows()).toEqual([
        { event_id: "evt-1", channel_config_id: 10 },
        { event_id: "evt-1", channel_config_id: 20 },
      ]);
      expect(result.buffered).toBe(3);
    });
  });

  describe("muted event types", () => {
    it("mutes a referee: recipient whose account muted the event type (#79)", async () => {
      // The mute lives on the *account*, keyed by the bare user id — that is the
      // only keying the preferences UI can write. Resolving `referee:<id>`
      // through user.referee_id is what connects the two; keying the mute map by
      // the literal "referee:<id>" silently delivered anyway.
      await seedConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      const refereeId = await seedRefereeWithAccount("u_whistle", {
        mutedEventTypes: ["match.cancelled"],
      });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId },
      ]);

      const result = await processEvent(await seedEvent());

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(await digestBufferRows()).toEqual([]);
      expect(result.muted).toBe(1);
      expect(result.dispatched).toBe(0);
      expect(result.buffered).toBe(0);
    });

    it("does not mute when event type is not in muted list", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      const refereeId = await seedRefereeWithAccount("u_whistle", {
        mutedEventTypes: ["match.created"],
      });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId },
      ]);

      const result = await processEvent(await seedEvent()); // type is match.cancelled

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result.muted).toBe(0);
      expect(result.dispatched).toBe(1);
    });

    it("does not mute a referee identity that no account is linked to", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      const refereeId = await seedReferee();
      // A preference row keyed by the referee id itself is not a preference of
      // anyone's — no UI writes one, and it must not silence the referee.
      await seedPref(String(refereeId), { mutedEventTypes: ["match.cancelled"] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId },
      ]);

      const result = await processEvent(await seedEvent());

      expect(result.muted).toBe(0);
      expect(result.dispatched).toBe(1);
    });

    it("does not apply muting to watch rule matches", async () => {
      await seedRule();
      await seedConfig();
      await seedPref("10", { mutedEventTypes: ["match.cancelled"] });
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      const result = await processEvent(await seedEvent());

      // Watch rules are admin-configured, not subject to user muting
      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result.muted).toBe(0);
    });

    it("applies only the addressed recipient's mute, not another referee's (#72)", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      // Another referee muted this event type. If the prefs load is not
      // constrained to the resolved recipient ids, this row silences the
      // addressed referee too.
      await seedRefereeWithAccount("u_other", { mutedEventTypes: ["match.cancelled"] });
      const refereeId = await seedRefereeWithAccount("u_whistle", {
        mutedEventTypes: ["match.created"],
      });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId },
      ]);

      const result = await processEvent(await seedEvent());

      expect(result.muted).toBe(0);
      expect(result.dispatched).toBe(1);
    });

    it("mutes a user: recipient whose preference row is keyed by the bare user id", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { locale: "de" } });
      // The stored user_id for a user recipient has no "user:" prefix.
      await seedPref("user-carl", { mutedEventTypes: ["task.assigned"] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "user", channel: "in_app", userId: "user-carl" },
      ]);

      const result = await processEvent(
        await seedEvent({ type: "task.assigned", entityType: "task", entityId: 1, entityName: "T" }),
      );

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(result.muted).toBe(1);
    });
  });

  describe("loadMutedEventTypes error handling", () => {
    it("fails closed when the preferences query fails, dispatching nothing (#79)", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      const refereeId = await seedRefereeWithAccount("u_whistle", {
        mutedEventTypes: ["match.cancelled"],
      });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId },
      ]);
      const event = await seedEvent();

      // Take the preferences table away so the query throws for real. Swallowing
      // it would deliver to a recipient who muted this exact event type, which
      // cannot be undone; throwing leaves the event retriable instead.
      await ctx.client.exec(
        `ALTER TABLE user_notification_preferences RENAME TO unp_hidden`,
      );
      try {
        await expect(processEvent(event)).rejects.toThrow();
      } finally {
        await ctx.client.exec(
          `ALTER TABLE unp_hidden RENAME TO user_notification_preferences`,
        );
      }

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(await digestBufferRows()).toEqual([]);
    });

    it("logs the failure at warn, not debug (#79)", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      const refereeId = await seedRefereeWithAccount("u_whistle");
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId },
      ]);
      const event = await seedEvent();

      await ctx.client.exec(
        `ALTER TABLE user_notification_preferences RENAME TO unp_hidden`,
      );
      try {
        await expect(processEvent(event)).rejects.toThrow();
      } finally {
        await ctx.client.exec(
          `ALTER TABLE unp_hidden RENAME TO user_notification_preferences`,
        );
      }

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ recipientCount: 1 }),
        expect.stringContaining("Could not load muted event types"),
      );
      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  describe("digest buffer", () => {
    it("does not buffer for a channel whose digestMode is none (#79)", async () => {
      await seedRule();
      await seedConfig({ id: 10, digestMode: "none" });
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      const result = await processEvent(await seedEvent());

      // Nothing drains a none-mode channel's buffer, so a row here would sit
      // until the 365-day domain-event cleanup.
      expect(await digestBufferRows()).toEqual([]);
      expect(result.buffered).toBe(0);
      // Delivery is unaffected.
      expect(result.dispatched).toBe(1);
    });

    it("does not buffer a role-default match for a none-mode channel (#79)", async () => {
      await seedConfig({
        id: 10,
        type: "in_app",
        digestMode: "none",
        config: { audienceRole: "referee", locale: "de" },
      });
      const refereeId = await seedRefereeWithAccount("u_whistle");
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId },
      ]);

      const result = await processEvent(await seedEvent());

      expect(await digestBufferRows()).toEqual([]);
      expect(result.buffered).toBe(0);
      expect(result.dispatched).toBe(1);
    });

    it("still buffers for scheduled and per_sync channels", async () => {
      await seedRule({ id: 1, channels: [{ channel: "in_app", targetId: "10" }] });
      await seedConfig({ id: 10, digestMode: "scheduled" });
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      const result = await processEvent(await seedEvent());

      expect(await digestBufferRows()).toEqual([
        { event_id: "evt-1", channel_config_id: 10 },
      ]);
      expect(result.buffered).toBe(1);
    });

    it("continues processing when the buffer insert fails", async () => {
      await seedRule();
      await seedConfig();
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      // The event was never persisted, so digest_buffer's FK to domain_events
      // rejects the insert. bufferForDigest must catch it and dispatch anyway.
      const result = await processEvent(unpersistedEvent());

      expect(await digestBufferRows()).toEqual([]);
      expect(result.dispatched).toBe(1);
      expect(result.buffered).toBe(1);
    });

    it("does not double-buffer the same (event, channel) pair", async () => {
      await seedRule({ id: 1, channels: [{ channel: "in_app", targetId: "10" }] });
      await seedRule({ id: 2, channels: [{ channel: "in_app", targetId: "10" }] });
      await seedConfig({ id: 10 });
      ruleMatches([{ channel: "in_app", targetId: "10" }]);

      await processEvent(await seedEvent());

      expect(await digestBufferRows()).toEqual([
        { event_id: "evt-1", channel_config_id: 10 },
      ]);
    });
  });

  describe("configs passthrough", () => {
    it("returns loaded configs in the result for reuse", async () => {
      await seedConfig({ id: 10 });

      const result = await processEvent(await seedEvent());

      expect(result.configs).toHaveLength(1);
      expect(result.configs[0]).toMatchObject({ id: 10, type: "in_app", enabled: true });
    });
  });

  describe("whatsapp group dispatch", () => {
    async function setupWhatsApp(configOverrides: Record<string, unknown> = {}) {
      await seedRule({ channels: [{ channel: "whatsapp_group", targetId: "10" }] });
      await seedConfig({
        id: 10,
        type: "whatsapp_group",
        config: { groupId: "120363@g.us", locale: "de", ...configOverrides },
      });
      ruleMatches([{ channel: "whatsapp_group", targetId: "10" }], "immediate");
    }

    it("dispatches via whatsapp adapter with valid groupId", async () => {
      await setupWhatsApp();

      const result = await processEvent(await seedEvent());

      expect(mockWhatsAppSend).toHaveBeenCalledTimes(1);
      expect(mockWhatsAppSend).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-1",
          channelConfigId: 10,
          // group-delivered channels (no audienceRole) get a non-user label,
          // never the bare config id
          recipientId: "channel:10",
        }),
        "120363@g.us",
      );
      expect(result.dispatched).toBe(1);
      expect(result.buffered).toBe(1);
    });

    it("uses rich template for referee.slots.needed events", async () => {
      await setupWhatsApp();

      await processEvent(await seedEvent({ type: "referee.slots.needed" }));

      expect(mockRenderRefereeSlotsWhatsApp).toHaveBeenCalled();
      expect(mockWhatsAppSend).toHaveBeenCalledWith(
        expect.objectContaining({ body: "*Referee slots message*" }),
        "120363@g.us",
      );
    });

    it("uses rich template for referee.slots.reminder events", async () => {
      await setupWhatsApp();

      await processEvent(await seedEvent({ type: "referee.slots.reminder" }));

      expect(mockRenderRefereeSlotsWhatsApp).toHaveBeenCalled();
    });

    it("uses generic text for non-slot whatsapp events", async () => {
      await setupWhatsApp();

      await processEvent(await seedEvent({ type: "match.cancelled" }));

      expect(mockRenderRefereeSlotsWhatsApp).not.toHaveBeenCalled();
      expect(mockWhatsAppSend).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining("Match Cancelled") }),
        "120363@g.us",
      );
    });

    it("skips dispatch when groupId is missing", async () => {
      await setupWhatsApp({ groupId: "" });

      const result = await processEvent(await seedEvent());

      expect(mockWhatsAppSend).not.toHaveBeenCalled();
      expect(result.dispatched).toBe(0);
      // Still buffered — the digest is the fallback delivery path.
      expect(await digestBufferRows()).toHaveLength(1);
    });

    it("returns false for unknown channel type", async () => {
      await seedRule({ channels: [{ channel: "sms", targetId: "10" }] });
      await seedConfig({ id: 10, type: "sms", config: { locale: "de" } });
      ruleMatches([{ channel: "sms", targetId: "10" }], "immediate");

      const result = await processEvent(await seedEvent());

      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(mockWhatsAppSend).not.toHaveBeenCalled();
      expect(result.dispatched).toBe(0);
      expect(result.buffered).toBe(1);
    });

    it("counts failed whatsapp send as not dispatched", async () => {
      mockWhatsAppSend.mockResolvedValueOnce({ success: false, error: "WAHA error" });
      await setupWhatsApp();

      const result = await processEvent(await seedEvent());

      expect(result.dispatched).toBe(0);
      expect(result.buffered).toBe(1);
    });
  });

  describe("push channel dispatch", () => {
    async function setupPush() {
      await seedRule({ channels: [{ channel: "push", targetId: "10" }] });
      await seedConfig({ id: 10, type: "push", config: { locale: "de" } });
      ruleMatches([{ channel: "push", targetId: "10" }], "immediate");
    }

    it("dispatches via push adapter when channelType is push and userIds are resolved", async () => {
      await setupPush();
      mockResolveRecipientUserIds.mockResolvedValueOnce(["user-abc"]);

      const result = await processEvent(await seedEvent());

      expect(mockPushSend).toHaveBeenCalledTimes(1);
      expect(mockPushSend).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-1",
          channelConfigId: 10,
          recipientUserIds: ["user-abc"],
        }),
      );
      expect(result.dispatched).toBe(1);
    });

    it("skips push dispatch when resolveRecipientUserIds returns empty list", async () => {
      await setupPush();
      mockResolveRecipientUserIds.mockResolvedValueOnce([]);

      const result = await processEvent(await seedEvent());

      expect(mockPushSend).not.toHaveBeenCalled();
      expect(result.dispatched).toBe(0);
    });

    it("counts failed push send as not dispatched", async () => {
      await setupPush();
      mockResolveRecipientUserIds.mockResolvedValueOnce(["user-xyz"]);
      mockPushSend.mockResolvedValueOnce({ success: false });

      const result = await processEvent(await seedEvent());

      expect(mockPushSend).toHaveBeenCalledTimes(1);
      expect(result.dispatched).toBe(0);
    });
  });

  describe("email channel dispatch", () => {
    async function setupEmail() {
      await seedRule({ channels: [{ channel: "email", targetId: "10" }] });
      await seedConfig({ id: 10, type: "email", config: { locale: "de" } });
      ruleMatches([{ channel: "email", targetId: "10" }], "immediate");
    }

    it("dispatches via the email adapter with the resolved user ids and rendered message", async () => {
      await setupEmail();
      mockResolveRecipientUserIds.mockResolvedValueOnce(["user-abc"]);

      const result = await processEvent(await seedEvent());

      expect(mockEmailSend).toHaveBeenCalledTimes(1);
      expect(mockEmailSend).toHaveBeenCalledWith({
        eventId: "evt-1",
        watchRuleId: 1,
        channelConfigId: 10,
        recipientUserIds: ["user-abc"],
        title: "Match Cancelled",
        body: "The match has been cancelled.",
        locale: "de",
        link: "http://localhost:3000/admin/matches/42",
      });
      expect(result.dispatched).toBe(1);
    });

    it("omits the call to action when the event carries no deep link", async () => {
      await setupEmail();
      mockResolveRecipientUserIds.mockResolvedValueOnce(["user-abc"]);

      await processEvent(await seedEvent({ deepLinkPath: "" }));

      expect(mockEmailSend).toHaveBeenCalledWith(
        expect.objectContaining({ link: undefined }),
      );
    });

    it("skips email dispatch when the recipient resolves to no users", async () => {
      await setupEmail();
      mockResolveRecipientUserIds.mockResolvedValueOnce([]);

      const result = await processEvent(await seedEvent());

      expect(mockEmailSend).not.toHaveBeenCalled();
      expect(result.dispatched).toBe(0);
    });

    it("counts a failed email send as not dispatched", async () => {
      await setupEmail();
      mockResolveRecipientUserIds.mockResolvedValueOnce(["user-xyz"]);
      mockEmailSend.mockResolvedValueOnce({ success: false });

      const result = await processEvent(await seedEvent());

      expect(mockEmailSend).toHaveBeenCalledTimes(1);
      expect(result.dispatched).toBe(0);
    });
  });

  describe("resolveLocaleForRecipient", () => {
    it("prefers the addressed user's stored locale over the channel config's", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { locale: "en" } });
      await seedPref("user-anna", { locale: "de" });
      // A different user's locale must not be picked up.
      await seedPref("user-bob", { locale: "fr" });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "user", channel: "in_app", userId: "user-anna" },
      ]);
      mockRenderEventMessage.mockReturnValue({ title: "Neue Aufgabe", body: "..." });

      await processEvent(
        await seedEvent({
          type: "task.assigned",
          entityType: "task",
          entityId: 1,
          entityName: "Test Task",
        }),
      );

      expect(mockRenderEventMessage).toHaveBeenCalledWith(
        "task.assigned",
        expect.any(Object),
        "Test Task",
        "de",
      );
    });

    it("falls back to de when the user has no preference and the config has no locale", async () => {
      await seedConfig({ id: 10, type: "in_app", config: {} });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "user", channel: "in_app", userId: "user-no-pref" },
      ]);

      await processEvent(
        await seedEvent({ type: "task.assigned", entityType: "task", entityId: 1, entityName: "T" }),
      );

      expect(mockRenderEventMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        "de",
      );
    });

    it("uses configLocale when user preference is absent but config locale is set", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { locale: "en" } });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "user", channel: "in_app", userId: "user-no-pref" },
      ]);

      await processEvent(
        await seedEvent({ type: "task.assigned", entityType: "task", entityId: 2, entityName: "T" }),
      );

      expect(mockRenderEventMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        "en",
      );
    });

    it("uses de when a non-user recipient has no configLocale", async () => {
      await seedConfig({ id: 10, type: "in_app", config: {} });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "admin", channel: "in_app" },
      ]);

      await processEvent(await seedEvent({ entityType: "match", entityId: 99 }));

      expect(mockRenderEventMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        "de",
      );
    });
  });

  describe("loadMutedEventTypes — empty mutedEventTypes list", () => {
    it("does not add recipient to muted map when mutedEventTypes is empty", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { audienceRole: "referee", locale: "de" } });
      // The pref row exists but mutes nothing.
      const refereeId = await seedRefereeWithAccount("u_whistle", { mutedEventTypes: [] });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "referee", channel: "in_app", refereeId },
      ]);

      const result = await processEvent(await seedEvent());

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(result.muted).toBe(0);
      expect(result.dispatched).toBe(1);
    });
  });

  describe("task event dispatch", () => {
    it("dispatches in-app notification to user:<id> recipient", async () => {
      await seedConfig({ id: 10, type: "in_app", config: { locale: "de" } });
      await seedPref("user-alice", { locale: "de" });
      mockGetDefaultNotificationsForEvent.mockReturnValue([
        { audience: "user", channel: "in_app", userId: "user-alice" },
      ]);

      const result = await processEvent(
        await seedEvent({
          type: "task.assigned",
          entityType: "task",
          entityId: 1,
          entityName: "Test Task",
        }),
      );

      expect(mockInAppSend).toHaveBeenCalledTimes(1);
      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: "user:user-alice" }),
      );
      expect(result.dispatched).toBe(1);
    });
  });
});

// ── Channel coverage guard ───────────────────────────────────────────────────

describe("dispatchable channel coverage", () => {
  /**
   * The load-bearing property: an admin must never be able to configure a
   * channel whose notifications disappear. `CHANNEL_TYPES` is what the provider
   * endpoint offers and what the create contract accepts, so every entry in it
   * needs a dispatch branch in `dispatchImmediate` — otherwise the config is
   * created successfully and every notification falls through to the
   * "No adapter for channel type" branch.
   *
   * No DB fixture: these assert on two exported constants, which is the whole
   * point — the guard holds regardless of what any test seeds.
   */
  it("has a dispatch branch for every offerable channel type", () => {
    const missing = CHANNEL_TYPES.filter(
      (type) => DISPATCHABLE_CHANNEL_TYPES[type] !== true,
    );
    expect(missing).toEqual([]);
  });

  it("offers no channel type the pipeline cannot deliver", () => {
    expect(Object.keys(DISPATCHABLE_CHANNEL_TYPES).sort()).toEqual(
      [...CHANNEL_TYPES].sort(),
    );
  });
});

import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm is NOT mocked here. This seeder's whole job is idempotency, and
// idempotency is decided entirely by two predicates:
//   and(eq(channelConfigs.name, ...), eq(channelConfigs.type, "whatsapp_group"))
//   eq(watchRules.name, ...)
// A test that stubs `eq`/`and` with identity functions and hands back pre-canned
// select results passes whether those predicates are right, wrong or absent, so
// we run against a real (PGlite, in-process) Postgres and assert on the rows
// that actually landed.

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

const mocks = vi.hoisted(() => ({
  logDebug: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: vi.fn(() => ({
      info: mocks.logInfo,
      debug: mocks.logDebug,
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

// --- Imports (after mocks) ---

import { seedRefereeNotificationConfig } from "./seed-referee-watch-rule";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

const CHANNEL_CONFIG_NAME = "Referee WhatsApp Group";
const WATCH_RULE_NAME = "Referee slots → WhatsApp group";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

interface ChannelConfigRow {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  config: { groupId?: string; locale?: string };
  digest_mode: string;
}

interface WatchRuleRow {
  id: number;
  name: string;
  enabled: boolean;
  created_by: string;
  event_types: string[];
  channels: { channel: string; targetId: string }[];
  urgency_override: string | null;
}

async function channelConfigRows(): Promise<ChannelConfigRow[]> {
  const r = await ctx.client.query<ChannelConfigRow>(
    `SELECT id, name, type, enabled, config, digest_mode FROM channel_configs ORDER BY id`,
  );
  return r.rows;
}

async function watchRuleRows(): Promise<WatchRuleRow[]> {
  const r = await ctx.client.query<WatchRuleRow>(
    `SELECT id, name, enabled, created_by, event_types, channels, urgency_override
     FROM watch_rules ORDER BY id`,
  );
  return r.rows;
}

async function seedChannelConfig(
  name: string,
  type: string,
): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO channel_configs (name, type, enabled, config, digest_mode)
     VALUES ($1, $2, true, '{"groupId":"pre-existing"}'::jsonb, 'none') RETURNING id`,
    [name, type],
  );
  return r.rows[0]!.id;
}

// --- Tests ---

describe("seedRefereeNotificationConfig", () => {
  it("creates the disabled whatsapp channel config and the watch rule that targets it", async () => {
    await seedRefereeNotificationConfig();

    const configs = await channelConfigRows();
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({
      name: CHANNEL_CONFIG_NAME,
      type: "whatsapp_group",
      // Disabled on creation: the admin has to supply the groupId first.
      enabled: false,
      digest_mode: "none",
    });
    expect(configs[0]!.config).toEqual({ groupId: "", locale: "de" });

    const rules = await watchRuleRows();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      name: WATCH_RULE_NAME,
      enabled: true,
      created_by: "system",
      urgency_override: "immediate",
    });
    expect(rules[0]!.event_types).toEqual([
      "referee.slots.needed",
      "referee.slots.reminder",
    ]);
    // The rule must point at the config that was just created, not at a
    // hard-coded or stale id.
    expect(rules[0]!.channels).toEqual([
      { channel: "whatsapp_group", targetId: String(configs[0]!.id) },
    ]);
  });

  it("is idempotent: a second run creates no duplicate rows", async () => {
    await seedRefereeNotificationConfig();
    const firstConfigId = (await channelConfigRows())[0]!.id;
    const firstRuleId = (await watchRuleRows())[0]!.id;

    await seedRefereeNotificationConfig();

    const configs = await channelConfigRows();
    const rules = await watchRuleRows();
    expect(configs).toHaveLength(1);
    expect(rules).toHaveLength(1);
    expect(configs[0]!.id).toBe(firstConfigId);
    expect(rules[0]!.id).toBe(firstRuleId);
    expect(mocks.logDebug).toHaveBeenCalledWith(
      "Referee WhatsApp channel config already exists",
    );
    expect(mocks.logDebug).toHaveBeenCalledWith(
      "Referee slots watch rule already exists",
    );
  });

  it("reuses an existing referee whatsapp config and targets the rule at its id", async () => {
    const existingId = await seedChannelConfig(CHANNEL_CONFIG_NAME, "whatsapp_group");

    await seedRefereeNotificationConfig();

    const configs = await channelConfigRows();
    expect(configs).toHaveLength(1);
    expect(configs[0]!.id).toBe(existingId);
    // The pre-existing config keeps its own settings — the seeder must not
    // overwrite an admin-configured groupId.
    expect(configs[0]!.config).toEqual({ groupId: "pre-existing" });

    const rules = await watchRuleRows();
    expect(rules[0]!.channels).toEqual([
      { channel: "whatsapp_group", targetId: String(existingId) },
    ]);
  });

  it("does not adopt an unrelated whatsapp_group config that happens to exist", async () => {
    // A different WhatsApp group (e.g. the team group) must not be mistaken for
    // the referee group: the lookup filters on name AND type.
    const unrelatedId = await seedChannelConfig("Team WhatsApp Group", "whatsapp_group");

    await seedRefereeNotificationConfig();

    const configs = await channelConfigRows();
    expect(configs).toHaveLength(2);
    const created = configs.find((c) => c.name === CHANNEL_CONFIG_NAME);
    expect(created).toBeDefined();
    expect(created!.id).not.toBe(unrelatedId);

    const rules = await watchRuleRows();
    expect(rules[0]!.channels).toEqual([
      { channel: "whatsapp_group", targetId: String(created!.id) },
    ]);
  });

  it("does not adopt a same-named config of a different channel type", async () => {
    // Name collision across channel types: an in_app config called
    // "Referee WhatsApp Group" is not a WhatsApp group.
    const inAppId = await seedChannelConfig(CHANNEL_CONFIG_NAME, "in_app");

    await seedRefereeNotificationConfig();

    const configs = await channelConfigRows();
    expect(configs).toHaveLength(2);
    const created = configs.find((c) => c.type === "whatsapp_group");
    expect(created).toBeDefined();
    expect(created!.id).not.toBe(inAppId);

    const rules = await watchRuleRows();
    expect(rules[0]!.channels).toEqual([
      { channel: "whatsapp_group", targetId: String(created!.id) },
    ]);
  });

  it("creates the missing watch rule when only the channel config exists", async () => {
    const existingId = await seedChannelConfig(CHANNEL_CONFIG_NAME, "whatsapp_group");

    await seedRefereeNotificationConfig();

    expect(await channelConfigRows()).toHaveLength(1);
    const rules = await watchRuleRows();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.channels).toEqual([
      { channel: "whatsapp_group", targetId: String(existingId) },
    ]);
    expect(mocks.logInfo).toHaveBeenCalledWith(
      { channelConfigId: existingId },
      "Created referee slots watch rule",
    );
  });

  it("leaves a differently-named watch rule alone and still creates its own", async () => {
    await ctx.client.query(
      `INSERT INTO watch_rules (name, enabled, created_by, event_types, filters, channels)
       VALUES ('Some other rule', true, 'admin', ARRAY['match.cancelled'], '[]'::jsonb, '[]'::jsonb)`,
    );

    await seedRefereeNotificationConfig();

    const rules = await watchRuleRows();
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.name)).toContain(WATCH_RULE_NAME);
  });
});

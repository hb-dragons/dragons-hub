import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

// --- Imports (after mocks) ---

import { InAppChannelAdapter } from "./in-app";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../../test/setup-test-db";

// --- PGlite setup ---

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

async function insertPrerequisites() {
  await ctx.client.exec(`
    INSERT INTO domain_events (id, type, source, urgency, occurred_at, entity_type, entity_id, entity_name, deep_link_path, payload)
    VALUES ('evt-001', 'match.cancelled', 'sync', 'immediate', NOW(), 'match', 1, 'Test Match', '/matches/1', '{}');
  `);
  await ctx.client.exec(`INSERT INTO channel_configs (id, name, type, config) VALUES (1, 'test-channel', 'in_app', '{}');`);
}

beforeEach(async () => {
  await resetTestDb(ctx);
  await insertPrerequisites();
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

async function getNotificationLogs() {
  const result = await ctx.client.query("SELECT * FROM notification_log ORDER BY id");
  return result.rows as Record<string, unknown>[];
}

// --- Tests ---

describe("InAppChannelAdapter", () => {
  it("has a send method", () => {
    const adapter = new InAppChannelAdapter();
    expect(typeof adapter.send).toBe("function");
  });

  it("implements ChannelAdapter interface", () => {
    const adapter = new InAppChannelAdapter();
    expect(adapter).toHaveProperty("send");
  });

  it("inserts a notification_log row with status sent", async () => {
    const adapter = new InAppChannelAdapter();
    const result = await adapter.send({
      eventId: "evt-001",
      watchRuleId: null,
      channelConfigId: 1,
      recipientId: "user-1",
      title: "Test notification",
      body: "Test body",
      locale: "de",
    });

    expect(result.success).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.error).toBeUndefined();

    const rows = await getNotificationLogs();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event_id).toBe("evt-001");
    expect(rows[0]!.title).toBe("Test notification");
    expect(rows[0]!.body).toBe("Test body");
    expect(rows[0]!.status).toBe("sent");
    expect(rows[0]!.sent_at).not.toBeNull();
    expect(rows[0]!.locale).toBe("de");
  });

  it("returns duplicate=true when dedup constraint fires", async () => {
    const adapter = new InAppChannelAdapter();
    const params = {
      eventId: "evt-001",
      watchRuleId: null,
      channelConfigId: 1,
      recipientId: "user-1",
      title: "First",
      body: "First body",
      locale: "de",
    };

    // First send succeeds
    const first = await adapter.send(params);
    expect(first.success).toBe(true);
    expect(first.duplicate).toBe(false);

    // Second send is deduplicated
    const second = await adapter.send({ ...params, title: "Duplicate" });
    expect(second.success).toBe(true);
    expect(second.duplicate).toBe(true);

    // Only one row in the DB
    const rows = await getNotificationLogs();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("First");
  });

  it("returns error result on database failure", async () => {
    // Create a new adapter that will fail by using an invalid event_id (FK violation)
    const adapter = new InAppChannelAdapter();
    const result = await adapter.send({
      eventId: "nonexistent-event",
      watchRuleId: null,
      channelConfigId: 1,
      recipientId: "user-1",
      title: "Will fail",
      body: "FK violation",
      locale: "de",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("handles non-Error exceptions with fallback message", async () => {
    // Temporarily swap out the db proxy to throw a non-Error value
    const realRef = dbHolder.ref;
    dbHolder.ref = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => Promise.reject("raw string rejection"),
          }),
        }),
      }),
    };

    const adapter = new InAppChannelAdapter();
    const result = await adapter.send({
      eventId: "evt-001",
      watchRuleId: null,
      channelConfigId: 1,
      recipientId: "user-1",
      title: "Non-Error throw",
      body: "Test body",
      locale: "de",
    });

    expect(result).toEqual({
      success: false,
      error: "Unknown error during in-app delivery",
    });

    // Restore real db
    dbHolder.ref = realRef;
  });
});

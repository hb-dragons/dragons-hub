import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

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

// --- PGlite setup ---

const CREATE_TABLES = `
  CREATE TABLE sync_runs (
    id SERIAL PRIMARY KEY
  );

  CREATE TABLE domain_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    urgency TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor TEXT,
    sync_run_id INTEGER REFERENCES sync_runs(id),
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    entity_name TEXT NOT NULL,
    deep_link_path TEXT NOT NULL,
    enqueued_at TIMESTAMPTZ,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE watch_rules (
    id SERIAL PRIMARY KEY
  );

  CREATE TABLE channel_configs (
    id SERIAL PRIMARY KEY
  );

  CREATE TABLE notification_log (
    id SERIAL PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES domain_events(id),
    watch_rule_id INTEGER REFERENCES watch_rules(id),
    channel_config_id INTEGER NOT NULL REFERENCES channel_configs(id),
    recipient_id TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'de',
    status TEXT NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    digest_run_id INTEGER,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

let client: PGlite;

beforeAll(async () => {
  const pglite = await import("@electric-sql/pglite");
  const drizzlePglite = await import("drizzle-orm/pglite");

  client = new pglite.PGlite();
  dbHolder.ref = drizzlePglite.drizzle(client);

  await client.exec(CREATE_TABLES);

  // Insert prerequisite rows for foreign keys
  await client.exec(`
    INSERT INTO domain_events (id, type, source, urgency, entity_type, entity_id, entity_name, deep_link_path, payload)
    VALUES ('evt-001', 'match.cancelled', 'sync', 'immediate', 'match', 1, 'Test Match', '/matches/1', '{}');
  `);
  await client.exec(`INSERT INTO channel_configs (id) VALUES (1);`);
});

beforeEach(async () => {
  await client.exec("DELETE FROM notification_log");
  await client.exec("ALTER SEQUENCE notification_log_id_seq RESTART WITH 1");
});

afterAll(async () => {
  await client.close();
});

// --- Helpers ---

async function getNotificationLogs() {
  const result = await client.query("SELECT * FROM notification_log ORDER BY id");
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
});

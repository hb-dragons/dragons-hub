import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

// --- Mock setup ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// --- Imports (after mocks) ---

import {
  listNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
  retryFailedNotification,
} from "./notification-admin.service";

// --- PGlite setup ---

const CREATE_TABLES = `
  CREATE TABLE domain_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    urgency TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor TEXT,
    sync_run_id INTEGER,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    entity_name TEXT NOT NULL,
    deep_link_path TEXT NOT NULL,
    enqueued_at TIMESTAMPTZ,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE notification_log (
    id SERIAL PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES domain_events(id),
    watch_rule_id INTEGER,
    channel_config_id INTEGER NOT NULL,
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
let eventCounter = 0;

beforeAll(async () => {
  const pglite = await import("@electric-sql/pglite");
  const drizzlePglite = await import("drizzle-orm/pglite");

  client = new pglite.PGlite();
  dbHolder.ref = drizzlePglite.drizzle(client);

  await client.exec(CREATE_TABLES);
});

beforeEach(async () => {
  await client.exec("DELETE FROM notification_log");
  await client.exec("DELETE FROM domain_events");
  await client.exec("ALTER SEQUENCE notification_log_id_seq RESTART WITH 1");
  eventCounter = 0;
  vi.clearAllMocks();
});

afterAll(async () => {
  await client.close();
});

// --- Helpers ---

async function insertEvent(overrides: Record<string, unknown> = {}): Promise<string> {
  eventCounter++;
  const id = overrides.id ?? `evt-${eventCounter}`;
  const defaults = {
    id,
    type: "match.cancelled",
    source: "sync",
    urgency: "immediate",
    entity_type: "match",
    entity_id: 42,
    entity_name: "Dragons vs. Tigers",
    deep_link_path: "/admin/matches/42",
    payload: JSON.stringify({}),
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(
    `INSERT INTO domain_events (${cols.join(", ")}) VALUES (${placeholders})`,
    vals,
  );
  return id as string;
}

async function insertNotification(overrides: Record<string, unknown> = {}) {
  const eventId = overrides.event_id ?? (await insertEvent());
  const defaults = {
    event_id: eventId,
    channel_config_id: 1,
    recipient_id: "user-1",
    title: "Test",
    body: "Test body",
    locale: "de",
    status: "sent",
    sent_at: new Date().toISOString(),
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query(
    `INSERT INTO notification_log (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

// --- Tests ---

describe("listNotifications", () => {
  it("returns empty list when no notifications exist", async () => {
    const result = await listNotifications({ userId: "user-1" });

    expect(result).toEqual({ notifications: [], total: 0 });
  });

  it("returns notifications for a specific user", async () => {
    await insertNotification({ recipient_id: "user-1", title: "N1" });
    await insertNotification({ recipient_id: "user-1", title: "N2" });
    await insertNotification({ recipient_id: "user-2", title: "N3" });

    const result = await listNotifications({ userId: "user-1" });

    expect(result.total).toBe(2);
    expect(result.notifications).toHaveLength(2);
    expect(result.notifications.every((n) => n.recipientId === "user-1")).toBe(true);
  });

  it("orders by createdAt descending", async () => {
    const e1 = await insertEvent();
    const e2 = await insertEvent();
    await client.exec(`
      INSERT INTO notification_log (event_id, channel_config_id, recipient_id, title, body, status, created_at)
      VALUES ('${e1}', 1, 'user-1', 'Older', 'body', 'sent', '2025-01-01T00:00:00Z'),
             ('${e2}', 1, 'user-1', 'Newer', 'body', 'sent', '2025-06-01T00:00:00Z')
    `);

    const result = await listNotifications({ userId: "user-1" });

    expect(result.notifications[0]!.title).toBe("Newer");
    expect(result.notifications[1]!.title).toBe("Older");
  });

  it("respects limit parameter", async () => {
    await insertNotification({ recipient_id: "user-1", title: "N1" });
    await insertNotification({ recipient_id: "user-1", title: "N2" });
    await insertNotification({ recipient_id: "user-1", title: "N3" });

    const result = await listNotifications({ userId: "user-1", limit: 2 });

    expect(result.notifications).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it("respects offset parameter", async () => {
    await insertNotification({ recipient_id: "user-1", title: "N1" });
    await insertNotification({ recipient_id: "user-1", title: "N2" });
    await insertNotification({ recipient_id: "user-1", title: "N3" });

    const result = await listNotifications({ userId: "user-1", limit: 10, offset: 2 });

    expect(result.notifications).toHaveLength(1);
    expect(result.total).toBe(3);
  });

  it("includes domain event fields in response", async () => {
    const eventId = await insertEvent({
      type: "match.venue.changed",
      entity_name: "U16 vs TSV",
      deep_link_path: "/admin/matches/99",
      urgency: "routine",
      entity_type: "match",
      entity_id: 99,
    });
    await insertNotification({ event_id: eventId, recipient_id: "user-1" });

    const result = await listNotifications({ userId: "user-1" });

    expect(result.notifications[0]).toMatchObject({
      eventType: "match.venue.changed",
      entityName: "U16 vs TSV",
      deepLinkPath: "/admin/matches/99",
      urgency: "routine",
      entityType: "match",
      entityId: 99,
    });
  });
});

describe("markRead", () => {
  it("marks a notification as read with readAt timestamp", async () => {
    const id = await insertNotification({ status: "sent" });

    const success = await markRead(id);

    expect(success).toBe(true);

    const result = await client.query(
      "SELECT status, read_at FROM notification_log WHERE id = $1",
      [id],
    );
    const row = result.rows[0] as { status: string; read_at: string | null };
    expect(row.status).toBe("read");
    expect(row.read_at).not.toBeNull();
  });

  it("returns false for non-existent notification", async () => {
    const success = await markRead(999);
    expect(success).toBe(false);
  });

  it("can mark an already-read notification (idempotent)", async () => {
    const id = await insertNotification({ status: "read" });

    const success = await markRead(id);
    expect(success).toBe(true);
  });
});

describe("markAllRead", () => {
  it("marks all unread notifications for a user as read", async () => {
    await insertNotification({ recipient_id: "user-1", title: "N1", status: "sent" });
    await insertNotification({ recipient_id: "user-1", title: "N2", status: "sent" });
    await insertNotification({ recipient_id: "user-1", title: "N3", status: "read" });

    const count = await markAllRead("user-1");

    expect(count).toBe(2);

    const result = await client.query(
      "SELECT status FROM notification_log WHERE recipient_id = 'user-1' ORDER BY id",
    );
    const rows = result.rows as { status: string }[];
    expect(rows.every((r) => r.status === "read")).toBe(true);
  });

  it("returns 0 when all notifications are already read", async () => {
    await insertNotification({ recipient_id: "user-1", status: "read" });
    const count = await markAllRead("user-1");
    expect(count).toBe(0);
  });

  it("returns 0 when user has no notifications", async () => {
    const count = await markAllRead("user-1");
    expect(count).toBe(0);
  });

  it("does not affect other users' notifications", async () => {
    await insertNotification({ recipient_id: "user-1", status: "sent" });
    await insertNotification({ recipient_id: "user-2", status: "sent" });

    await markAllRead("user-1");

    const result = await client.query(
      "SELECT status FROM notification_log WHERE recipient_id = 'user-2'",
    );
    expect((result.rows[0] as { status: string }).status).toBe("sent");
  });
});

describe("getUnreadCount", () => {
  it("returns count of unread notifications for a user", async () => {
    await insertNotification({ recipient_id: "user-1", status: "sent" });
    await insertNotification({ recipient_id: "user-1", status: "sent" });
    await insertNotification({ recipient_id: "user-1", status: "read" });

    const count = await getUnreadCount("user-1");
    expect(count).toBe(2);
  });

  it("returns 0 when all notifications are read", async () => {
    await insertNotification({ recipient_id: "user-1", status: "read" });
    const count = await getUnreadCount("user-1");
    expect(count).toBe(0);
  });

  it("returns 0 when user has no notifications", async () => {
    const count = await getUnreadCount("user-1");
    expect(count).toBe(0);
  });

  it("does not count other users' notifications", async () => {
    await insertNotification({ recipient_id: "user-1", status: "sent" });
    await insertNotification({ recipient_id: "user-2", status: "sent" });

    const count = await getUnreadCount("user-1");
    expect(count).toBe(1);
  });

  it("counts pending status as unread", async () => {
    await insertNotification({ recipient_id: "user-1", status: "pending" });

    const count = await getUnreadCount("user-1");
    expect(count).toBe(1);
  });
});

describe("retryFailedNotification", () => {
  it("retries a failed notification and updates status to sent", async () => {
    const id = await insertNotification({
      status: "failed",
      error_message: "Connection refused",
      retry_count: 1,
    });

    const result = await retryFailedNotification(id);

    expect(result.success).toBe(true);

    const row = await client.query(
      "SELECT status, retry_count, error_message FROM notification_log WHERE id = $1",
      [id],
    );
    const updated = row.rows[0] as { status: string; retry_count: number; error_message: string | null };
    expect(updated.status).toBe("sent");
    expect(updated.retry_count).toBe(2);
    expect(updated.error_message).toBeNull();
  });

  it("returns error for non-existent notification", async () => {
    const result = await retryFailedNotification(999);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Notification not found");
  });

  it("returns error when notification is not in failed state", async () => {
    const id = await insertNotification({ status: "sent" });

    const result = await retryFailedNotification(id);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot retry");
  });
});

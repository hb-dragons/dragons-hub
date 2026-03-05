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

// --- Imports (after mocks) ---

import {
  listNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
} from "./notification-admin.service";

// --- PGlite setup ---

const CREATE_TABLES = `
  CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    channel VARCHAR(20) NOT NULL,
    title VARCHAR(300) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
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
});

beforeEach(async () => {
  await client.exec("DELETE FROM notifications");
  await client.exec("ALTER SEQUENCE notifications_id_seq RESTART WITH 1");
  vi.clearAllMocks();
});

afterAll(async () => {
  await client.close();
});

// --- Helpers ---

async function insertNotification(overrides: Record<string, unknown> = {}) {
  const defaults = {
    recipient_id: "user-1",
    channel: "in_app",
    title: "Test",
    body: "Test body",
    status: "sent",
    sent_at: new Date().toISOString(),
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query(
    `INSERT INTO notifications (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
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
    expect(result.notifications.every((n) => n.recipientId === "user-1")).toBe(
      true,
    );
  });

  it("orders by createdAt descending", async () => {
    await insertNotification({
      recipient_id: "user-1",
      title: "Older",
      created_at: "2025-01-01T00:00:00Z",
    });
    await insertNotification({
      recipient_id: "user-1",
      title: "Newer",
      created_at: "2025-06-01T00:00:00Z",
    });

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

    const result = await listNotifications({
      userId: "user-1",
      limit: 10,
      offset: 2,
    });

    expect(result.notifications).toHaveLength(1);
    expect(result.total).toBe(3);
  });

  it("uses default limit and offset", async () => {
    for (let i = 0; i < 25; i++) {
      await insertNotification({
        recipient_id: "user-1",
        title: `N${i}`,
      });
    }

    const result = await listNotifications({ userId: "user-1" });

    expect(result.notifications).toHaveLength(20);
    expect(result.total).toBe(25);
  });
});

describe("markRead", () => {
  it("marks a notification as read", async () => {
    const id = await insertNotification({ status: "sent" });

    const success = await markRead(id);

    expect(success).toBe(true);

    const result = await client.query(
      "SELECT status FROM notifications WHERE id = $1",
      [id],
    );
    expect((result.rows[0] as { status: string }).status).toBe("read");
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
    await insertNotification({
      recipient_id: "user-1",
      title: "N1",
      status: "sent",
    });
    await insertNotification({
      recipient_id: "user-1",
      title: "N2",
      status: "sent",
    });
    await insertNotification({
      recipient_id: "user-1",
      title: "N3",
      status: "read",
    });

    const count = await markAllRead("user-1");

    expect(count).toBe(2);

    const result = await client.query(
      "SELECT status FROM notifications WHERE recipient_id = 'user-1' ORDER BY id",
    );
    const rows = result.rows as { status: string }[];
    expect(rows.every((r) => r.status === "read")).toBe(true);
  });

  it("returns 0 when all notifications are already read", async () => {
    await insertNotification({
      recipient_id: "user-1",
      status: "read",
    });

    const count = await markAllRead("user-1");

    expect(count).toBe(0);
  });

  it("returns 0 when user has no notifications", async () => {
    const count = await markAllRead("user-1");

    expect(count).toBe(0);
  });

  it("does not affect other users' notifications", async () => {
    await insertNotification({
      recipient_id: "user-1",
      status: "sent",
    });
    await insertNotification({
      recipient_id: "user-2",
      status: "sent",
    });

    await markAllRead("user-1");

    const result = await client.query(
      "SELECT status FROM notifications WHERE recipient_id = 'user-2'",
    );
    expect((result.rows[0] as { status: string }).status).toBe("sent");
  });
});

describe("getUnreadCount", () => {
  it("returns count of unread notifications for a user", async () => {
    await insertNotification({
      recipient_id: "user-1",
      status: "sent",
    });
    await insertNotification({
      recipient_id: "user-1",
      status: "sent",
    });
    await insertNotification({
      recipient_id: "user-1",
      status: "read",
    });

    const count = await getUnreadCount("user-1");

    expect(count).toBe(2);
  });

  it("returns 0 when all notifications are read", async () => {
    await insertNotification({
      recipient_id: "user-1",
      status: "read",
    });

    const count = await getUnreadCount("user-1");

    expect(count).toBe(0);
  });

  it("returns 0 when user has no notifications", async () => {
    const count = await getUnreadCount("user-1");

    expect(count).toBe(0);
  });

  it("does not count other users' notifications", async () => {
    await insertNotification({
      recipient_id: "user-1",
      status: "sent",
    });
    await insertNotification({
      recipient_id: "user-2",
      status: "sent",
    });

    const count = await getUnreadCount("user-1");

    expect(count).toBe(1);
  });

  it("counts pending status as unread", async () => {
    await insertNotification({
      recipient_id: "user-1",
      status: "pending",
    });

    const count = await getUnreadCount("user-1");

    expect(count).toBe(1);
  });
});

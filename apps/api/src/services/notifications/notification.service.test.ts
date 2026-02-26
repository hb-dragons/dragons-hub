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
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    })),
  },
}));

// --- Imports (after mocks) ---

import {
  sendNotification,
  notifyTaskAssigned,
  notifyBookingNeedsAction,
  notifyTaskComment,
} from "./notification.service";

// --- PGlite setup ---

const CREATE_TABLES = `
  CREATE TABLE boards (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE board_columns (
    id SERIAL PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    color VARCHAR(7),
    is_done_column BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE venues (
    id SERIAL PRIMARY KEY,
    api_id INTEGER NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    street VARCHAR(200),
    postal_code VARCHAR(10),
    city VARCHAR(100),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE venue_bookings (
    id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(id),
    date DATE NOT NULL,
    calculated_start_time TIME NOT NULL,
    calculated_end_time TIME NOT NULL,
    override_start_time TIME,
    override_end_time TIME,
    override_reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    needs_reconfirmation BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    confirmed_by TEXT,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id INTEGER NOT NULL REFERENCES board_columns(id),
    title VARCHAR(300) NOT NULL,
    description TEXT,
    assignee_id TEXT,
    priority VARCHAR(10) NOT NULL DEFAULT 'normal',
    due_date DATE,
    position INTEGER NOT NULL DEFAULT 0,
    match_id INTEGER,
    venue_booking_id INTEGER REFERENCES venue_bookings(id),
    source_type VARCHAR(20) NOT NULL DEFAULT 'manual',
    source_detail TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    channel VARCHAR(20) NOT NULL,
    title VARCHAR(300) NOT NULL,
    body TEXT NOT NULL,
    related_task_id INTEGER REFERENCES tasks(id),
    related_booking_id INTEGER REFERENCES venue_bookings(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE user_notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    whatsapp_number VARCHAR(20),
    notify_on_task_assigned BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_booking_needs_action BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_task_comment BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  await client.exec("DELETE FROM user_notification_preferences");
  await client.exec("DELETE FROM tasks");
  await client.exec("DELETE FROM board_columns");
  await client.exec("DELETE FROM boards");
  await client.exec("DELETE FROM venue_bookings");
  await client.exec("DELETE FROM venues");
  await client.exec("ALTER SEQUENCE notifications_id_seq RESTART WITH 1");
  await client.exec(
    "ALTER SEQUENCE user_notification_preferences_id_seq RESTART WITH 1",
  );
  await client.exec("ALTER SEQUENCE tasks_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE board_columns_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE boards_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE venue_bookings_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE venues_id_seq RESTART WITH 1");
  vi.clearAllMocks();
});

afterAll(async () => {
  await client.close();
});

// --- Helpers ---

async function getNotifications() {
  const result = await client.query(
    "SELECT * FROM notifications ORDER BY id",
  );
  return result.rows as Record<string, unknown>[];
}

async function insertUserPrefs(
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  const defaults = {
    notify_on_task_assigned: true,
    notify_on_booking_needs_action: true,
    notify_on_task_comment: true,
  };
  const data = { user_id: userId, ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(
    `INSERT INTO user_notification_preferences (${cols.join(", ")}) VALUES (${placeholders})`,
    vals,
  );
}

// --- Tests ---

describe("sendNotification", () => {
  it("inserts a notification with channel in_app and status sent", async () => {
    await sendNotification({
      recipientId: "user-1",
      title: "Test Title",
      body: "Test Body",
    });

    const rows = await getNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipient_id).toBe("user-1");
    expect(rows[0]!.channel).toBe("in_app");
    expect(rows[0]!.title).toBe("Test Title");
    expect(rows[0]!.body).toBe("Test Body");
    expect(rows[0]!.status).toBe("sent");
    expect(rows[0]!.sent_at).not.toBeNull();
    expect(rows[0]!.related_task_id).toBeNull();
    expect(rows[0]!.related_booking_id).toBeNull();
  });

  it("stores relatedTaskId when provided", async () => {
    // Create required board/column/task for FK
    await client.exec("INSERT INTO boards (name) VALUES ('Board')");
    await client.exec(
      "INSERT INTO board_columns (board_id, name, position) VALUES (1, 'Col', 0)",
    );
    await client.exec(
      "INSERT INTO tasks (board_id, column_id, title) VALUES (1, 1, 'Task 1')",
    );

    await sendNotification({
      recipientId: "user-1",
      title: "Task notification",
      body: "Body",
      relatedTaskId: 1,
    });

    const rows = await getNotifications();
    expect(rows[0]!.related_task_id).toBe(1);
  });

  it("stores relatedBookingId when provided", async () => {
    await client.exec(
      "INSERT INTO venues (api_id, name) VALUES (1, 'Hall')",
    );
    await client.exec(
      "INSERT INTO venue_bookings (venue_id, date, calculated_start_time, calculated_end_time) VALUES (1, '2025-03-15', '17:00', '19:00')",
    );

    await sendNotification({
      recipientId: "user-1",
      title: "Booking notification",
      body: "Body",
      relatedBookingId: 1,
    });

    const rows = await getNotifications();
    expect(rows[0]!.related_booking_id).toBe(1);
  });
});

describe("notifyTaskAssigned", () => {
  async function seedTask(): Promise<number> {
    await client.exec("INSERT INTO boards (name) VALUES ('Board')");
    await client.exec(
      "INSERT INTO board_columns (board_id, name, position) VALUES (1, 'Col', 0)",
    );
    await client.exec(
      "INSERT INTO tasks (board_id, column_id, title) VALUES (1, 1, 'Fix the thing')",
    );
    return 1;
  }

  it("sends notification when user has no preference row (defaults)", async () => {
    const taskId = await seedTask();

    await notifyTaskAssigned(taskId, "user-1", "Fix the thing");

    const rows = await getNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Task assigned: Fix the thing");
    expect(rows[0]!.body).toBe("You have been assigned to task: Fix the thing");
    expect(rows[0]!.recipient_id).toBe("user-1");
  });

  it("sends notification when user preference is enabled", async () => {
    const taskId = await seedTask();
    await insertUserPrefs("user-1", { notify_on_task_assigned: true });

    await notifyTaskAssigned(taskId, "user-1", "Fix the thing");

    const rows = await getNotifications();
    expect(rows).toHaveLength(1);
  });

  it("does not send when user preference is disabled", async () => {
    await insertUserPrefs("user-1", { notify_on_task_assigned: false });

    await notifyTaskAssigned(10, "user-1", "Fix the thing");

    const rows = await getNotifications();
    expect(rows).toHaveLength(0);
  });
});

describe("notifyBookingNeedsAction", () => {
  async function seedBooking(): Promise<number> {
    await client.exec(
      "INSERT INTO venues (api_id, name) VALUES (1, 'Main Hall')",
    );
    await client.exec(
      "INSERT INTO venue_bookings (venue_id, date, calculated_start_time, calculated_end_time) VALUES (1, '2025-03-15', '17:00', '19:00')",
    );
    return 1;
  }

  it("sends notification when user has default preferences", async () => {
    const bookingId = await seedBooking();

    await notifyBookingNeedsAction(
      bookingId,
      "user-2",
      "Main Hall",
      "2025-03-15",
    );

    const rows = await getNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe(
      "Venue booking needs attention: Main Hall on 2025-03-15",
    );
    expect(rows[0]!.body).toBe(
      "The venue booking for Main Hall on 2025-03-15 requires your attention.",
    );
    expect(rows[0]!.recipient_id).toBe("user-2");
  });

  it("sends notification when user preference is enabled", async () => {
    const bookingId = await seedBooking();
    await insertUserPrefs("user-2", {
      notify_on_booking_needs_action: true,
    });

    await notifyBookingNeedsAction(
      bookingId,
      "user-2",
      "Main Hall",
      "2025-03-15",
    );

    const rows = await getNotifications();
    expect(rows).toHaveLength(1);
  });

  it("does not send when user preference is disabled", async () => {
    await insertUserPrefs("user-2", {
      notify_on_booking_needs_action: false,
    });

    await notifyBookingNeedsAction(5, "user-2", "Main Hall", "2025-03-15");

    const rows = await getNotifications();
    expect(rows).toHaveLength(0);
  });
});

describe("notifyTaskComment", () => {
  async function seedTask(): Promise<number> {
    await client.exec("INSERT INTO boards (name) VALUES ('Board')");
    await client.exec(
      "INSERT INTO board_columns (board_id, name, position) VALUES (1, 'Col', 0)",
    );
    await client.exec(
      "INSERT INTO tasks (board_id, column_id, title) VALUES (1, 1, 'Fix the thing')",
    );
    return 1;
  }

  it("sends notification when user has default preferences", async () => {
    const taskId = await seedTask();

    await notifyTaskComment(taskId, "user-3", "John Doe", "Fix the thing");

    const rows = await getNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("John Doe commented on: Fix the thing");
    expect(rows[0]!.body).toBe(
      "John Doe left a comment on task: Fix the thing",
    );
    expect(rows[0]!.recipient_id).toBe("user-3");
  });

  it("sends notification when user preference is enabled", async () => {
    const taskId = await seedTask();
    await insertUserPrefs("user-3", { notify_on_task_comment: true });

    await notifyTaskComment(taskId, "user-3", "John Doe", "Fix the thing");

    const rows = await getNotifications();
    expect(rows).toHaveLength(1);
  });

  it("does not send when user preference is disabled", async () => {
    await insertUserPrefs("user-3", { notify_on_task_comment: false });

    await notifyTaskComment(10, "user-3", "John Doe", "Fix the thing");

    const rows = await getNotifications();
    expect(rows).toHaveLength(0);
  });
});

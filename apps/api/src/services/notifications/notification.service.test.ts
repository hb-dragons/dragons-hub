import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

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

import { sendNotification } from "./notification.service";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

// --- PGlite setup ---

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

async function getNotifications() {
  const result = await ctx.client.query(
    "SELECT * FROM notifications ORDER BY id",
  );
  return result.rows as Record<string, unknown>[];
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
  });
});

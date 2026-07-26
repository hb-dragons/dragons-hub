import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../test/setup-test-db";
import type { AppEnv } from "../types";

// --- Mocks (hoisted before imports) ---
//
// Deliberately NOT mocking drizzle-orm or @dragons/db/schema. Both endpoints are
// almost entirely predicate: DELETE is scoped by `and(token, userId)` and
// register is an upsert with a `setWhere`. With `eq`/`and` stubbed to identity
// functions, dropping the ownership half of the DELETE predicate — which lets
// any signed-in user unregister anybody's device — left the old suite green.
//
// Scope note: token-takeover on POST /register (409, audit logging, reclaim) is
// covered by device.routes.security.test.ts and is not repeated here. This file
// covers request validation, what the upsert writes, and DELETE scoping.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../config/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
    },
  },
}));

vi.mock("../config/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// --- Imports (after mocks) ---

import { deviceRoutes } from "./device.routes";
import { errorHandler } from "../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", deviceRoutes);

const USER = "user-123";
const OTHER = "user-456";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    user: { id: USER, role: "user" },
    session: { id: "sess-1" },
  });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

interface DeviceRow {
  user_id: string;
  token: string;
  platform: string;
  locale: string | null;
  last_seen_at: string;
}

async function devices(): Promise<DeviceRow[]> {
  const rows = await ctx.client.query<DeviceRow>(
    "SELECT user_id, token, platform, locale, last_seen_at FROM push_devices ORDER BY token",
  );
  return rows.rows;
}

async function seedDevice(
  userId: string,
  token: string,
  opts: { lastSeenAt?: string } = {},
): Promise<void> {
  await ctx.client.query(
    `INSERT INTO push_devices (user_id, token, platform, locale, last_seen_at)
     VALUES ($1, $2, 'ios', 'de-DE', $3)`,
    [userId, token, opts.lastSeenAt ?? "2020-01-01T00:00:00Z"],
  );
}

function register(body: unknown) {
  return app.request("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function unregister(token: string) {
  return app.request(`/${encodeURIComponent(token)}`, { method: "DELETE" });
}

describe("POST /register — persisted row", () => {
  it("registers an ios device token and returns success", async () => {
    const res = await register({ token: "fcm-token-abc", platform: "ios" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(await devices()).toMatchObject([
      { user_id: USER, token: "fcm-token-abc", platform: "ios", locale: null },
    ]);
  });

  it("registers an android device token", async () => {
    const res = await register({ token: "fcm-token-xyz", platform: "android" });

    expect(res.status).toBe(200);
    expect(await devices()).toMatchObject([
      { user_id: USER, token: "fcm-token-xyz", platform: "android" },
    ]);
  });

  it("stores locale on register", async () => {
    await register({
      token: "ExponentPushToken[loc1]",
      platform: "ios",
      locale: "de-DE",
    });

    expect(await devices()).toMatchObject([
      { user_id: USER, token: "ExponentPushToken[loc1]", locale: "de-DE" },
    ]);
  });

  it("binds the row to the session user, never to a body-supplied id", async () => {
    await register({
      token: "ExponentPushToken[spoof]",
      platform: "ios",
      userId: OTHER,
    });

    expect((await devices()).map((d) => d.user_id)).toEqual([USER]);
  });

  it("bumps lastSeenAt and updates locale on re-register", async () => {
    await seedDevice(USER, "ExponentPushToken[bump1]", {
      lastSeenAt: "2020-01-01T00:00:00Z",
    });

    const res = await register({
      token: "ExponentPushToken[bump1]",
      platform: "android",
      locale: "en-US",
    });

    expect(res.status).toBe(200);
    const [row] = await devices();
    expect(row).toMatchObject({ platform: "android", locale: "en-US" });
    expect(new Date(row!.last_seen_at).getTime()).toBeGreaterThan(
      Date.parse("2020-01-01T00:00:00Z"),
    );
  });

  it("re-registering does not create a second row for the same token", async () => {
    await register({ token: "ExponentPushToken[dup]", platform: "ios" });
    await register({ token: "ExponentPushToken[dup]", platform: "ios" });

    expect(await devices()).toHaveLength(1);
  });

  it("returns 401 when not authenticated and writes nothing", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await register({ token: "fcm-token-abc", platform: "ios" });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
    expect(await devices()).toEqual([]);
  });
});

describe("POST /register — request validation", () => {
  it.each([
    ["invalid platform", { token: "fcm-token-abc", platform: "windows" }],
    ["missing token", { platform: "ios" }],
    ["empty token", { token: "", platform: "ios" }],
    ["missing platform", { token: "fcm-token-abc" }],
    ["empty body", {}],
    ["locale shorter than 2 chars", { token: "t", platform: "ios", locale: "a" }],
  ])("rejects %s with 400 and writes nothing", async (_label, body) => {
    const res = await register(body);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await devices()).toEqual([]);
  });
});

describe("DELETE /:token", () => {
  it("unregisters the caller's own device token", async () => {
    await seedDevice(USER, "my-device-token");

    const res = await unregister("my-device-token");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(await devices()).toEqual([]);
  });

  it("does not delete another user's device with the same token value", async () => {
    await seedDevice(OTHER, "shared-looking-token");

    const res = await unregister("shared-looking-token");

    expect(res.status).toBe(200);
    // Dropping the `userId` half of the DELETE predicate lets any signed-in
    // caller silently unregister somebody else's device.
    expect((await devices()).map((d) => d.user_id)).toEqual([OTHER]);
  });

  it("deletes only the named token, not every device the caller owns", async () => {
    await seedDevice(USER, "token-a");
    await seedDevice(USER, "token-b");

    await unregister("token-a");

    expect((await devices()).map((d) => d.token)).toEqual(["token-b"]);
  });

  it("returns 401 when not authenticated and deletes nothing", async () => {
    await seedDevice(USER, "my-device-token");
    mocks.getSession.mockResolvedValue(null);

    const res = await unregister("my-device-token");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
    expect(await devices()).toHaveLength(1);
  });

  it("returns success even when the token does not exist", async () => {
    await seedDevice(USER, "token-a");

    const res = await unregister("nonexistent-token");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(await devices()).toHaveLength(1);
  });

  it("matches a url-encoded Expo token exactly", async () => {
    await seedDevice(USER, "ExponentPushToken[abc/def]");

    const res = await unregister("ExponentPushToken[abc/def]");

    expect(res.status).toBe(200);
    expect(await devices()).toEqual([]);
  });
});

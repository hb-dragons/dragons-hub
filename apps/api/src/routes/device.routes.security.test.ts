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
// Deliberately NOT mocking drizzle-orm or @dragons/db/schema (device.routes.test.ts
// does, which makes the conflict clause unobservable): this file asserts the row
// that actually survives in `push_devices`, so the upsert runs for real on PGlite.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  warn: vi.fn(),
}));

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
  logger: { error: vi.fn(), info: vi.fn(), warn: mocks.warn },
}));

// --- Imports (after mocks) ---

import { deviceRoutes } from "./device.routes";
import { errorHandler } from "../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", deviceRoutes);

const VICTIM = "user-victim";
const ATTACKER = "user-attacker";
const STOLEN_TOKEN = "ExponentPushToken[victim-device]";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    user: { id: ATTACKER, role: "user" },
    session: { id: "sess-attacker" },
  });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function devices(): Promise<
  Array<{ user_id: string; token: string; platform: string; locale: string | null }>
> {
  const rows = await ctx.client.query<{
    user_id: string;
    token: string;
    platform: string;
    locale: string | null;
  }>("SELECT user_id, token, platform, locale FROM push_devices ORDER BY id");
  return rows.rows;
}

async function seedVictimDevice(): Promise<void> {
  await ctx.client.query(
    "INSERT INTO push_devices (user_id, token, platform, locale) VALUES ($1, $2, 'ios', 'de-DE')",
    [VICTIM, STOLEN_TOKEN],
  );
}

function register(body: unknown) {
  return app.request("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /register — push token takeover", () => {
  it("rejects a token already bound to another user with 409", async () => {
    await seedVictimDevice();

    const res = await register({
      token: STOLEN_TOKEN,
      platform: "android",
      locale: "en-US",
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Push token is registered to a different account",
      code: "TOKEN_OWNED_BY_ANOTHER_USER",
    });
  });

  it("leaves the victim's device row untouched", async () => {
    await seedVictimDevice();

    await register({ token: STOLEN_TOKEN, platform: "android", locale: "en-US" });

    expect(await devices()).toEqual([
      {
        user_id: VICTIM,
        token: STOLEN_TOKEN,
        platform: "ios",
        locale: "de-DE",
      },
    ]);
  });

  it("audits the rejected takeover attempt", async () => {
    await seedVictimDevice();

    await register({ token: STOLEN_TOKEN, platform: "android" });

    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ATTACKER }),
      expect.stringContaining("another user"),
    );
  });

  it("does not log the raw token when rejecting", async () => {
    await seedVictimDevice();

    await register({ token: STOLEN_TOKEN, platform: "android" });

    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(STOLEN_TOKEN);
  });

  it("still lets the owner re-register their own token", async () => {
    await ctx.client.query(
      "INSERT INTO push_devices (user_id, token, platform, locale) VALUES ($1, $2, 'ios', 'de-DE')",
      [ATTACKER, STOLEN_TOKEN],
    );

    const res = await register({
      token: STOLEN_TOKEN,
      platform: "android",
      locale: "en-US",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(await devices()).toEqual([
      {
        user_id: ATTACKER,
        token: STOLEN_TOKEN,
        platform: "android",
        locale: "en-US",
      },
    ]);
  });

  it("registers a brand new token normally", async () => {
    const res = await register({ token: "ExponentPushToken[fresh]", platform: "ios" });

    expect(res.status).toBe(200);
    expect(await devices()).toEqual([
      {
        user_id: ATTACKER,
        token: "ExponentPushToken[fresh]",
        platform: "ios",
        locale: null,
      },
    ]);
  });

  it("lets the victim reclaim the token after unregistering it", async () => {
    await seedVictimDevice();

    // Victim unregisters (the logout path), then the attacker's device may claim it.
    mocks.getSession.mockResolvedValue({
      user: { id: VICTIM, role: "user" },
      session: { id: "sess-victim" },
    });
    const del = await app.request(`/${encodeURIComponent(STOLEN_TOKEN)}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);

    mocks.getSession.mockResolvedValue({
      user: { id: ATTACKER, role: "user" },
      session: { id: "sess-attacker" },
    });
    const res = await register({ token: STOLEN_TOKEN, platform: "android" });

    expect(res.status).toBe(200);
    expect((await devices())[0]?.user_id).toBe(ATTACKER);
  });
});

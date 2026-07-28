import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked — the route
// this service was extracted from ran a real upsert with a `setWhere` ownership
// fold plus a scoped DELETE; a stubbed `eq`/`and` would make neither predicate
// observable. Everything below runs against a real in-process PGlite Postgres.

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

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// --- Imports (after mocks) ---

import { registerPushDevice, unregisterPushDevice } from "./push-device.service";
import { pushDevices } from "@dragons/db/schema";
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
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function devices() {
  return ctx.db
    .select({
      userId: pushDevices.userId,
      token: pushDevices.token,
      platform: pushDevices.platform,
      locale: pushDevices.locale,
    })
    .from(pushDevices)
    .orderBy(pushDevices.token);
}

describe("registerPushDevice", () => {
  it("inserts a new device row", async () => {
    await registerPushDevice({ userId: "u1", token: "tok", platform: "ios" });

    expect(await devices()).toEqual([
      { userId: "u1", token: "tok", platform: "ios", locale: null },
    ]);
  });

  // This is the race-safety property the `setWhere` fold on the upsert exists
  // for: a token owned by u1 cannot be reassigned to u2 by re-registering it.
  it("rejects a token already registered to another account", async () => {
    await registerPushDevice({ userId: "u1", token: "tok", platform: "ios" });

    await expect(
      registerPushDevice({ userId: "u2", token: "tok", platform: "ios" }),
    ).rejects.toMatchObject({ code: "TOKEN_OWNED_BY_ANOTHER_USER", status: 409 });

    // The conflicting write changed nothing: the row still belongs to u1.
    expect(await devices()).toEqual([
      { userId: "u1", token: "tok", platform: "ios", locale: null },
    ]);
  });

  it("lets the rightful owner re-register", async () => {
    await registerPushDevice({ userId: "u1", token: "tok", platform: "ios" });

    await expect(
      registerPushDevice({ userId: "u1", token: "tok", platform: "android" }),
    ).resolves.toBeUndefined();

    expect(await devices()).toEqual([
      { userId: "u1", token: "tok", platform: "android", locale: null },
    ]);
  });

  it("updates locale on re-register", async () => {
    await registerPushDevice({ userId: "u1", token: "tok", platform: "ios" });

    await registerPushDevice({
      userId: "u1",
      token: "tok",
      platform: "ios",
      locale: "de-DE",
    });

    expect(await devices()).toEqual([
      { userId: "u1", token: "tok", platform: "ios", locale: "de-DE" },
    ]);
  });
});

describe("unregisterPushDevice", () => {
  it("deletes the caller's own device token", async () => {
    await registerPushDevice({ userId: "u1", token: "tok", platform: "ios" });

    await unregisterPushDevice("u1", "tok");

    expect(await devices()).toEqual([]);
  });

  it("does not delete another user's device with the same token value", async () => {
    await registerPushDevice({ userId: "u1", token: "tok", platform: "ios" });

    await unregisterPushDevice("u2", "tok");

    expect(await devices()).toEqual([
      { userId: "u1", token: "tok", platform: "ios", locale: null },
    ]);
  });

  it("resolves without error when the token does not exist", async () => {
    await expect(unregisterPushDevice("u1", "nonexistent")).resolves.toBeUndefined();
  });
});

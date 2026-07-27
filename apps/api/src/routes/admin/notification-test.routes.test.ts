import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import type { AppEnv } from "../../types";
import type * as ExpoPushClientModule from "../../services/notifications/expo-push.client";

// --- Mocks (hoisted before imports) ---
//
// Deliberately NOT mocking drizzle-orm, @dragons/db/schema or the rbac
// middleware. Every DB touch in this route is a scoping decision — devices are
// `WHERE user_id = caller`, the channel lookup is `WHERE type = 'push'`, and
// /recent is a LIKE over an `admin_test:<caller>:` prefix. Under the identity
// stubs the prefix could be widened to `admin_test:%` (every admin's test
// pushes, tokens included, leaking to any admin) with all 15 tests still green.
// The transactional domain_events + notification_log write also only proves
// anything against real foreign keys.
//
// Redis (cooldown) and the Expo HTTP client stay stubbed: neither is DB state.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  userHasPermission: vi.fn(),
  sendBatch: vi.fn(),
  redisStore: new Map<string, string>(),
}));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../config/redis", () => ({
  getRedis: () => ({
    async set(key: string, value: string, _ex?: string, _ttl?: number, mode?: string) {
      if (mode === "NX" && mocks.redisStore.has(key)) return null;
      mocks.redisStore.set(key, value);
      return "OK";
    },
    async ttl(_key: string) {
      return 9;
    },
  }),
}));

vi.mock("../../config/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
      userHasPermission: (...args: unknown[]) => mocks.userHasPermission(...args),
    },
  },
}));

vi.mock("../../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.mock("../../services/notifications/expo-push.client", async (importOriginal) => {
  const original = await importOriginal<typeof ExpoPushClientModule>();
  return {
    ...original,
    ExpoPushClient: class {
      sendBatch(messages: unknown[]) {
        return mocks.sendBatch(messages);
      }
    },
  };
});

// --- Imports (after mocks) ---

import { notificationTestRoutes } from "./notification-test.routes";
import { errorHandler } from "../../middleware/error";
import {
  channelConfigs,
  domainEvents,
  notificationLog,
  pushDevices,
} from "@dragons/db/schema";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", notificationTestRoutes);

const ADMIN = "u_admin";
const OTHER_ADMIN = "u_other_admin";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mocks.redisStore.clear();
  mocks.getSession.mockResolvedValue({
    user: { id: ADMIN, role: "admin" },
    session: { id: "sess-admin" },
  });
  mocks.userHasPermission.mockResolvedValue({ success: true });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

function asUser(id: string, role = "admin"): void {
  mocks.getSession.mockResolvedValue({ user: { id, role }, session: { id: `sess-${id}` } });
}

async function seedPushChannel(): Promise<number> {
  const [row] = await ctx.db
    .insert(channelConfigs)
    .values({ name: "Push", type: "push", config: {} as never })
    .returning({ id: channelConfigs.id });
  return row!.id;
}

async function seedDevice(
  userId: string,
  token: string,
  platform = "ios",
  locale: string | null = "de-DE",
): Promise<void> {
  await ctx.db.insert(pushDevices).values({ userId, token, platform, locale });
}

/** A previously-logged test push for `owner`, so /recent has something to scope. */
async function seedLoggedTestPush(
  owner: string,
  opts: { suffix?: string; token?: string; sentAt?: Date | null; status?: string } = {},
): Promise<void> {
  const channelId = await seedPushChannel();
  const eventId = `admin_test:${owner}:${opts.suffix ?? "01"}`;
  await ctx.db.insert(domainEvents).values({
    id: eventId,
    type: "admin.test_push",
    source: "manual",
    urgency: "immediate",
    occurredAt: new Date(),
    actor: owner,
    entityType: "user",
    entityId: 0,
    entityName: "admin test",
    deepLinkPath: "/",
    payload: {},
  });
  await ctx.db.insert(notificationLog).values({
    eventId,
    channelConfigId: channelId,
    recipientId: owner,
    recipientToken: opts.token ?? `ExponentPushToken[${owner}]`,
    title: "Dragons — Test",
    body: "hi",
    locale: "de",
    status: opts.status ?? "sent_ticket",
    sentAt: opts.sentAt === undefined ? new Date() : opts.sentAt,
  });
}

function post(body: unknown = {}) {
  return app.request("/notifications/test-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function logRows(): Promise<
  Array<{ event_id: string; recipient_id: string | null; recipient_token: string | null; status: string; provider_ticket_id: string | null }>
> {
  const rows = await ctx.client.query<{
    event_id: string;
    recipient_id: string | null;
    recipient_token: string | null;
    status: string;
    provider_ticket_id: string | null;
  }>(
    "SELECT event_id, recipient_id, recipient_token, status, provider_ticket_id FROM notification_log ORDER BY id",
  );
  return rows.rows;
}

describe("POST /notifications/test-push — authorization", () => {
  it("returns 401 when there is no session", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
  });

  it("returns 403 when the caller lacks settings:update", async () => {
    mocks.userHasPermission.mockResolvedValue({ success: false });
    expect((await post()).status).toBe(403);
  });
});

describe("POST /notifications/test-push — device scoping", () => {
  it("returns 400 when the admin has no devices", async () => {
    await seedPushChannel();

    const res = await post();

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "no_devices" });
  });

  it("returns 400 when only another user has devices", async () => {
    await seedPushChannel();
    await seedDevice(OTHER_ADMIN, "ExponentPushToken[not-mine]");

    const res = await post();

    // An unscoped device SELECT would happily push to somebody else's phone.
    expect(res.status).toBe(400);
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it("sends only to the caller's own devices", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[mine]");
    await seedDevice(OTHER_ADMIN, "ExponentPushToken[theirs]");
    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt_1" }]);

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deviceCount: 1 });
    const sent = mocks.sendBatch.mock.calls[0]![0] as Array<{ to: string }>;
    expect(sent.map((m) => m.to)).toEqual(["ExponentPushToken[mine]"]);
  });

  it("returns 500 when no push channel config exists", async () => {
    await seedDevice(ADMIN, "ExponentPushToken[x]");

    const res = await post();

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "push_channel_missing" });
  });

  it("ignores channel configs of other types", async () => {
    await seedDevice(ADMIN, "ExponentPushToken[x]");
    await ctx.db
      .insert(channelConfigs)
      .values({ name: "WhatsApp", type: "whatsapp_group", config: {} as never });

    const res = await post();

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "push_channel_missing" });
  });
});

describe("POST /notifications/test-push — persisted audit trail", () => {
  it("writes a domain_events row and a notification_log row for the device", async () => {
    const channelId = await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[x1]");
    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt_1" }]);

    const res = await post({ message: "hello" });

    expect(res.status).toBe(200);
    const events = await ctx.db.select().from(domainEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "admin.test_push", actor: ADMIN });
    expect(events[0]!.id).toMatch(/^admin_test:u_admin:/);

    const rows = await logRows();
    expect(rows).toEqual([
      {
        event_id: events[0]!.id,
        recipient_id: ADMIN,
        recipient_token: "ExponentPushToken[x1]",
        status: "sent_ticket",
        provider_ticket_id: "tkt_1",
      },
    ]);
    const logged = await ctx.db.select().from(notificationLog);
    expect(logged[0]!.channelConfigId).toBe(channelId);
    expect(logged[0]!.body).toBe("hello");
  });

  it("writes one aggregate log row — not one per device — for a two-device admin", async () => {
    // A notification_log row is one *send*, not one device: every row of one
    // send shares (event_id, channel_config_id, recipient_id), the tuple
    // `notification_log_dedup_idx` (migration 0018) declares UNIQUE. Writing a
    // row per device violated it and 500'd every multi-device admin (#122).
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[x1]");
    await seedDevice(ADMIN, "ExponentPushToken[x2]", "android", null);
    mocks.sendBatch.mockResolvedValueOnce([
      { status: "ok", id: "tkt_1" },
      { status: "ok", id: "tkt_2" },
    ]);

    const res = await post({ message: "hello" });
    const body = (await res.json()) as {
      deviceCount: number;
      tickets: Array<{
        platform: string;
        status: string;
        ticketId: string | null;
        error: string | null;
      }>;
    };

    expect(res.status).toBe(200);
    // Both devices were pushed to, and the response still reports each one.
    expect(body.deviceCount).toBe(2);
    expect(body.tickets).toEqual([
      { platform: "ios", status: "sent_ticket", ticketId: "tkt_1", error: null },
      { platform: "android", status: "sent_ticket", ticketId: "tkt_2", error: null },
    ]);

    const events = await ctx.db.select().from(domainEvents);
    expect(events).toHaveLength(1);
    const rows = await logRows();
    expect(rows).toEqual([
      {
        event_id: events[0]!.id,
        recipient_id: ADMIN,
        // The accepted device is the row's representative.
        recipient_token: "ExponentPushToken[x1]",
        status: "sent_ticket",
        provider_ticket_id: "tkt_1",
      },
    ]);
  });

  it("aggregates to sent_ticket when only the second of two devices is accepted", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[dead]");
    await seedDevice(ADMIN, "ExponentPushToken[live]", "android", "en-GB");
    mocks.sendBatch.mockResolvedValueOnce([
      { status: "error", message: "DeviceNotRegistered" },
      { status: "ok", id: "tkt_2" },
    ]);

    const res = await post();
    const body = (await res.json()) as { tickets: Array<{ status: string }> };

    expect(res.status).toBe(200);
    expect(body.tickets.map((t) => t.status)).toEqual(["failed", "sent_ticket"]);

    const stored = await ctx.db.select().from(notificationLog);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      status: "sent_ticket",
      recipientToken: "ExponentPushToken[live]",
      providerTicketId: "tkt_2",
      // One dead device does not make the send a failure.
      errorMessage: null,
      // The accepted device's locale is the one that was actually rendered.
      locale: "en-GB",
    });
    expect(stored[0]!.sentAt).not.toBeNull();
  });

  it("aggregates to failed, keeping the first error, when every device fails", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[a]", "ios", null);
    await seedDevice(ADMIN, "ExponentPushToken[b]", "android", "de-DE");
    mocks.sendBatch.mockResolvedValueOnce([
      { status: "error", message: "first boom" },
      { status: "error", message: "second boom" },
    ]);

    const res = await post();

    expect(res.status).toBe(200);
    const stored = await ctx.db.select().from(notificationLog);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      status: "failed",
      sentAt: null,
      providerTicketId: null,
      recipientToken: "ExponentPushToken[a]",
      errorMessage: "first boom",
      // The device with a null locale falls back to "de".
      locale: "de",
    });
  });

  it("falls back to the default body when no message is supplied", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[x1]");
    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt_1" }]);

    await post();

    const rows = await ctx.db.select().from(notificationLog);
    expect(rows[0]!.body).toBe("Test push from Dragons admin");
  });

  it("records a per-ticket failure when Expo rejects the message", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[bad]");
    mocks.sendBatch.mockResolvedValueOnce([
      { status: "error", message: "oops", details: { error: "SomeError" } },
    ]);

    const res = await post();
    const body = (await res.json()) as { tickets: Array<{ status: string; error: string }> };

    expect(res.status).toBe(200);
    expect(body.tickets[0]).toMatchObject({ status: "failed", error: "oops" });
    const rows = await ctx.db.select().from(notificationLog);
    expect(rows[0]).toMatchObject({
      status: "failed",
      sentAt: null,
      providerTicketId: null,
      errorMessage: "oops",
    });
  });

  it("returns 200 with all-failed tickets when the Expo call throws", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[a]");
    mocks.sendBatch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await post();
    const body = (await res.json()) as { tickets: Array<{ status: string; error: string }> };

    expect(res.status).toBe(200);
    expect(body.tickets[0]!.status).toBe("failed");
    expect(body.tickets[0]!.error).toMatch(/ECONNREFUSED|unknown/);
    expect((await logRows())[0]!.status).toBe("failed");
  });

  it("handles an ok ticket that carries no ticket id", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[x]");
    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok" }]);

    const res = await post();
    const body = (await res.json()) as {
      tickets: Array<{ status: string; ticketId: string | null }>;
    };

    expect(body.tickets[0]).toMatchObject({ status: "sent_ticket", ticketId: null });
  });

  it("uses 'unknown' as errorMessage when the ticket carries no detail", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[x]");
    mocks.sendBatch.mockResolvedValueOnce([{ status: "error" }]);

    const res = await post();
    const body = (await res.json()) as { tickets: Array<{ error: string }> };

    expect(body.tickets[0]!.error).toBe("unknown");
  });

  it("rate-limits a second test push inside the cooldown window", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[a]");
    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt_1" }]);

    expect((await post()).status).toBe(200);

    const second = await post();
    const body = (await second.json()) as { error: string; retryAfter: number };

    expect(second.status).toBe(429);
    expect(body.error).toBe("rate_limited");
    expect(typeof body.retryAfter).toBe("number");
    expect(second.headers.get("Retry-After")).toBeTruthy();
    // The rejected call must not have written a second batch of log rows.
    expect(await logRows()).toHaveLength(1);
  });
});

describe("GET /notifications/test-push/recent", () => {
  it("returns 401 without a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await app.request("/notifications/test-push/recent")).status).toBe(401);
  });

  it("returns the caller's own test pushes", async () => {
    await seedLoggedTestPush(ADMIN, { token: "ExponentPushToken[abcdef123456]" });

    const res = await app.request("/notifications/test-push/recent");
    const body = (await res.json()) as {
      results: Array<{ recipientToken: string; status: string }>;
    };

    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.recipientToken).toBe("...23456]");
    expect(body.results[0]!.status).toBe("sent_ticket");
  });

  it("does not return another admin's test pushes", async () => {
    await seedLoggedTestPush(OTHER_ADMIN, { token: "ExponentPushToken[theirs]" });

    const res = await app.request("/notifications/test-push/recent");
    const body = (await res.json()) as { results: unknown[] };

    // Widening the LIKE prefix to `admin_test:%` would leak every admin's
    // (masked, but still) tokens and delivery state here.
    expect(body.results).toEqual([]);
  });

  it("does not return non-test notification log rows", async () => {
    const channelId = await seedPushChannel();
    await ctx.db.insert(domainEvents).values({
      id: "match_update_01",
      type: "match.updated",
      source: "sync",
      urgency: "routine",
      occurredAt: new Date(),
      entityType: "match",
      entityId: 1,
      entityName: "Match",
      deepLinkPath: "/",
      payload: {},
    });
    await ctx.db.insert(notificationLog).values({
      eventId: "match_update_01",
      channelConfigId: channelId,
      recipientId: ADMIN,
      recipientToken: "ExponentPushToken[real]",
      title: "t",
      body: "b",
      status: "sent_ticket",
    });

    const res = await app.request("/notifications/test-push/recent");
    const body = (await res.json()) as { results: unknown[] };

    expect(body.results).toEqual([]);
  });

  it("treats a caller id containing LIKE wildcards literally", async () => {
    // `escapeLikePattern` is why `a%` cannot match `ab`'s rows.
    await seedLoggedTestPush("ab", { token: "ExponentPushToken[victim]" });
    asUser("a%");

    const res = await app.request("/notifications/test-push/recent");
    const body = (await res.json()) as { results: unknown[] };

    expect(body.results).toEqual([]);
  });

  it("falls back to createdAt when sentAt is null", async () => {
    await seedLoggedTestPush(ADMIN, { sentAt: null, status: "failed" });

    const res = await app.request("/notifications/test-push/recent");
    const body = (await res.json()) as { results: Array<{ sentAt: string }> };
    const [stored] = await ctx.db.select().from(notificationLog);

    expect(body.results[0]!.sentAt).toBe(stored!.createdAt.toISOString());
  });

  it("masks a null token as null", async () => {
    await seedLoggedTestPush(ADMIN);
    await ctx.client.query("UPDATE notification_log SET recipient_token = NULL");

    const res = await app.request("/notifications/test-push/recent");
    const body = (await res.json()) as { results: Array<{ recipientToken: string | null }> };

    expect(body.results[0]!.recipientToken).toBeNull();
  });

  it("masks a short token rather than echoing it", async () => {
    await seedLoggedTestPush(ADMIN, { token: "abc" });

    const res = await app.request("/notifications/test-push/recent");
    const body = (await res.json()) as { results: Array<{ recipientToken: string }> };

    expect(body.results[0]!.recipientToken).toBe("...bc");
    expect(body.results[0]!.recipientToken).not.toBe("abc");
  });

  it("returns the newest rows first, capped at 10", async () => {
    for (let i = 0; i < 12; i++) {
      await seedLoggedTestPush(ADMIN, {
        suffix: String(i).padStart(2, "0"),
        token: `ExponentPushToken[dev${String(i).padStart(2, "0")}]`,
      });
    }

    const res = await app.request("/notifications/test-push/recent");
    const body = (await res.json()) as { results: Array<{ id: number }> };

    expect(body.results).toHaveLength(10);
    const ids = body.results.map((r) => r.id);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
  });
});

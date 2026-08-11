import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type * as ExpoPushClientModule from "./expo-push.client";

// --- Mocks (hoisted before imports) ---
//
// Deliberately NOT mocking drizzle-orm or @dragons/db/schema — every DB touch
// here is a scoping decision (devices are `WHERE user_id = caller`, the
// channel lookup is `WHERE type = 'push'`, /recent is a LIKE over an
// `admin_test:<caller>:` prefix) and the transactional domain_events +
// notification_log write only proves anything against real foreign keys.
//
// The Expo HTTP client stays stubbed: it is not DB state, and hitting the
// real API would make the suite flaky and slow.

const mocks = vi.hoisted(() => ({ sendBatch: vi.fn() }));

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
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.mock("./expo-push.client", async (importOriginal) => {
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

import { sendAdminTestPush, listRecentTestPushes } from "./test-push.service";
import { TestPushError } from "./test-push.errors";
import {
  channelConfigs,
  domainEvents,
  notificationLog,
  pushDevices,
} from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

const ADMIN = "u1";
const OTHER_ADMIN = "u_other";

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

/**
 * `channelConfigs.config` is `jsonb(...).notNull().$type<ChannelConfig>()`,
 * a union with no empty member — `{}` satisfies none of `InAppConfig`,
 * `WhatsAppGroupConfig`, `PushConfig` or `EmailConfig`. The brief's seed
 * (`config: {}`) does not typecheck; a real push config does.
 */
async function seedPushChannel(): Promise<number> {
  const [row] = await ctx.db
    .insert(channelConfigs)
    .values({ name: "Push", type: "push", config: { provider: "expo" } })
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

describe("sendAdminTestPush — device scoping", () => {
  it("throws NO_DEVICES when the admin has registered none", async () => {
    await seedPushChannel();

    await expect(sendAdminTestPush({ callerId: ADMIN })).rejects.toMatchObject({
      code: "NO_DEVICES",
      status: 400,
    });
  });

  it("rejects with NO_DEVICES via the real error class", async () => {
    await seedPushChannel();

    await expect(sendAdminTestPush({ callerId: ADMIN })).rejects.toBeInstanceOf(
      TestPushError,
    );
  });

  it("throws NO_DEVICES when only another user has devices", async () => {
    await seedPushChannel();
    await seedDevice(OTHER_ADMIN, "ExponentPushToken[not-mine]");

    // An unscoped device SELECT would happily push to somebody else's phone.
    await expect(sendAdminTestPush({ callerId: ADMIN })).rejects.toMatchObject({
      code: "NO_DEVICES",
    });
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it("sends only to the caller's own devices", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[mine]");
    await seedDevice(OTHER_ADMIN, "ExponentPushToken[theirs]");
    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt_1" }]);

    const result = await sendAdminTestPush({ callerId: ADMIN });

    expect(result.deviceCount).toBe(1);
    const sent = mocks.sendBatch.mock.calls[0]![0] as Array<{ to: string }>;
    expect(sent.map((m) => m.to)).toEqual(["ExponentPushToken[mine]"]);
  });

  it("throws PUSH_CHANNEL_MISSING when no push channel config exists", async () => {
    await seedDevice(ADMIN, "ExponentPushToken[x]");

    await expect(sendAdminTestPush({ callerId: ADMIN })).rejects.toMatchObject({
      code: "PUSH_CHANNEL_MISSING",
      status: 500,
    });
  });

  it("ignores channel configs of other types", async () => {
    await seedDevice(ADMIN, "ExponentPushToken[x]");
    await ctx.db
      .insert(channelConfigs)
      .values({ name: "WhatsApp", type: "whatsapp_group", config: { groupId: "g", locale: "de" } });

    await expect(sendAdminTestPush({ callerId: ADMIN })).rejects.toMatchObject({
      code: "PUSH_CHANNEL_MISSING",
    });
  });

  it("ignores soft-deleted push channel configs", async () => {
    await seedDevice(ADMIN, "ExponentPushToken[x]");
    await ctx.db.insert(channelConfigs).values({
      name: "Retired push",
      type: "push",
      config: { provider: "expo" },
      deletedAt: new Date(),
    });

    await expect(sendAdminTestPush({ callerId: ADMIN })).rejects.toMatchObject({
      code: "PUSH_CHANNEL_MISSING",
    });
  });
});

describe("sendAdminTestPush — persisted audit trail", () => {
  it("writes a domain_events row and a notification_log row for the device", async () => {
    const channelId = await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[x1]");
    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt_1" }]);

    const result = await sendAdminTestPush({ callerId: ADMIN, message: "hello" });

    expect(result.deviceCount).toBe(1);
    const events = await ctx.db.select().from(domainEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "admin.test_push", actor: ADMIN });
    expect(events[0]!.id).toMatch(/^admin_test:u1:/);

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

  // The regression guard for issue #122: `notification_log_dedup_idx`
  // (migration 0018) makes (event_id, channel_config_id,
  // COALESCE(recipient_id, '__group__')) UNIQUE, so a row *is* "this
  // notification, for this recipient, on this channel" — not one row per
  // device. Writing a row per device 500'd every admin with two or more
  // devices. Step 10 of the task brief proved this earns its place: switching
  // the service to insert per-device made this test fail with a 23505 unique
  // violation, then the revert restored green — see the task report for the
  // literal output.
  it("writes exactly one notification_log row for a multi-device send", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[x1]");
    await seedDevice(ADMIN, "ExponentPushToken[x2]", "android", null);
    mocks.sendBatch.mockResolvedValueOnce([
      { status: "ok", id: "tkt_1" },
      { status: "ok", id: "tkt_2" },
    ]);

    await sendAdminTestPush({ callerId: ADMIN, message: "hello" });

    const rows = await ctx.db.select().from(notificationLog);
    expect(rows).toHaveLength(1);
  });

  it("aggregates to sent_ticket when only the second of two devices is accepted", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[dead]");
    await seedDevice(ADMIN, "ExponentPushToken[live]", "android", "en-GB");
    mocks.sendBatch.mockResolvedValueOnce([
      { status: "error", message: "DeviceNotRegistered" },
      { status: "ok", id: "tkt_2" },
    ]);

    const result = await sendAdminTestPush({ callerId: ADMIN });

    expect(result.tickets.map((t) => t.status)).toEqual(["failed", "sent_ticket"]);

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

    await sendAdminTestPush({ callerId: ADMIN });

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

    await sendAdminTestPush({ callerId: ADMIN });

    const rows = await ctx.db.select().from(notificationLog);
    expect(rows[0]!.body).toBe("Test push from Dragons admin");
  });

  it("records a per-ticket failure when Expo rejects the message", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[bad]");
    mocks.sendBatch.mockResolvedValueOnce([
      { status: "error", message: "oops", details: { error: "SomeError" } },
    ]);

    const result = await sendAdminTestPush({ callerId: ADMIN });

    expect(result.tickets[0]).toMatchObject({ status: "failed", error: "oops" });
    const rows = await ctx.db.select().from(notificationLog);
    expect(rows[0]).toMatchObject({
      status: "failed",
      sentAt: null,
      providerTicketId: null,
      errorMessage: "oops",
    });
  });

  it("returns all-failed tickets when the Expo call throws", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[a]");
    mocks.sendBatch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await sendAdminTestPush({ callerId: ADMIN });

    expect(result.tickets[0]!.status).toBe("failed");
    expect(result.tickets[0]!.error).toMatch(/ECONNREFUSED|unknown/);
    expect((await logRows())[0]!.status).toBe("failed");
  });

  it("handles an ok ticket that carries no ticket id", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[x]");
    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok" }]);

    const result = await sendAdminTestPush({ callerId: ADMIN });

    expect(result.tickets[0]).toMatchObject({ status: "sent_ticket", ticketId: null });
  });

  it("uses 'unknown' as errorMessage when the ticket carries no detail", async () => {
    await seedPushChannel();
    await seedDevice(ADMIN, "ExponentPushToken[x]");
    mocks.sendBatch.mockResolvedValueOnce([{ status: "error" }]);

    const result = await sendAdminTestPush({ callerId: ADMIN });

    expect(result.tickets[0]!.error).toBe("unknown");
  });
});

describe("listRecentTestPushes", () => {
  it("returns the caller's own test pushes", async () => {
    await seedLoggedTestPush(ADMIN, { token: "ExponentPushToken[abcdef123456]" });

    const rows = await listRecentTestPushes(ADMIN);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipientToken).toBe("...23456]");
    expect(rows[0]!.status).toBe("sent_ticket");
  });

  it("does not return another admin's test pushes", async () => {
    await seedLoggedTestPush(OTHER_ADMIN, { token: "ExponentPushToken[theirs]" });

    // Widening the LIKE prefix to `admin_test:%` would leak every admin's
    // (masked, but still) tokens and delivery state here.
    expect(await listRecentTestPushes(ADMIN)).toEqual([]);
  });

  it("does not return non-test notification log rows", async () => {
    const channelId = await seedPushChannel();
    await ctx.db.insert(domainEvents).values({
      id: "match_update_01",
      type: "match.created",
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

    expect(await listRecentTestPushes(ADMIN)).toEqual([]);
  });

  it("treats a caller id containing LIKE wildcards literally", async () => {
    // `escapeLikePattern` is why `a%` cannot match `ab`'s rows.
    await seedLoggedTestPush("ab", { token: "ExponentPushToken[victim]" });

    expect(await listRecentTestPushes("a%")).toEqual([]);
  });

  it("falls back to createdAt when sentAt is null", async () => {
    await seedLoggedTestPush(ADMIN, { sentAt: null, status: "failed" });

    const [stored] = await ctx.db.select().from(notificationLog);
    const rows = await listRecentTestPushes(ADMIN);

    expect(rows[0]!.sentAt).toEqual(stored!.createdAt);
  });

  it("masks a null token as null", async () => {
    await seedLoggedTestPush(ADMIN);
    await ctx.client.query("UPDATE notification_log SET recipient_token = NULL");

    const rows = await listRecentTestPushes(ADMIN);

    expect(rows[0]!.recipientToken).toBeNull();
  });

  it("masks a short token rather than echoing it", async () => {
    await seedLoggedTestPush(ADMIN, { token: "abc" });

    const rows = await listRecentTestPushes(ADMIN);

    expect(rows[0]!.recipientToken).toBe("...bc");
    expect(rows[0]!.recipientToken).not.toBe("abc");
  });

  // The brief's own version of this test reads `rows[0]` against an empty
  // database (`resetTestDb` runs in `beforeEach`) — `rows[0]?.recipientToken`
  // is `undefined`, and `expect(undefined).toMatch(...)` fails outright rather
  // than passing green. Seed a row with a token long enough that masking is
  // observable, and assert both ends: the "..." prefix and that the last six
  // characters survive. Asserting the prefix alone would pass for a function
  // that always returns the literal string "...".
  it("masks all but the last six characters of a long token", async () => {
    const longToken = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx654321]";
    await seedLoggedTestPush(ADMIN, { token: longToken });

    const rows = await listRecentTestPushes(ADMIN);

    expect(rows[0]?.recipientToken).toMatch(/^\.\.\./);
    expect(rows[0]?.recipientToken).toBe("..." + longToken.slice(-6));
    expect(rows[0]?.recipientToken).toBe("...54321]");
  });

  it("returns the newest rows first, capped at 10", async () => {
    for (let i = 0; i < 12; i++) {
      await seedLoggedTestPush(ADMIN, {
        suffix: String(i).padStart(2, "0"),
        token: `ExponentPushToken[dev${String(i).padStart(2, "0")}]`,
      });
    }

    const rows = await listRecentTestPushes(ADMIN);

    expect(rows).toHaveLength(10);
    const ids = rows.map((r) => r.id);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
  });
});

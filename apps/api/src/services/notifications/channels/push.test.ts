import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../../config/database", () => ({
  db: new Proxy(
    {},
    { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] },
  ),
}));

vi.mock("../../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

// --- Imports (after mocks) ---

import { PushChannelAdapter } from "./push";
import type { ExpoPushClient, ExpoPushTicket } from "../expo-push.client";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../../test/setup-test-db";

let ctx: TestDbContext;

const sendBatch = vi.fn<(messages: unknown[]) => Promise<ExpoPushTicket[]>>();
const mockClient = { sendBatch } as unknown as ExpoPushClient;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

async function insertPrerequisites() {
  await ctx.client.exec(`
    INSERT INTO domain_events (id, type, source, urgency, occurred_at, entity_type, entity_id, entity_name, deep_link_path, payload)
    VALUES ('evt-001', 'referee.assigned', 'sync', 'immediate', NOW(), 'match', 1, 'Test Match', '/matches/1', '{}');
  `);
  await ctx.client.exec(`INSERT INTO channel_configs (id, name, type, config) VALUES (1, 'push-channel', 'push', '{}');`);
}

async function seedDevice(userId: string, token: string, locale: string | null = "de-DE") {
  const localeSql = locale === null ? "NULL" : `'${locale}'`;
  await ctx.client.exec(
    `INSERT INTO push_devices (user_id, token, platform, locale) VALUES ('${userId}', '${token}', 'ios', ${localeSql});`,
  );
}

async function seedPref(userId: string, opts: { locale?: string; muted?: string[] } = {}) {
  const locale = opts.locale ?? "de";
  const muted = opts.muted ?? [];
  const mutedSql =
    muted.length === 0 ? "ARRAY[]::text[]" : `ARRAY[${muted.map((m) => `'${m}'`).join(",")}]::text[]`;
  await ctx.client.exec(
    `INSERT INTO user_notification_preferences (user_id, locale, muted_event_types) VALUES ('${userId}', '${locale}', ${mutedSql});`,
  );
}

beforeEach(async () => {
  await resetTestDb(ctx);
  await insertPrerequisites();
  sendBatch.mockReset();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function getLogs() {
  const result = await ctx.client.query("SELECT * FROM notification_log ORDER BY id");
  return result.rows as Record<string, unknown>[];
}

const payload = {
  matchId: 1,
  matchNo: "0001",
  homeTeam: "Dragons",
  guestTeam: "Foes",
  slot: "SR1",
  kickoffDate: "2026-05-01",
  kickoffTime: "14:00",
  eventId: "evt-001",
};

function baseParams(recipientUserIds: string[]) {
  return {
    eventId: "evt-001",
    eventType: "referee.assigned",
    payload,
    watchRuleId: null,
    channelConfigId: 1,
    recipientUserIds,
  };
}

describe("PushChannelAdapter", () => {
  it("returns success with sent=0 and skips DB when event type has no template", async () => {
    const adapter = new PushChannelAdapter(mockClient);
    const result = await adapter.send({ ...baseParams(["user_a"]), eventType: "match.scoreUpdated" });

    expect(result).toEqual({ success: true, sent: 0, failed: 0 });
    expect(sendBatch).not.toHaveBeenCalled();
    expect(await getLogs()).toHaveLength(0);
  });

  it("returns success with sent=0 for an empty recipient list", async () => {
    const adapter = new PushChannelAdapter(mockClient);
    const result = await adapter.send(baseParams([]));

    expect(result).toEqual({ success: true, sent: 0, failed: 0 });
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("skips silently when the recipient has no push devices", async () => {
    const adapter = new PushChannelAdapter(mockClient);
    const result = await adapter.send(baseParams(["user_a"]));

    expect(result).toEqual({ success: true, sent: 0, failed: 0 });
    expect(sendBatch).not.toHaveBeenCalled();
    expect(await getLogs()).toHaveLength(0);
  });

  it("sends to all of a user's devices but collapses to ONE per-user log row", async () => {
    await seedDevice("user_a", "ExponentPushToken[a1]");
    await seedDevice("user_a", "ExponentPushToken[a2]");
    sendBatch.mockResolvedValueOnce([
      { status: "ok", id: "tkt_a1" },
      { status: "ok", id: "tkt_a2" },
    ]);

    const adapter = new PushChannelAdapter(mockClient);
    const result = await adapter.send(baseParams(["user_a"]));

    expect(result).toEqual({ success: true, sent: 2, failed: 0 });
    expect(sendBatch).toHaveBeenCalledTimes(1);
    const sent = sendBatch.mock.calls[0]![0] as Array<{ to: string }>;
    expect(sent.map((m) => m.to)).toEqual(["ExponentPushToken[a1]", "ExponentPushToken[a2]"]);

    const rows = await getLogs();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipient_id).toBe("user_a");
    expect(rows[0]!.status).toBe("sent_ticket");
    expect(rows[0]!.sent_at).not.toBeNull();
    expect(rows[0]!.provider_ticket_id).toBe("tkt_a1");
  });

  it("deduplicates: a re-processed event sends nothing and leaves one row", async () => {
    await seedDevice("user_a", "ExponentPushToken[a1]");
    sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt_a1" }]);

    const adapter = new PushChannelAdapter(mockClient);
    const first = await adapter.send(baseParams(["user_a"]));
    expect(first).toEqual({ success: true, sent: 1, failed: 0 });
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(await getLogs()).toHaveLength(1);

    const second = await adapter.send(baseParams(["user_a"]));
    expect(second).toEqual({ success: true, sent: 0, failed: 0 });
    expect(sendBatch).toHaveBeenCalledTimes(1); // NOT re-sent
    expect(await getLogs()).toHaveLength(1);
  });

  it("claims independently per user: a fresh user still sends when another is a duplicate", async () => {
    await seedDevice("user_a", "ExponentPushToken[a1]");
    sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt_a1" }]);

    const adapter = new PushChannelAdapter(mockClient);
    await adapter.send(baseParams(["user_a"]));
    expect(sendBatch).toHaveBeenCalledTimes(1);

    await seedDevice("user_b", "ExponentPushToken[b1]");
    sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt_b1" }]);

    const result = await adapter.send(baseParams(["user_a", "user_b"]));
    expect(result).toEqual({ success: true, sent: 1, failed: 0 });
    expect(sendBatch).toHaveBeenCalledTimes(2);
    const secondCall = sendBatch.mock.calls[1]![0] as Array<{ to: string }>;
    expect(secondCall.map((m) => m.to)).toEqual(["ExponentPushToken[b1]"]); // only user_b

    const rows = await getLogs();
    expect(rows).toHaveLength(2);
  });

  it("marks the user row sent_ticket when at least one device succeeds", async () => {
    await seedDevice("user_a", "ExponentPushToken[ok]");
    await seedDevice("user_a", "ExponentPushToken[bad]");
    sendBatch.mockResolvedValueOnce([
      { status: "ok", id: "tkt_ok" },
      { status: "error", message: "DeviceNotRegistered", details: { error: "DeviceNotRegistered" } },
    ]);

    const adapter = new PushChannelAdapter(mockClient);
    const result = await adapter.send(baseParams(["user_a"]));

    expect(result).toEqual({ success: false, sent: 1, failed: 1 });
    const rows = await getLogs();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("sent_ticket");
    expect(rows[0]!.provider_ticket_id).toBe("tkt_ok");
  });

  it("marks the user row failed when every device fails", async () => {
    await seedDevice("user_a", "ExponentPushToken[bad]");
    sendBatch.mockResolvedValueOnce([
      { status: "error", message: "DeviceNotRegistered", details: { error: "DeviceNotRegistered" } },
    ]);

    const adapter = new PushChannelAdapter(mockClient);
    const result = await adapter.send(baseParams(["user_a"]));

    expect(result).toEqual({ success: false, sent: 0, failed: 1 });
    const rows = await getLogs();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("failed");
    expect(rows[0]!.sent_at).toBeNull();
    expect(rows[0]!.error_message).toContain("DeviceNotRegistered");
  });

  it("uses 'unknown' as error_message when an error ticket carries no detail", async () => {
    await seedDevice("user_a", "ExponentPushToken[a]");
    sendBatch.mockResolvedValueOnce([{ status: "error" }]);

    const adapter = new PushChannelAdapter(mockClient);
    const result = await adapter.send(baseParams(["user_a"]));

    expect(result.success).toBe(false);
    const rows = await getLogs();
    expect(rows[0]!.error_message).toBe("unknown");
  });

  it("stores a null provider_ticket_id when an ok ticket has no id", async () => {
    await seedDevice("user_a", "ExponentPushToken[a]");
    sendBatch.mockResolvedValueOnce([{ status: "ok" }]);

    const adapter = new PushChannelAdapter(mockClient);
    const result = await adapter.send(baseParams(["user_a"]));

    expect(result.sent).toBe(1);
    const rows = await getLogs();
    expect(rows[0]!.status).toBe("sent_ticket");
    expect(rows[0]!.provider_ticket_id).toBeNull();
  });

  it("respects user mutedEventTypes (no send, no claim row)", async () => {
    await seedDevice("user_a", "ExponentPushToken[a]");
    await seedPref("user_a", { muted: ["referee.assigned"] });

    const adapter = new PushChannelAdapter(mockClient);
    const result = await adapter.send(baseParams(["user_a"]));

    expect(result).toEqual({ success: true, sent: 0, failed: 0 });
    expect(sendBatch).not.toHaveBeenCalled();
    expect(await getLogs()).toHaveLength(0);
  });

  it("releases the claim on an Expo network error so the event can retry", async () => {
    await seedDevice("user_a", "ExponentPushToken[a]");
    sendBatch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const adapter = new PushChannelAdapter(mockClient);
    const failed = await adapter.send(baseParams(["user_a"]));

    expect(failed).toEqual({ success: false, sent: 0, failed: 1 });
    // The whole batch was undelivered, so the claim must be released — not left
    // stranded — otherwise the unique index blocks all future delivery.
    expect(await getLogs()).toHaveLength(0);

    // Outbox reprocesses the same event: it must redeliver, not dedupe to nothing.
    sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt_a" }]);
    const retried = await adapter.send(baseParams(["user_a"]));

    expect(retried).toEqual({ success: true, sent: 1, failed: 0 });
    const rows = await getLogs();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("sent_ticket");
  });

  it("prefers the user preference locale over the device locale", async () => {
    await seedDevice("user_a", "ExponentPushToken[a]", "de-DE");
    await seedPref("user_a", { locale: "en" });
    sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt" }]);

    const adapter = new PushChannelAdapter(mockClient);
    await adapter.send(baseParams(["user_a"]));

    const sent = sendBatch.mock.calls[0]![0] as Array<{ title: string }>;
    expect(sent[0]!.title.toLowerCase()).toContain("referee"); // English template
  });

  it("falls back to device locale when no preference row exists", async () => {
    await seedDevice("user_a", "ExponentPushToken[a]", "en-US");
    sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt" }]);

    const adapter = new PushChannelAdapter(mockClient);
    await adapter.send(baseParams(["user_a"]));

    const sent = sendBatch.mock.calls[0]![0] as Array<{ title: string }>;
    expect(sent[0]!.title.toLowerCase()).toContain("referee");
  });

  it("renders the German template for a German device with no preference row", async () => {
    await seedDevice("user_a", "ExponentPushToken[a]", "de-DE");
    sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt" }]);

    const adapter = new PushChannelAdapter(mockClient);
    await adapter.send(baseParams(["user_a"]));

    const sent = sendBatch.mock.calls[0]![0] as Array<{ title: string }>;
    expect(sent[0]!.title.toLowerCase()).not.toContain("referee");
  });
});

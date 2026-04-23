import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbDelete: vi.fn(),
  sendBatch: vi.fn(),
}));

vi.mock("../../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
    insert: (...args: unknown[]) => mocks.dbInsert(...args),
    delete: (...args: unknown[]) => mocks.dbDelete(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  pushDevices: { userId: "user_id", token: "token", platform: "platform", locale: "locale" },
  notificationLog: {},
  userNotificationPreferences: { userId: "user_id", mutedEventTypes: "muted_event_types" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
}));

vi.mock("../../../config/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("../expo-push.client", () => ({
  ExpoPushClient: class {
    sendBatch(...args: unknown[]) {
      return mocks.sendBatch(...args);
    }
  },
}));

// Imports AFTER mocks
import { PushChannelAdapter } from "./push";
import { ExpoPushClient } from "../expo-push.client";

function mockSelectReturning(rows: unknown[]) {
  // db.select().from(table).where(condition) — returns rows
  mocks.dbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

function mockInsertOK() {
  const valuesCall = vi.fn();
  mocks.dbInsert.mockReturnValue({
    values: vi.fn().mockImplementation((v) => {
      valuesCall(v);
      return {
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };
    }),
  });
  return valuesCall;
}

const validRefereeAssignedPayload = {
  matchId: 1,
  matchNo: "0001",
  homeTeam: "Dragons",
  guestTeam: "Foes",
  slot: "SR1",
  kickoffDate: "2026-05-01",
  kickoffTime: "14:00",
  eventId: "evt_test_1",
};

describe("PushChannelAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendBatch.mockReset();
    mocks.dbSelect.mockReset();
    mocks.dbInsert.mockReset();
    mocks.dbDelete.mockReset();
  });

  it("returns success with sent=0 and skips DB when event type has no template", async () => {
    const adapter = new PushChannelAdapter(new ExpoPushClient({}));
    const result = await adapter.send({
      eventId: "evt_test_1",
      eventType: "match.scoreUpdated", // not in registry
      payload: {},
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: ["user_a"],
    });
    expect(result).toEqual({ success: true, sent: 0, failed: 0 });
    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it("returns success with sent=0 for empty recipient list", async () => {
    const adapter = new PushChannelAdapter(new ExpoPushClient({}));
    const result = await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: validRefereeAssignedPayload,
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: [],
    });
    expect(result).toEqual({ success: true, sent: 0, failed: 0 });
  });

  it("skips silently when recipient has no push devices", async () => {
    mockSelectReturning([]); // push_devices query: no rows
    mockSelectReturning([]); // user_notification_preferences query: no rows

    const adapter = new PushChannelAdapter(new ExpoPushClient({}));
    const result = await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: validRefereeAssignedPayload,
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: ["user_a"],
    });
    expect(result).toEqual({ success: true, sent: 0, failed: 0 });
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it("sends to all of a user's devices and writes log rows", async () => {
    mockSelectReturning([
      { id: 1, userId: "user_a", token: "ExponentPushToken[a1]", platform: "ios", locale: "de-DE" },
      { id: 2, userId: "user_a", token: "ExponentPushToken[a2]", platform: "android", locale: "de-DE" },
    ]);
    mockSelectReturning([]); // no prefs

    mocks.sendBatch.mockResolvedValueOnce([
      { status: "ok", id: "tkt_a1" },
      { status: "ok", id: "tkt_a2" },
    ]);

    const insertCall = mockInsertOK();

    const adapter = new PushChannelAdapter(new ExpoPushClient({}));
    const result = await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: validRefereeAssignedPayload,
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: ["user_a"],
    });

    expect(result).toEqual({ success: true, sent: 2, failed: 0 });
    expect(mocks.sendBatch).toHaveBeenCalledTimes(1);
    const sendArg = mocks.sendBatch.mock.calls[0]![0] as Array<{ to: string }>;
    expect(sendArg).toHaveLength(2);
    expect(sendArg[0]!.to).toBe("ExponentPushToken[a1]");
    expect(sendArg[1]!.to).toBe("ExponentPushToken[a2]");

    // Log rows inserted
    expect(insertCall).toHaveBeenCalled();
    const rows = insertCall.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.status).toBe("sent_ticket");
    expect(rows[0]!.providerTicketId).toBe("tkt_a1");
    expect(rows[0]!.recipientToken).toBe("ExponentPushToken[a1]");
    expect(rows[1]!.providerTicketId).toBe("tkt_a2");
  });

  it("records per-ticket failures without aborting batch", async () => {
    mockSelectReturning([
      { id: 1, userId: "user_a", token: "ExponentPushToken[ok]", platform: "ios" },
      { id: 2, userId: "user_a", token: "ExponentPushToken[bad]", platform: "ios" },
    ]);
    mockSelectReturning([]);

    mocks.sendBatch.mockResolvedValueOnce([
      { status: "ok", id: "tkt_ok" },
      { status: "error", message: "DeviceNotRegistered", details: { error: "DeviceNotRegistered" } },
    ]);

    const insertCall = mockInsertOK();

    const adapter = new PushChannelAdapter(new ExpoPushClient({}));
    const result = await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: validRefereeAssignedPayload,
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: ["user_a"],
    });

    expect(result).toEqual({ success: false, sent: 1, failed: 1 });
    const rows = insertCall.mock.calls[0]![0] as Array<Record<string, unknown>>;
    const okRow = rows.find((r) => r.recipientToken === "ExponentPushToken[ok]");
    const badRow = rows.find((r) => r.recipientToken === "ExponentPushToken[bad]");
    expect(okRow!.status).toBe("sent_ticket");
    expect(badRow!.status).toBe("failed");
    expect(badRow!.errorMessage).toContain("DeviceNotRegistered");
  });

  it("respects user mutedEventTypes", async () => {
    mockSelectReturning([
      { id: 1, userId: "user_a", token: "ExponentPushToken[a]", platform: "ios" },
    ]);
    mockSelectReturning([
      { userId: "user_a", mutedEventTypes: ["referee.assigned"] },
    ]);

    const adapter = new PushChannelAdapter(new ExpoPushClient({}));
    const result = await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: validRefereeAssignedPayload,
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: ["user_a"],
    });
    expect(result).toEqual({ success: true, sent: 0, failed: 0 });
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it("marks all rows failed on Expo network error", async () => {
    mockSelectReturning([
      { id: 1, userId: "user_a", token: "ExponentPushToken[a]", platform: "ios" },
    ]);
    mockSelectReturning([]);

    mocks.sendBatch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const insertCall = mockInsertOK();

    const adapter = new PushChannelAdapter(new ExpoPushClient({}));
    const result = await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: validRefereeAssignedPayload,
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: ["user_a"],
    });

    expect(result.success).toBe(false);
    expect(result.failed).toBe(1);
    const rows = insertCall.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(rows[0]!.status).toBe("failed");
    expect(rows[0]!.errorMessage).toContain("ECONNREFUSED");
  });

  it("prefers user preference locale over device locale when a pref row exists", async () => {
    mockSelectReturning([
      { id: 1, userId: "user_a", token: "ExponentPushToken[a]", platform: "ios", locale: "de-DE" },
    ]);
    mockSelectReturning([
      { userId: "user_a", mutedEventTypes: [], locale: "en" },
    ]);

    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt" }]);
    mockInsertOK();

    const adapter = new PushChannelAdapter(new ExpoPushClient({}));
    await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: validRefereeAssignedPayload,
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: ["user_a"],
    });

    const sendArg = mocks.sendBatch.mock.calls[0]![0] as Array<{ title: string }>;
    // English template should have been used
    expect(sendArg[0]!.title.toLowerCase()).toContain("referee");
  });

  it("uses device locale (en) when no pref row exists — EN device renders EN", async () => {
    mockSelectReturning([
      { id: 1, userId: "user_a", token: "ExponentPushToken[a]", platform: "ios", locale: "en-US" },
    ]);
    mockSelectReturning([]); // no prefs row

    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt" }]);
    mockInsertOK();

    const adapter = new PushChannelAdapter(new ExpoPushClient({}));
    await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: validRefereeAssignedPayload,
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: ["user_a"],
    });

    const sendArg = mocks.sendBatch.mock.calls[0]![0] as Array<{ title: string }>;
    // English template renders "referee" in title
    expect(sendArg[0]!.title.toLowerCase()).toContain("referee");
  });

  it("uses device locale (de) when no pref row exists — DE device renders DE", async () => {
    mockSelectReturning([
      { id: 1, userId: "user_a", token: "ExponentPushToken[a]", platform: "ios", locale: "de-DE" },
    ]);
    mockSelectReturning([]); // no prefs row

    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt" }]);
    mockInsertOK();

    const adapter = new PushChannelAdapter(new ExpoPushClient({}));
    await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: validRefereeAssignedPayload,
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: ["user_a"],
    });

    const sendArg = mocks.sendBatch.mock.calls[0]![0] as Array<{ title: string }>;
    // German template contains "Schiedsrichter" or similar — we just assert it's NOT the English title
    expect(sendArg[0]!.title.toLowerCase()).not.toContain("referee");
  });
});

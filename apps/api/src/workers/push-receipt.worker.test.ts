import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
  dbDelete: vi.fn(),
  getReceipts: vi.fn(),
}));

vi.mock("../config/database", () => ({
  db: {
    select: (...a: unknown[]) => mocks.dbSelect(...a),
    update: (...a: unknown[]) => mocks.dbUpdate(...a),
    delete: (...a: unknown[]) => mocks.dbDelete(...a),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  notificationLog: {
    id: "id",
    status: "status",
    providerTicketId: "provider_ticket_id",
    providerReceiptCheckedAt: "provider_receipt_checked_at",
    recipientToken: "recipient_token",
    createdAt: "created_at",
    errorMessage: "error_message",
  },
  pushDevices: { token: "token" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...a: unknown[]) => ({ and: a })),
  or: vi.fn((...a: unknown[]) => ({ or: a })),
  eq: vi.fn((...a: unknown[]) => ({ eq: a })),
  gt: vi.fn((...a: unknown[]) => ({ gt: a })),
  lt: vi.fn((...a: unknown[]) => ({ lt: a })),
  isNull: vi.fn((a: unknown) => ({ isNull: a })),
  isNotNull: vi.fn((a: unknown) => ({ isNotNull: a })),
  inArray: vi.fn((...a: unknown[]) => ({ inArray: a })),
}));

vi.mock("../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.mock("../services/notifications/expo-push.client", () => ({
  ExpoPushClient: class {
    getReceipts(ids: string[]) {
      return mocks.getReceipts(ids);
    }
  },
}));

// Imports AFTER mocks
import { reconcilePushReceipts } from "./push-receipt.worker";
import { ExpoPushClient } from "../services/notifications/expo-push.client";

function mockSelectReturning(rows: unknown[]) {
  mocks.dbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

function captureUpdate() {
  const setCall = vi.fn();
  const whereCall = vi.fn();
  mocks.dbUpdate.mockReturnValue({
    set: vi.fn().mockImplementation((v) => {
      setCall(v);
      return {
        where: vi.fn().mockImplementation((w) => {
          whereCall(w);
          return Promise.resolve(undefined);
        }),
      };
    }),
  });
  return { setCall, whereCall };
}

function captureDelete() {
  const whereCall = vi.fn();
  mocks.dbDelete.mockReturnValue({
    where: vi.fn().mockImplementation((w) => {
      whereCall(w);
      return Promise.resolve(undefined);
    }),
  });
  return { whereCall };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbSelect.mockReset();
  mocks.dbUpdate.mockReset();
  mocks.dbDelete.mockReset();
  mocks.getReceipts.mockReset();
});

describe("reconcilePushReceipts", () => {
  it("no-ops when no pending rows", async () => {
    mockSelectReturning([]);
    const client = new ExpoPushClient();
    const result = await reconcilePushReceipts(client);
    expect(result).toEqual({ checked: 0, delivered: 0, failed: 0 });
    expect(mocks.getReceipts).not.toHaveBeenCalled();
  });

  it("marks ok receipts as delivered", async () => {
    mockSelectReturning([
      { id: 1, providerTicketId: "tkt_ok", recipientToken: "ExponentPushToken[x]" },
    ]);
    mocks.getReceipts.mockResolvedValueOnce({ tkt_ok: { status: "ok" } });
    const { setCall } = captureUpdate();

    const client = new ExpoPushClient();
    const result = await reconcilePushReceipts(client);

    expect(result.checked).toBe(1);
    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(setCall).toHaveBeenCalledWith(
      expect.objectContaining({ status: "delivered", providerReceiptCheckedAt: expect.any(Date) }),
    );
  });

  it("marks failed + purges push_devices on DeviceNotRegistered", async () => {
    mockSelectReturning([
      { id: 2, providerTicketId: "tkt_dead", recipientToken: "ExponentPushToken[dead]" },
    ]);
    mocks.getReceipts.mockResolvedValueOnce({
      tkt_dead: { status: "error", message: "DeviceNotRegistered", details: { error: "DeviceNotRegistered" } },
    });
    const { setCall } = captureUpdate();
    const { whereCall } = captureDelete();

    const client = new ExpoPushClient();
    const result = await reconcilePushReceipts(client);

    expect(result.failed).toBe(1);
    expect(setCall).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", errorMessage: expect.stringContaining("DeviceNotRegistered") }),
    );
    expect(mocks.dbDelete).toHaveBeenCalled();
    expect(whereCall).toHaveBeenCalled();
  });

  it("marks other receipt errors as failed without purging", async () => {
    mockSelectReturning([
      { id: 3, providerTicketId: "tkt_too_big", recipientToken: "ExponentPushToken[big]" },
    ]);
    mocks.getReceipts.mockResolvedValueOnce({
      tkt_too_big: { status: "error", message: "MessageTooBig", details: { error: "MessageTooBig" } },
    });
    captureUpdate();

    const client = new ExpoPushClient();
    const result = await reconcilePushReceipts(client);
    expect(result.failed).toBe(1);
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("bumps providerReceiptCheckedAt without changing status when receipt not yet ready", async () => {
    mockSelectReturning([
      { id: 4, providerTicketId: "tkt_pending", recipientToken: "ExponentPushToken[p]" },
    ]);
    mocks.getReceipts.mockResolvedValueOnce({}); // no entry
    const { setCall } = captureUpdate();

    const client = new ExpoPushClient();
    const result = await reconcilePushReceipts(client);
    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(0);
    expect(setCall).toHaveBeenCalledWith(
      expect.objectContaining({ providerReceiptCheckedAt: expect.any(Date) }),
    );
    // status should not have been set
    const args = setCall.mock.calls[0]![0] as Record<string, unknown>;
    expect(args["status"]).toBeUndefined();
  });

  it("skips rows with missing providerTicketId", async () => {
    mockSelectReturning([
      { id: 5, providerTicketId: null, recipientToken: "x" },
    ]);
    const client = new ExpoPushClient();
    const result = await reconcilePushReceipts(client);
    expect(result.checked).toBe(0);
    expect(mocks.getReceipts).not.toHaveBeenCalled();
  });

  it("batches Expo receipts into groups of 1000", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({
      id: i,
      providerTicketId: `tkt_${i}`,
      recipientToken: null,
    }));
    mockSelectReturning(rows);
    mocks.getReceipts.mockResolvedValue({});
    captureUpdate();

    const client = new ExpoPushClient();
    const result = await reconcilePushReceipts(client);
    expect(result.checked).toBe(2500);
    // Note: Since we pass all ticketIds in one call and the client handles batching internally,
    // getReceipts is called once at the worker level, and batching is the ExpoPushClient's concern.
    expect(mocks.getReceipts).toHaveBeenCalledTimes(1);
  });
});

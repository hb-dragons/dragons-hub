import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm is NOT mocked here. Every interesting decision in this worker is a
// predicate: which rows are picked up (status = sent_ticket AND provider ticket
// present AND never/stale-checked), and which rows each bucketed UPDATE hits
// (`inArray(notificationLog.id, ...)`). With identity `eq`/`and`/`or`/`inArray`
// stubs and a chainable db mock, the select returns whatever the test handed it
// and `expect(dbUpdate).toHaveBeenCalled()` proves nothing about rows, status or
// predicate — so this runs against a real (PGlite, in-process) Postgres and
// reads the affected rows back.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

const mocks = vi.hoisted(() => ({ getReceipts: vi.fn() }));

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

// `push-receipt.worker.ts` imports `Worker` from bullmq at module scope, and
// bullmq builds its own ioredis client from the connection URL rather than
// going through `config/redis`. Left unmocked, importing this module opens a
// real connection to 6379: harmless on a dev box with docker infra up, but on
// CI — which runs no Redis service — the socket rejection escapes as an
// unhandled rejection and fails the whole run with every test passing. Only
// the retry backoff makes it timing-dependent, so it surfaces in a long run
// and not when this file is run alone. Every sibling worker test mocks bullmq
// for the same reason.
vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    on() {
      return this;
    }
    close() {
      return Promise.resolve();
    }
  },
  Queue: class MockQueue {
    add() {
      return Promise.resolve({ id: "1" });
    }
    close() {
      return Promise.resolve();
    }
  },
}));

// --- Imports (after mocks) ---

import { reconcilePushReceipts } from "./push-receipt.worker";
import { ExpoPushClient } from "../services/notifications/expo-push.client";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mocks.getReceipts.mockReset();
  recipientSeq = 0;
  await seedFixtures();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Fixtures ---

const EVENT_ID = "evt-push-1";
let channelConfigId: number;

async function seedFixtures(): Promise<void> {
  const cc = await ctx.client.query<{ id: number }>(
    `INSERT INTO channel_configs (name, type, enabled, config)
     VALUES ('Push', 'push', true, '{}'::jsonb) RETURNING id`,
  );
  channelConfigId = cc.rows[0]!.id;
  await ctx.client.query(
    `INSERT INTO domain_events
       (id, type, source, urgency, occurred_at, entity_type, entity_id, entity_name, deep_link_path, payload)
     VALUES ($1, 'match.cancelled', 'sync', 'immediate', now(), 'match', 1, 'Game', '/m/1', '{}'::jsonb)`,
    [EVENT_ID],
  );
}

interface LogRowInput {
  status?: string;
  providerTicketId?: string | null;
  recipientToken?: string | null;
  createdAt?: Date;
  providerReceiptCheckedAt?: Date | null;
}

// notification_log_dedup_idx is unique on (event_id, channel_config_id,
// coalesce(recipient_id, '__group__')), so every seeded row needs its own
// recipient — one event fanned out to several users, which is what the push
// channel actually produces.
let recipientSeq = 0;

async function seedLog(input: LogRowInput = {}): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO notification_log
       (event_id, channel_config_id, recipient_id, title, body, status,
        provider_ticket_id, recipient_token, provider_receipt_checked_at, created_at)
     VALUES ($1, $2, $8, 't', 'b', $3, $4, $5, $6, $7) RETURNING id`,
    [
      EVENT_ID,
      channelConfigId,
      input.status ?? "sent_ticket",
      input.providerTicketId === undefined ? "tkt_default" : input.providerTicketId,
      input.recipientToken === undefined ? "ExponentPushToken[x]" : input.recipientToken,
      input.providerReceiptCheckedAt ?? null,
      input.createdAt ?? new Date(),
      `user:u${recipientSeq++}`,
    ],
  );
  return r.rows[0]!.id;
}

interface LogRow {
  id: number;
  status: string;
  error_message: string | null;
  provider_receipt_checked_at: Date | null;
}

async function readLog(id: number): Promise<LogRow> {
  const r = await ctx.client.query<LogRow>(
    `SELECT id, status, error_message, provider_receipt_checked_at
     FROM notification_log WHERE id = $1`,
    [id],
  );
  return r.rows[0]!;
}

async function pushTokens(): Promise<string[]> {
  const r = await ctx.client.query<{ token: string }>(
    `SELECT token FROM push_devices ORDER BY token`,
  );
  return r.rows.map((row) => row.token);
}

async function seedPushDevice(userId: string, token: string): Promise<void> {
  await ctx.client.query(
    `INSERT INTO push_devices (user_id, token, platform) VALUES ($1, $2, 'ios')`,
    [userId, token],
  );
}

const HOUR = 60 * 60 * 1000;

// --- Tests ---

describe("reconcilePushReceipts", () => {
  it("no-ops when no pending rows", async () => {
    const result = await reconcilePushReceipts(new ExpoPushClient());
    expect(result).toEqual({ checked: 0, delivered: 0, failed: 0 });
    expect(mocks.getReceipts).not.toHaveBeenCalled();
  });

  it("polls only sent_ticket rows that still carry a ticket and are due for a check", async () => {
    const due = await seedLog({ providerTicketId: "tkt_due" });
    const stale = await seedLog({
      providerTicketId: "tkt_stale",
      providerReceiptCheckedAt: new Date(Date.now() - HOUR),
    });
    // Not eligible:
    const alreadyDelivered = await seedLog({ status: "delivered", providerTicketId: "tkt_done" });
    const alreadyFailed = await seedLog({ status: "failed", providerTicketId: "tkt_bad" });
    const noTicket = await seedLog({ providerTicketId: null });
    const justChecked = await seedLog({
      providerTicketId: "tkt_fresh",
      providerReceiptCheckedAt: new Date(),
    });

    mocks.getReceipts.mockResolvedValueOnce({
      tkt_due: { status: "ok" },
      tkt_stale: { status: "ok" },
    });

    const result = await reconcilePushReceipts(new ExpoPushClient());

    expect(mocks.getReceipts).toHaveBeenCalledTimes(1);
    expect((mocks.getReceipts.mock.calls[0]![0] as string[]).sort()).toEqual([
      "tkt_due",
      "tkt_stale",
    ]);
    expect(result).toEqual({ checked: 2, delivered: 2, failed: 0 });

    expect((await readLog(due)).status).toBe("delivered");
    expect((await readLog(stale)).status).toBe("delivered");
    // Untouched rows keep their status and stay unchecked.
    expect((await readLog(alreadyDelivered)).status).toBe("delivered");
    expect((await readLog(alreadyFailed)).status).toBe("failed");
    expect((await readLog(noTicket)).status).toBe("sent_ticket");
    expect((await readLog(noTicket)).provider_receipt_checked_at).toBeNull();
    expect((await readLog(justChecked)).status).toBe("sent_ticket");
  });

  it("marks only the ok-receipt rows delivered, leaving the rest alone", async () => {
    const ok = await seedLog({ providerTicketId: "tkt_ok" });
    const pending = await seedLog({ providerTicketId: "tkt_pending" });
    mocks.getReceipts.mockResolvedValueOnce({ tkt_ok: { status: "ok" } });

    const result = await reconcilePushReceipts(new ExpoPushClient());

    expect(result).toEqual({ checked: 2, delivered: 1, failed: 0 });
    const okRow = await readLog(ok);
    expect(okRow.status).toBe("delivered");
    expect(okRow.provider_receipt_checked_at).not.toBeNull();
    // The row with no receipt yet keeps polling: bumped, but still sent_ticket.
    const pendingRow = await readLog(pending);
    expect(pendingRow.status).toBe("sent_ticket");
    expect(pendingRow.provider_receipt_checked_at).not.toBeNull();
  });

  it("marks failed with the error code and purges only that device's token", async () => {
    const dead = await seedLog({
      providerTicketId: "tkt_dead",
      recipientToken: "ExponentPushToken[dead]",
    });
    const healthy = await seedLog({
      providerTicketId: "tkt_ok",
      recipientToken: "ExponentPushToken[alive]",
    });
    await seedPushDevice("u-dead", "ExponentPushToken[dead]");
    await seedPushDevice("u-alive", "ExponentPushToken[alive]");

    mocks.getReceipts.mockResolvedValueOnce({
      tkt_dead: {
        status: "error",
        message: "DeviceNotRegistered",
        details: { error: "DeviceNotRegistered" },
      },
      tkt_ok: { status: "ok" },
    });

    const result = await reconcilePushReceipts(new ExpoPushClient());

    expect(result).toEqual({ checked: 2, delivered: 1, failed: 1 });
    const deadRow = await readLog(dead);
    expect(deadRow.status).toBe("failed");
    expect(deadRow.error_message).toBe("DeviceNotRegistered");
    expect((await readLog(healthy)).status).toBe("delivered");
    expect(await pushTokens()).toEqual(["ExponentPushToken[alive]"]);
  });

  it("marks other receipt errors as failed without purging any device", async () => {
    const big = await seedLog({
      providerTicketId: "tkt_too_big",
      recipientToken: "ExponentPushToken[big]",
    });
    await seedPushDevice("u-big", "ExponentPushToken[big]");
    mocks.getReceipts.mockResolvedValueOnce({
      tkt_too_big: {
        status: "error",
        message: "MessageTooBig",
        details: { error: "MessageTooBig" },
      },
    });

    const result = await reconcilePushReceipts(new ExpoPushClient());

    expect(result.failed).toBe(1);
    const row = await readLog(big);
    expect(row.status).toBe("failed");
    expect(row.error_message).toBe("MessageTooBig");
    expect(await pushTokens()).toEqual(["ExponentPushToken[big]"]);
  });

  it("groups distinct error codes into their own updates without cross-contaminating", async () => {
    const a = await seedLog({ providerTicketId: "tkt_a", recipientToken: null });
    const b = await seedLog({ providerTicketId: "tkt_b", recipientToken: null });
    const c = await seedLog({ providerTicketId: "tkt_c", recipientToken: null });
    mocks.getReceipts.mockResolvedValueOnce({
      tkt_a: { status: "error", details: { error: "MessageTooBig" } },
      tkt_b: { status: "error", details: { error: "MessageRateExceeded" } },
      tkt_c: { status: "error", details: { error: "MessageTooBig" } },
    });

    const result = await reconcilePushReceipts(new ExpoPushClient());

    expect(result.failed).toBe(3);
    expect((await readLog(a)).error_message).toBe("MessageTooBig");
    expect((await readLog(b)).error_message).toBe("MessageRateExceeded");
    expect((await readLog(c)).error_message).toBe("MessageTooBig");
  });

  it("bumps providerReceiptCheckedAt without changing status when the receipt is not ready", async () => {
    const before = new Date(Date.now() - HOUR);
    const id = await seedLog({
      providerTicketId: "tkt_pending",
      providerReceiptCheckedAt: before,
    });
    mocks.getReceipts.mockResolvedValueOnce({});

    const result = await reconcilePushReceipts(new ExpoPushClient());

    expect(result).toEqual({ checked: 1, delivered: 0, failed: 0 });
    const row = await readLog(id);
    expect(row.status).toBe("sent_ticket");
    expect(row.provider_receipt_checked_at!.getTime()).toBeGreaterThan(before.getTime());
  });

  it("finalizes an aged sent_ticket row with no receipt as delivered (#82)", async () => {
    // Older than the 24h window in which Expo retains receipts.
    const aged = await seedLog({
      providerTicketId: "tkt_aged",
      createdAt: new Date(Date.now() - 25 * HOUR),
    });
    const young = await seedLog({
      providerTicketId: "tkt_young",
      createdAt: new Date(Date.now() - 1 * HOUR),
    });
    mocks.getReceipts.mockResolvedValueOnce({});

    const result = await reconcilePushReceipts(new ExpoPushClient());

    expect(result).toEqual({ checked: 2, delivered: 1, failed: 0 });
    expect((await readLog(aged)).status).toBe("delivered");
    // The young one keeps polling rather than being finalized early.
    expect((await readLog(young)).status).toBe("sent_ticket");
  });

  it("skips rows with an empty providerTicketId", async () => {
    const id = await seedLog({ providerTicketId: "" });
    const result = await reconcilePushReceipts(new ExpoPushClient());
    expect(result.checked).toBe(0);
    expect(mocks.getReceipts).not.toHaveBeenCalled();
    expect((await readLog(id)).status).toBe("sent_ticket");
  });

  it("hands every pending ticket to the client in one call (batching is the client's job)", async () => {
    const ids: number[] = [];
    const values: string[] = [];
    const params: unknown[] = [EVENT_ID, channelConfigId];
    for (let i = 0; i < 120; i++) {
      values.push(
        `($1, $2, 't', 'b', 'sent_ticket', $${params.length + 1}, $${params.length + 2})`,
      );
      params.push(`tkt_${i}`, `user:bulk${i}`);
    }
    const inserted = await ctx.client.query<{ id: number }>(
      `INSERT INTO notification_log (event_id, channel_config_id, title, body, status, provider_ticket_id, recipient_id)
       VALUES ${values.join(",")} RETURNING id`,
      params,
    );
    ids.push(...inserted.rows.map((r) => r.id));
    mocks.getReceipts.mockResolvedValue({});

    const result = await reconcilePushReceipts(new ExpoPushClient());

    expect(result.checked).toBe(120);
    expect(mocks.getReceipts).toHaveBeenCalledTimes(1);
    expect(mocks.getReceipts.mock.calls[0]![0]).toHaveLength(120);
    // All 120 were bumped in a single collapsed UPDATE.
    const bumped = await ctx.client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM notification_log WHERE provider_receipt_checked_at IS NOT NULL`,
    );
    expect(Number(bumped.rows[0]!.n)).toBe(120);
  });

  it("rethrows when getReceipts fails and leaves every row untouched", async () => {
    const id = await seedLog({ providerTicketId: "tkt_x" });
    mocks.getReceipts.mockRejectedValueOnce(new Error("expo down"));

    await expect(reconcilePushReceipts(new ExpoPushClient())).rejects.toThrow("expo down");

    const row = await readLog(id);
    expect(row.status).toBe("sent_ticket");
    expect(row.provider_receipt_checked_at).toBeNull();
  });
});

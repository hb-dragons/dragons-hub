import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";
import {
  insertNotificationLogDeduped,
  type NotificationLogWriter,
} from "./notification-log-dedup";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;
let writer: NotificationLogWriter;

beforeAll(async () => {
  ctx = await setupTestDb();
  writer = ctx.db as unknown as NotificationLogWriter;
});

afterAll(async () => {
  await closeTestDb(ctx);
});

beforeEach(async () => {
  await resetTestDb(ctx);
  await ctx.client.exec(`
    INSERT INTO domain_events (id, type, source, urgency, occurred_at, entity_type, entity_id, entity_name, deep_link_path, payload)
    VALUES ('evt-001', 'match.cancelled', 'sync', 'immediate', NOW(), 'match', 1, 'Test Match', '/matches/1', '{}');
    INSERT INTO channel_configs (id, name, type, config) VALUES (1, 'test-channel', 'in_app', '{}');
  `);
});

function values(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "evt-001",
    watchRuleId: null,
    channelConfigId: 1,
    title: "Title",
    body: "Body",
    locale: "de",
    status: "sent" as const,
    ...overrides,
  };
}

async function countRows(): Promise<number> {
  const result = await ctx.client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM notification_log",
  );
  return Number(result.rows[0]!.count);
}

describe("insertNotificationLogDeduped", () => {
  it("returns the claimed rows for a first delivery", async () => {
    const rows = await insertNotificationLogDeduped(
      writer,
      values({ recipientId: "user:1" }),
    );

    expect(rows).toEqual([{ id: 1, recipientId: "user:1" }]);
    expect(await countRows()).toBe(1);
  });

  it("claims many recipients in one statement", async () => {
    const rows = await insertNotificationLogDeduped(writer, [
      values({ recipientId: "user:1" }),
      values({ recipientId: "user:2" }),
    ]);

    expect(rows.map((r) => r.recipientId)).toEqual(["user:1", "user:2"]);
    expect(await countRows()).toBe(2);
  });

  it("returns nothing for an already-delivered (event, channel, recipient)", async () => {
    await insertNotificationLogDeduped(writer, values({ recipientId: "user:1" }));

    const retry = await insertNotificationLogDeduped(
      writer,
      values({ recipientId: "user:1", title: "Retry" }),
    );

    expect(retry).toEqual([]);
    expect(await countRows()).toBe(1);
  });

  it("returns only the not-yet-delivered rows of a mixed batch", async () => {
    await insertNotificationLogDeduped(writer, values({ recipientId: "user:1" }));

    const rows = await insertNotificationLogDeduped(writer, [
      values({ recipientId: "user:1" }),
      values({ recipientId: "user:2" }),
    ]);

    expect(rows.map((r) => r.recipientId)).toEqual(["user:2"]);
    expect(await countRows()).toBe(2);
  });

  // The COALESCE arm of the index: a plain unique index would treat every NULL
  // recipient as distinct and let group notifications duplicate freely.
  it("dedups group notifications, which have a NULL recipient", async () => {
    const first = await insertNotificationLogDeduped(
      writer,
      values({ recipientId: null }),
    );
    const retry = await insertNotificationLogDeduped(
      writer,
      values({ recipientId: null, title: "Retry" }),
    );

    expect(first).toHaveLength(1);
    expect(first[0]!.recipientId).toBeNull();
    expect(retry).toEqual([]);
    expect(await countRows()).toBe(1);
  });

  // Proves the conflict target really is the COALESCE index and not some other
  // unique index: only that expression collapses NULL onto the '__group__'
  // sentinel.
  it("treats the '__group__' sentinel and a NULL recipient as the same row", async () => {
    await insertNotificationLogDeduped(writer, values({ recipientId: null }));

    const sentinel = await insertNotificationLogDeduped(
      writer,
      values({ recipientId: "__group__" }),
    );

    expect(sentinel).toEqual([]);
    expect(await countRows()).toBe(1);
  });

  it("keeps different channels apart", async () => {
    await ctx.client.exec(
      `INSERT INTO channel_configs (id, name, type, config) VALUES (2, 'other', 'in_app', '{}')`,
    );

    await insertNotificationLogDeduped(writer, values({ recipientId: "user:1" }));
    const other = await insertNotificationLogDeduped(
      writer,
      values({ recipientId: "user:1", channelConfigId: 2 }),
    );

    expect(other).toHaveLength(1);
    expect(await countRows()).toBe(2);
  });

  it("does not issue a statement for an empty batch", async () => {
    expect(await insertNotificationLogDeduped(writer, [])).toEqual([]);
    expect(await countRows()).toBe(0);
  });
});

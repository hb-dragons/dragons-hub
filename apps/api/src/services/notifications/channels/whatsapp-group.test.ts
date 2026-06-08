import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const envHolder = vi.hoisted(() => ({
  WAHA_BASE_URL: "http://waha:3000" as string | undefined,
  WAHA_SESSION: "default",
}));
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("../../../config/database", () => ({
  db: new Proxy(
    {},
    { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] },
  ),
}));

vi.mock("../../../config/env", () => ({ env: envHolder }));

vi.mock("../../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.stubGlobal("fetch", mockFetch);

// --- Imports (after mocks) ---

import { WhatsAppGroupAdapter } from "./whatsapp-group";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

async function insertPrerequisites() {
  await ctx.client.exec(`
    INSERT INTO domain_events (id, type, source, urgency, occurred_at, entity_type, entity_id, entity_name, deep_link_path, payload)
    VALUES ('evt-001', 'match.cancelled', 'sync', 'immediate', NOW(), 'match', 1, 'Test Match', '/matches/1', '{}');
  `);
  await ctx.client.exec(`INSERT INTO channel_configs (id, name, type, config) VALUES (1, 'wa-channel', 'whatsapp_group', '{}');`);
}

beforeEach(async () => {
  await resetTestDb(ctx);
  await insertPrerequisites();
  envHolder.WAHA_BASE_URL = "http://waha:3000";
  envHolder.WAHA_SESSION = "default";
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, text: async () => "" });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function getLogs() {
  const result = await ctx.client.query("SELECT * FROM notification_log ORDER BY id");
  return result.rows as Record<string, unknown>[];
}

const groupId = "120363171744447809@g.us";
const params = {
  eventId: "evt-001",
  watchRuleId: null,
  channelConfigId: 1,
  recipientId: "audience:admin",
  title: "Match cancelled",
  body: "*Match cancelled*\n\nDragons vs Tigers",
  locale: "de",
};

describe("WhatsAppGroupAdapter", () => {
  it("posts to WAHA and records a sent notification_log row", async () => {
    const adapter = new WhatsAppGroupAdapter();
    const result = await adapter.send(params, groupId);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://waha:3000/api/sendText",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ session: "default", chatId: groupId, text: params.body }),
      }),
    );

    const rows = await getLogs();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event_id).toBe("evt-001");
    expect(rows[0]!.status).toBe("sent");
    expect(rows[0]!.sent_at).not.toBeNull();
  });

  it("deduplicates: a re-processed event does not re-post to the group", async () => {
    const adapter = new WhatsAppGroupAdapter();

    const first = await adapter.send(params, groupId);
    expect(first.success).toBe(true);
    expect(first.duplicate).toBeFalsy();

    const second = await adapter.send(params, groupId);
    expect(second.success).toBe(true);
    expect(second.duplicate).toBe(true);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(await getLogs()).toHaveLength(1);
  });

  it("releases the claim when WAHA returns non-ok, so the event can retry", async () => {
    const adapter = new WhatsAppGroupAdapter();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Internal Server Error" });

    const failed = await adapter.send(params, groupId);
    expect(failed.success).toBe(false);
    expect(failed.error).toContain("500");
    expect(await getLogs()).toHaveLength(0);

    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => "" });
    const retried = await adapter.send(params, groupId);
    expect(retried.success).toBe(true);
    expect(await getLogs()).toHaveLength(1);
  });

  it("returns error and leaves no claim row when WAHA is not configured", async () => {
    envHolder.WAHA_BASE_URL = undefined;
    const adapter = new WhatsAppGroupAdapter();

    const result = await adapter.send(params, groupId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("WAHA not configured");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(await getLogs()).toHaveLength(0);
  });

  it("releases the claim when fetch throws", async () => {
    const adapter = new WhatsAppGroupAdapter();
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await adapter.send(params, groupId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Connection refused");
    expect(await getLogs()).toHaveLength(0);
  });
});

import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const envHolder = vi.hoisted(() => ({
  GH_DISPATCH_TOKEN: "ghp_test_token" as string | undefined,
}));
const mockFetch = vi.hoisted(() => vi.fn());
// One shared child logger so the "logged skip" contract is assertable.
const logHolder = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../../config/database", () => ({
  getDb: () => (new Proxy(
    {},
    { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] },
  )),
}));

vi.mock("../../../config/env", () => ({ env: envHolder }));

vi.mock("../../../config/logger", () => ({
  logger: { child: () => logHolder },
}));

vi.stubGlobal("fetch", mockFetch);

// --- Imports (after mocks) ---

import { WebhookChannelAdapter } from "./webhook";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

async function insertPrerequisites() {
  await ctx.client.exec(`
    INSERT INTO domain_events (id, type, source, urgency, occurred_at, entity_type, entity_id, entity_name, deep_link_path, payload)
    VALUES ('evt-001', 'sync.completed', 'sync', 'immediate', NOW(), 'sync_run', 1, 'Nightly sync', '/admin/sync', '{}');
  `);
  await ctx.client.exec(
    `INSERT INTO channel_configs (id, name, type, config)
     VALUES (1, 'site-rebuild', 'webhook', '{"kind":"github_repository_dispatch","owner":"hb-dragons","repo":"dragons-hub","eventType":"sync-completed"}');`,
  );
}

beforeEach(async () => {
  await resetTestDb(ctx);
  await insertPrerequisites();
  envHolder.GH_DISPATCH_TOKEN = "ghp_test_token";
  mockFetch.mockReset();
  // repository_dispatch answers 204 No Content on success.
  mockFetch.mockResolvedValue({ ok: true, status: 204, text: async () => "" });
  logHolder.warn.mockClear();
  logHolder.error.mockClear();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function getLogs() {
  const result = await ctx.client.query("SELECT * FROM notification_log ORDER BY id");
  return result.rows as Record<string, unknown>[];
}

const webhookConfig = {
  kind: "github_repository_dispatch",
  owner: "hb-dragons",
  repo: "dragons-hub",
  eventType: "sync-completed",
} as const;

const params = {
  eventId: "evt-001",
  watchRuleId: null,
  channelConfigId: 1,
  recipientId: "channel:1",
  title: "Sync completed",
  body: "Nightly sync finished",
  locale: "de",
};

describe("WebhookChannelAdapter", () => {
  it("posts a repository_dispatch with the URL, headers and body derived from the config", async () => {
    const adapter = new WebhookChannelAdapter();
    const result = await adapter.send(params, webhookConfig);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/hb-dragons/dragons-hub/dispatches",
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer ghp_test_token",
          "Content-Type": "application/json",
          "User-Agent": "dragons-hub-api",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          event_type: "sync-completed",
          client_payload: { eventId: "evt-001" },
        }),
        // The shared dispatch helper bounds the request; the deadline itself is
        // asserted in github-dispatch.test.ts.
        signal: expect.any(AbortSignal),
      },
    );

    const rows = await getLogs();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event_id).toBe("evt-001");
    expect(rows[0]!.status).toBe("sent");
    expect(rows[0]!.sent_at).not.toBeNull();
  });

  it("deduplicates: a re-processed event does not dispatch a second time", async () => {
    const adapter = new WebhookChannelAdapter();

    const first = await adapter.send(params, webhookConfig);
    expect(first.success).toBe(true);
    expect(first.duplicate).toBeFalsy();

    const second = await adapter.send(params, webhookConfig);
    expect(second.success).toBe(true);
    expect(second.duplicate).toBe(true);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(await getLogs()).toHaveLength(1);
  });

  it("skips with a logged warning and no throw when GH_DISPATCH_TOKEN is missing", async () => {
    envHolder.GH_DISPATCH_TOKEN = undefined;
    const adapter = new WebhookChannelAdapter();

    const result = await adapter.send(params, webhookConfig);

    expect(result.success).toBe(false);
    expect(result.error).toBe("GH_DISPATCH_TOKEN not configured");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(logHolder.warn).toHaveBeenCalled();
    expect(await getLogs()).toHaveLength(0);
  });

  it.each([[422], [500]])(
    "logs and does not throw when GitHub answers %d, releasing the claim",
    async (status) => {
      const adapter = new WebhookChannelAdapter();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status,
        text: async () => `{"message":"error ${status}"}`,
      });

      const result = await adapter.send(params, webhookConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain(String(status));
      expect(logHolder.error).toHaveBeenCalled();
      // Claim released so a later attempt can deliver.
      expect(await getLogs()).toHaveLength(0);
    },
  );

  it("logs and does not throw when fetch itself rejects", async () => {
    const adapter = new WebhookChannelAdapter();
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await adapter.send(params, webhookConfig);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Connection refused");
    expect(logHolder.error).toHaveBeenCalled();
    expect(await getLogs()).toHaveLength(0);
  });
});

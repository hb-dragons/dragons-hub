import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are NOT mocked here. Everything this worker
// decides is a predicate or a write: which channel config it loads
// (`eq(channelConfigs.id, ...)`), which buffered rows belong to that channel
// (`innerJoin(domainEvents) ... where(eq(digestBuffer.channelConfigId, ...))`),
// whether the notification_log insert deduped against the real COALESCE-based
// unique index, and which buffer rows the transaction clears
// (`inArray(digestBuffer.id, bufferIds)`). Identity `eq`/`and`/`inArray` stubs
// plus a hand-rolled transaction mock verify none of that, so this runs against
// a real (PGlite, in-process) Postgres.

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

let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;
const mockWorkerOn = vi.fn();

vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: (job: unknown) => Promise<unknown>, _opts: unknown) {
      capturedProcessor = processor;
    }
    on(...args: unknown[]) {
      return mockWorkerOn(...args);
    }
  },
  Job: vi.fn(),
}));

vi.mock("../config/env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

const mockLogInfo = vi.fn();
vi.mock("../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: (...args: unknown[]) => mockLogInfo(...args),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("../services/notifications/templates/digest", () => ({
  renderDigestMessage: vi.fn().mockReturnValue({
    title: "Digest: 2 events",
    body: "- Event A\n- Event B",
  }),
}));

// --- Import after mocks ---

import { renderDigestMessage } from "../services/notifications/templates/digest";

// Force module load to capture the processor
await import("./digest.worker");

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
  vi.mocked(renderDigestMessage).mockReturnValue({
    title: "Digest: 2 events",
    body: "- Event A\n- Event B",
  });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

function makeJob(data: { channelConfigId: number; digestRunId: number }, id = "job-1") {
  return { id, data };
}

async function seedChannelConfig(opts: {
  name?: string;
  type?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO channel_configs (name, type, enabled, config)
     VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
    [
      opts.name ?? "Channel",
      opts.type ?? "in_app",
      opts.enabled ?? true,
      JSON.stringify(opts.config ?? {}),
    ],
  );
  return r.rows[0]!.id;
}

async function seedEvent(id: string, opts: {
  type?: string;
  entityName?: string;
  deepLinkPath?: string;
  urgency?: string;
  occurredAt?: Date;
  payload?: Record<string, unknown>;
} = {}): Promise<string> {
  await ctx.client.query(
    `INSERT INTO domain_events
       (id, type, source, urgency, occurred_at, entity_type, entity_id,
        entity_name, deep_link_path, payload)
     VALUES ($1, $2, 'sync', $3, $4, 'match', 1, $5, $6, $7::jsonb)`,
    [
      id,
      opts.type ?? "match.scheduled",
      opts.urgency ?? "routine",
      opts.occurredAt ?? new Date("2026-03-15T10:00:00Z"),
      opts.entityName ?? "Team A vs Team B",
      opts.deepLinkPath ?? "/matches/1",
      JSON.stringify(opts.payload ?? { matchId: 1 }),
    ],
  );
  return id;
}

async function bufferEvent(eventId: string, channelConfigId: number): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO digest_buffer (event_id, channel_config_id) VALUES ($1, $2) RETURNING id`,
    [eventId, channelConfigId],
  );
  return r.rows[0]!.id;
}

async function bufferRows(): Promise<{ id: number; event_id: string; channel_config_id: number }[]> {
  const r = await ctx.client.query<{ id: number; event_id: string; channel_config_id: number }>(
    `SELECT id, event_id, channel_config_id FROM digest_buffer ORDER BY id`,
  );
  return r.rows;
}

interface LogRow {
  id: number;
  event_id: string;
  channel_config_id: number;
  recipient_id: string | null;
  title: string;
  body: string;
  locale: string;
  status: string;
  digest_run_id: number | null;
}

async function logRows(): Promise<LogRow[]> {
  const r = await ctx.client.query<LogRow>(
    `SELECT id, event_id, channel_config_id, recipient_id, title, body, locale, status, digest_run_id
     FROM notification_log ORDER BY id`,
  );
  return r.rows;
}

/** A channel with two buffered events, plus a second channel that must be untouched. */
async function seedTwoEventDigest(configOpts: Parameters<typeof seedChannelConfig>[0] = {}) {
  const channelConfigId = await seedChannelConfig(configOpts);
  const otherConfigId = await seedChannelConfig({ name: "Other", type: "in_app" });

  await seedEvent("evt-a", { type: "match.scheduled", entityName: "Team A vs Team B" });
  await seedEvent("evt-b", {
    type: "match.updated",
    entityName: "Team C vs Team D",
    deepLinkPath: "/matches/2",
    occurredAt: new Date("2026-03-15T11:00:00Z"),
    payload: { matchId: 2 },
  });
  await seedEvent("evt-other", { type: "match.created", entityName: "Nope" });

  const bufA = await bufferEvent("evt-a", channelConfigId);
  const bufB = await bufferEvent("evt-b", channelConfigId);
  const bufOther = await bufferEvent("evt-other", otherConfigId);

  return { channelConfigId, otherConfigId, bufA, bufB, bufOther };
}

// --- Tests ---

describe("digest worker processor", () => {
  it("captures the processor function from Worker constructor", () => {
    expect(capturedProcessor).toBeTypeOf("function");
  });

  it("registers event handlers on the worker instance", async () => {
    const mod = await import("./digest.worker");
    expect(mod.digestWorker).toBeDefined();
    expect(typeof mod.digestWorker.on).toBe("function");
  });

  describe("channel config not found", () => {
    it("skips and leaves the buffer intact", async () => {
      const { bufA, bufB } = await seedTwoEventDigest();

      const result = await capturedProcessor!(makeJob({ channelConfigId: 999, digestRunId: 1 }));

      expect(result).toEqual({ skipped: true, reason: "channel_config_not_found" });
      expect(await logRows()).toEqual([]);
      expect((await bufferRows()).map((r) => r.id)).toContain(bufA);
      expect((await bufferRows()).map((r) => r.id)).toContain(bufB);
    });
  });

  describe("channel config disabled", () => {
    it("skips and leaves the buffer intact", async () => {
      const { channelConfigId } = await seedTwoEventDigest({ enabled: false });

      const result = await capturedProcessor!(makeJob({ channelConfigId, digestRunId: 2 }));

      expect(result).toEqual({ skipped: true, reason: "channel_disabled" });
      expect(await logRows()).toEqual([]);
      expect(await bufferRows()).toHaveLength(3);
    });
  });

  describe("no buffered events", () => {
    it("skips when the channel's own buffer is empty even if other channels have rows", async () => {
      const channelConfigId = await seedChannelConfig({ name: "Empty" });
      const otherConfigId = await seedChannelConfig({ name: "Busy" });
      await seedEvent("evt-a");
      await bufferEvent("evt-a", otherConfigId);

      const result = await capturedProcessor!(makeJob({ channelConfigId, digestRunId: 3 }));

      expect(result).toEqual({ skipped: true, reason: "no_events" });
      expect(await logRows()).toEqual([]);
      expect(await bufferRows()).toHaveLength(1);
    });
  });

  describe("successful in_app digest delivery", () => {
    it("writes one notification_log row and clears only this channel's buffer", async () => {
      const { channelConfigId, bufOther } = await seedTwoEventDigest({
        config: { locale: "en" },
      });

      const result = await capturedProcessor!(
        makeJob({ channelConfigId, digestRunId: 100 }),
      );

      expect(result).toEqual({ delivered: true, eventCount: 2, digestRunId: 100 });

      const logs = await logRows();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        // Anchored on the first buffered event so the dedup index has a key.
        event_id: "evt-a",
        channel_config_id: channelConfigId,
        recipient_id: `digest:${channelConfigId}`,
        title: "Digest: 2 events",
        body: "- Event A\n- Event B",
        locale: "en",
        status: "sent",
        digest_run_id: 100,
      });

      // The other channel's buffered row survives.
      expect((await bufferRows()).map((r) => r.id)).toEqual([bufOther]);
    });

    it("renders digest items from the joined domain_events row", async () => {
      const { channelConfigId } = await seedTwoEventDigest({ config: { locale: "en" } });

      await capturedProcessor!(makeJob({ channelConfigId, digestRunId: 100 }));

      expect(renderDigestMessage).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "match.scheduled",
            entityName: "Team A vs Team B",
            deepLinkPath: "/matches/1",
            payload: { matchId: 1 },
          }),
          expect.objectContaining({
            eventType: "match.updated",
            entityName: "Team C vs Team D",
            deepLinkPath: "/matches/2",
            payload: { matchId: 2 },
          }),
        ]),
        "en",
      );
      // The unrelated channel's event must not leak into the digest.
      const items = vi.mocked(renderDigestMessage).mock.calls[0]![0];
      expect(items).toHaveLength(2);
    });

    it("deduplicates a re-run against the real notification_log index and still clears the buffer", async () => {
      const { channelConfigId } = await seedTwoEventDigest({ config: { locale: "en" } });

      await capturedProcessor!(makeJob({ channelConfigId, digestRunId: 100 }));

      // Re-buffer the same events (e.g. the pipeline re-buffered after a retry)
      // and run the digest again. The dedup index must swallow the second insert.
      await bufferEvent("evt-a", channelConfigId);
      await bufferEvent("evt-b", channelConfigId);

      const result = await capturedProcessor!(makeJob({ channelConfigId, digestRunId: 200 }));

      expect(result).toEqual({ delivered: true, eventCount: 2, digestRunId: 200 });
      const logs = await logRows();
      expect(logs).toHaveLength(1);
      expect(logs[0]!.digest_run_id).toBe(100);
      expect(mockLogInfo).toHaveBeenCalledWith(
        "Digest already sent (duplicate), clearing stale buffer entries",
      );
      // The re-buffered rows are cleared regardless.
      expect(await bufferRows()).toHaveLength(1);
    });

    it("anchors on the oldest buffered row, so a later arrival cannot change the dedup key (#77)", async () => {
      const { channelConfigId } = await seedTwoEventDigest({ config: { locale: "en" } });

      await capturedProcessor!(makeJob({ channelConfigId, digestRunId: 100 }));

      // Re-buffer the same two events and add one that arrived afterwards —
      // what a second execution of the job sees when it reads the buffer a
      // moment later than the first. The anchor is the lowest buffer id, so it
      // is still evt-a and the dedup index still recognises the delivery.
      // Anchoring on an arbitrary row (an unordered read) would pick evt-c here
      // and send the digest a second time.
      await bufferEvent("evt-a", channelConfigId);
      await bufferEvent("evt-b", channelConfigId);
      await seedEvent("evt-c", { type: "match.created", entityName: "Team E vs Team F" });
      await bufferEvent("evt-c", channelConfigId);

      await capturedProcessor!(makeJob({ channelConfigId, digestRunId: 200 }));

      const logs = await logRows();
      expect(logs).toHaveLength(1);
      expect(logs[0]!.event_id).toBe("evt-a");
      expect(logs[0]!.digest_run_id).toBe(100);
    });

    it("uses default locale 'de' when config has no locale", async () => {
      const { channelConfigId } = await seedTwoEventDigest({ config: {} });

      await capturedProcessor!(makeJob({ channelConfigId, digestRunId: 100 }));

      expect(renderDigestMessage).toHaveBeenCalledWith(expect.any(Array), "de");
      expect((await logRows())[0]!.locale).toBe("de");
    });
  });

  describe("unsupported channel type", () => {
    it("writes no notification but still clears the buffer", async () => {
      const { channelConfigId, bufOther } = await seedTwoEventDigest({ type: "email" });

      const result = await capturedProcessor!(makeJob({ channelConfigId, digestRunId: 60 }));

      expect(result).toEqual({ delivered: true, eventCount: 2, digestRunId: 60 });
      expect(await logRows()).toEqual([]);
      expect((await bufferRows()).map((r) => r.id)).toEqual([bufOther]);
    });
  });

  describe("transaction atomicity", () => {
    it("leaves the buffer untouched when the notification insert fails", async () => {
      const { channelConfigId } = await seedTwoEventDigest({ config: { locale: "en" } });
      // A title longer than the column allows is not available here, so force the
      // failure by dropping the dedup index the insert names as its conflict
      // target: the statement raises 42P10 and the whole transaction rolls back.
      await ctx.client.exec(`DROP INDEX notification_log_dedup_idx`);

      await expect(
        capturedProcessor!(makeJob({ channelConfigId, digestRunId: 300 })),
      ).rejects.toThrow();

      // Nothing sent, nothing cleared — the job is safe to retry.
      expect(await logRows()).toEqual([]);
      expect(await bufferRows()).toHaveLength(3);
    });
  });
});

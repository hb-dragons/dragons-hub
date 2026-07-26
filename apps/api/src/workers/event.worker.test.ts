import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { EVENT_TYPES } from "@dragons/shared";

// --- Mock setup ---
//
// drizzle-orm is NOT mocked here. The worker's load is
// `eq(domainEvents.id, job.data.eventId)` and its completion stamp is
// `update(domainEvents).set({processedAt}).where(eq(domainEvents.id, event.id))`.
// With an identity `eq` stub the select hands back whatever the test pre-canned
// and `expect(mockDbUpdate).toHaveBeenCalled()` passes even if the stamp lands on
// every event of that type. So the DB is a real (PGlite, in-process) Postgres and
// the assertions read `processed_at` back per row.

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

// --- Capture the processor function from BullMQ Worker ---

let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;

vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: (job: unknown) => Promise<unknown>, _opts: unknown) {
      capturedProcessor = processor;
    }
    on() { return this; }
  },
  Job: class MockJob {},
}));

vi.mock("../config/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("../config/env", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
  },
}));

const mockProcessEvent = vi.fn();
vi.mock("../services/notifications/notification-pipeline", () => ({
  processEvent: (...args: unknown[]) => mockProcessEvent(...args),
}));

const mockDigestQueueAdd = vi.fn().mockResolvedValue({ id: "digest-job-1" });
vi.mock("./queues", () => ({
  digestQueue: {
    add: (...args: unknown[]) => mockDigestQueueAdd(...args),
  },
}));

// --- Import the module (triggers Worker constructor, captures processor) ---

await import("./event.worker");

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
  mockProcessEvent.mockResolvedValue({
    dispatched: 0,
    buffered: 0,
    coalesced: 0,
    muted: 0,
    configs: [],
  });
  mockDigestQueueAdd.mockResolvedValue({ id: "digest-job-1" });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    data: {
      eventId: "evt-1",
      type: "match.cancelled",
      urgency: "immediate",
      entityType: "match",
      entityId: 42,
      ...overrides,
    },
  };
}

interface SeedEventInput {
  id?: string;
  type?: string;
  urgency?: string;
  entityId?: number;
}

async function seedEvent(input: SeedEventInput = {}): Promise<string> {
  const id = input.id ?? "evt-1";
  await ctx.client.query(
    `INSERT INTO domain_events
       (id, type, source, urgency, occurred_at, entity_type, entity_id,
        entity_name, deep_link_path, payload, enqueued_at)
     VALUES ($1, $2, 'sync', $3, now(), 'match', $4, 'Dragons vs. Tigers',
             '/admin/matches/42', '{"matchId":42,"reason":"weather"}'::jsonb, now())`,
    [id, input.type ?? "match.cancelled", input.urgency ?? "immediate", input.entityId ?? 42],
  );
  return id;
}

async function processedIds(): Promise<string[]> {
  const r = await ctx.client.query<{ id: string }>(
    `SELECT id FROM domain_events WHERE processed_at IS NOT NULL ORDER BY id`,
  );
  return r.rows.map((row) => row.id);
}

function makeChannelConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    type: "in_app",
    enabled: true,
    digestMode: "per_sync",
    config: { locale: "de" },
    ...overrides,
  };
}

// --- Tests ---

describe("event worker processor", () => {
  it("captures the processor function from BullMQ Worker", () => {
    expect(capturedProcessor).toBeTypeOf("function");
  });

  describe("marking processed", () => {
    it("stamps processed_at on the handled event only", async () => {
      await seedEvent({ id: "evt-1" });
      // A sibling of the same type on a different entity. If the stamp's
      // predicate keys on anything but the id, this row is stamped too.
      await seedEvent({ id: "evt-2", entityId: 99 });

      await capturedProcessor!(makeJob());

      expect(await processedIds()).toEqual(["evt-1"]);
    });

    it("does not stamp processed_at when the pipeline throws (event stays reclaimable)", async () => {
      await seedEvent();
      mockProcessEvent.mockRejectedValueOnce(new Error("pipeline boom"));

      await expect(capturedProcessor!(makeJob())).rejects.toThrow("pipeline boom");

      expect(await processedIds()).toEqual([]);
    });

    it("does not stamp processed_at when the event is not found", async () => {
      await seedEvent({ id: "some-other-event" });

      await capturedProcessor!(makeJob());

      expect(await processedIds()).toEqual([]);
    });
  });

  describe("event not found", () => {
    it("returns skipped result when event is not in DB", async () => {
      const result = await capturedProcessor!(makeJob());

      expect(result).toEqual({ skipped: true, reason: "event_not_found" });
    });

    it("does not call processEvent when event is missing", async () => {
      await capturedProcessor!(makeJob());

      expect(mockProcessEvent).not.toHaveBeenCalled();
    });
  });

  describe("pipeline delegation", () => {
    it("passes the full persisted row — not the thin job payload — to processEvent", async () => {
      await seedEvent();

      await capturedProcessor!(makeJob());

      expect(mockProcessEvent).toHaveBeenCalledTimes(1);
      // The job data carries only 5 fields; the pipeline needs the row's
      // payload, entityName and deepLinkPath to render a message at all.
      expect(mockProcessEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "evt-1",
          type: "match.cancelled",
          source: "sync",
          urgency: "immediate",
          entityName: "Dragons vs. Tigers",
          deepLinkPath: "/admin/matches/42",
          payload: { matchId: 42, reason: "weather" },
        }),
      );
    });

    it("loads the event named by the job, not just any event", async () => {
      await seedEvent({ id: "evt-other", type: "match.created" });
      await seedEvent({ id: "evt-wanted", type: "match.cancelled" });

      await capturedProcessor!(makeJob({ eventId: "evt-wanted" }));

      expect(mockProcessEvent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "evt-wanted" }),
      );
      expect(await processedIds()).toEqual(["evt-wanted"]);
    });

    it("returns dispatched and buffered counts from pipeline", async () => {
      await seedEvent();
      mockProcessEvent.mockResolvedValue({
        dispatched: 3,
        buffered: 5,
        coalesced: 1,
        muted: 0,
        configs: [],
      });

      const result = await capturedProcessor!(makeJob());

      expect(result).toEqual({ dispatched: 3, buffered: 5 });
    });

    it("returns zero counts when pipeline processes nothing", async () => {
      await seedEvent();

      const result = await capturedProcessor!(makeJob());

      expect(result).toEqual({ dispatched: 0, buffered: 0 });
    });
  });

  describe("digest triggering for sync.completed", () => {
    async function seedSyncCompleted() {
      await seedEvent({ id: "evt-1", type: EVENT_TYPES.SYNC_COMPLETED, urgency: "routine" });
    }

    it("enqueues digest jobs for per_sync channel configs from pipeline result", async () => {
      await seedSyncCompleted();
      mockProcessEvent.mockResolvedValue({
        dispatched: 0, buffered: 0, coalesced: 0, muted: 0,
        configs: [
          makeChannelConfig({ id: 10, digestMode: "per_sync", enabled: true }),
          makeChannelConfig({ id: 20, digestMode: "per_sync", enabled: true }),
        ],
      });

      await capturedProcessor!(makeJob({ type: EVENT_TYPES.SYNC_COMPLETED }));

      expect(mockDigestQueueAdd).toHaveBeenCalledTimes(2);
      expect(mockDigestQueueAdd).toHaveBeenCalledWith(
        "digest:10",
        expect.objectContaining({ channelConfigId: 10 }),
      );
      expect(mockDigestQueueAdd).toHaveBeenCalledWith(
        "digest:20",
        expect.objectContaining({ channelConfigId: 20 }),
      );
      // Both digest jobs share one run id so the digest worker can group them.
      const runIds = mockDigestQueueAdd.mock.calls.map(
        (c) => (c[1] as { digestRunId: number }).digestRunId,
      );
      expect(new Set(runIds).size).toBe(1);
    });

    it("skips configs that are not per_sync", async () => {
      await seedSyncCompleted();
      mockProcessEvent.mockResolvedValue({
        dispatched: 0, buffered: 0, coalesced: 0, muted: 0,
        configs: [
          makeChannelConfig({ id: 10, digestMode: "per_sync", enabled: true }),
          makeChannelConfig({ id: 20, digestMode: "scheduled", enabled: true }),
        ],
      });

      await capturedProcessor!(makeJob({ type: EVENT_TYPES.SYNC_COMPLETED }));

      expect(mockDigestQueueAdd).toHaveBeenCalledTimes(1);
      expect(mockDigestQueueAdd).toHaveBeenCalledWith(
        "digest:10",
        expect.objectContaining({ channelConfigId: 10 }),
      );
    });

    it("skips disabled configs for per_sync digest", async () => {
      await seedSyncCompleted();
      mockProcessEvent.mockResolvedValue({
        dispatched: 0, buffered: 0, coalesced: 0, muted: 0,
        configs: [makeChannelConfig({ id: 10, digestMode: "per_sync", enabled: false })],
      });

      await capturedProcessor!(makeJob({ type: EVENT_TYPES.SYNC_COMPLETED }));

      expect(mockDigestQueueAdd).not.toHaveBeenCalled();
    });

    it("does not enqueue digest jobs when configs list is empty", async () => {
      await seedSyncCompleted();

      await capturedProcessor!(makeJob({ type: EVENT_TYPES.SYNC_COMPLETED }));

      expect(mockDigestQueueAdd).not.toHaveBeenCalled();
    });

    it("keys the digest decision off the stored event type, not the job payload", async () => {
      // The job says sync.completed but the persisted row is a match event —
      // the row wins, so no digest is triggered.
      await seedEvent({ id: "evt-1", type: "match.cancelled" });
      mockProcessEvent.mockResolvedValue({
        dispatched: 0, buffered: 0, coalesced: 0, muted: 0,
        configs: [makeChannelConfig({ id: 10, digestMode: "per_sync", enabled: true })],
      });

      await capturedProcessor!(makeJob({ type: EVENT_TYPES.SYNC_COMPLETED }));

      expect(mockDigestQueueAdd).not.toHaveBeenCalled();
    });

    it("still stamps processed_at when the digest enqueue fails", async () => {
      await seedSyncCompleted();
      mockProcessEvent.mockResolvedValue({
        dispatched: 0, buffered: 0, coalesced: 0, muted: 0,
        configs: [makeChannelConfig({ id: 10, digestMode: "per_sync", enabled: true })],
      });
      mockDigestQueueAdd.mockRejectedValueOnce(new Error("Redis error"));

      const result = await capturedProcessor!(makeJob({ type: EVENT_TYPES.SYNC_COMPLETED }));

      expect(result).toEqual({ dispatched: 0, buffered: 0 });
      expect(await processedIds()).toEqual(["evt-1"]);
    });
  });
});

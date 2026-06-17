import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// Real Postgres (pglite) so the claim/lease SQL is actually exercised.
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

vi.mock("../../config/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockQueueAdd = vi.fn();
vi.mock("../../workers/queues", () => ({
  domainEventsQueue: { add: (...args: unknown[]) => mockQueueAdd(...args) },
}));

import { pollOutbox } from "./outbox-poller";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mockQueueAdd.mockResolvedValue({ id: "job-1" });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

const MINUTE = 60_000;

async function seedEvent(opts: {
  id: string;
  createdAt: Date;
  enqueuedAt?: Date | null;
  processedAt?: Date | null;
  type?: string;
  urgency?: string;
}): Promise<void> {
  const {
    id,
    createdAt,
    enqueuedAt = null,
    processedAt = null,
    type = "match.created",
    urgency = "routine",
  } = opts;
  await ctx.client.query(
    `INSERT INTO domain_events
       (id, type, source, urgency, occurred_at, entity_type, entity_id,
        entity_name, deep_link_path, payload, created_at, enqueued_at, processed_at)
     VALUES ($1, $2, 'sync', $3, now(), 'match', 1,
             'Dragons vs Tigers', '/matches/1', '{}'::jsonb, $4, $5, $6)`,
    [
      id,
      type,
      urgency,
      createdAt.toISOString(),
      enqueuedAt ? enqueuedAt.toISOString() : null,
      processedAt ? processedAt.toISOString() : null,
    ],
  );
}

async function getRow(id: string): Promise<{ enqueued_at: string | null; processed_at: string | null }> {
  const r = await ctx.client.query<{ enqueued_at: string | null; processed_at: string | null }>(
    `SELECT enqueued_at, processed_at FROM domain_events WHERE id = $1`,
    [id],
  );
  return r.rows[0]!;
}

describe("pollOutbox", () => {
  it("returns 0 and enqueues nothing when there are no pending events", async () => {
    expect(await pollOutbox()).toBe(0);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("claims a never-enqueued, never-processed event and enqueues it", async () => {
    await seedEvent({ id: "evt-pending", createdAt: new Date(Date.now() - MINUTE) });

    expect(await pollOutbox()).toBe(1);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "match.created",
      expect.objectContaining({ eventId: "evt-pending" }),
    );
    const row = await getRow("evt-pending");
    expect(row.enqueued_at).not.toBeNull(); // lease stamped
  });

  it("does not re-claim an already-processed event", async () => {
    await seedEvent({
      id: "evt-done",
      createdAt: new Date(Date.now() - 10 * MINUTE),
      enqueuedAt: new Date(Date.now() - 10 * MINUTE),
      processedAt: new Date(Date.now() - 9 * MINUTE),
    });

    expect(await pollOutbox()).toBe(0);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("does not re-claim a freshly-leased event still being processed", async () => {
    // enqueued 10s ago, not yet processed → within lease, leave it alone
    await seedEvent({
      id: "evt-inflight",
      createdAt: new Date(Date.now() - 5 * MINUTE),
      enqueuedAt: new Date(Date.now() - 10_000),
      processedAt: null,
    });

    expect(await pollOutbox()).toBe(0);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("reclaims a stranded event whose lease has expired and is still unprocessed", async () => {
    // enqueued 10 min ago but never processed → the prior delivery failed; reclaim it
    await seedEvent({
      id: "evt-stranded",
      createdAt: new Date(Date.now() - 30 * MINUTE),
      enqueuedAt: new Date(Date.now() - 10 * MINUTE),
      processedAt: null,
    });

    expect(await pollOutbox()).toBe(1);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "match.created",
      expect.objectContaining({ eventId: "evt-stranded" }),
    );
  });

  it("does not claim events created within the last second (insert race guard)", async () => {
    await seedEvent({ id: "evt-fresh", createdAt: new Date() });

    expect(await pollOutbox()).toBe(0);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("resets the lease (enqueued_at) and logs when the queue add fails", async () => {
    await seedEvent({ id: "evt-1", createdAt: new Date(Date.now() - MINUTE) });
    await seedEvent({ id: "evt-2", createdAt: new Date(Date.now() - MINUTE), type: "match.cancelled" });
    mockQueueAdd.mockRejectedValueOnce(new Error("Redis down")).mockResolvedValueOnce({ id: "job-2" });

    // one succeeds, one fails
    expect(await pollOutbox()).toBe(1);

    const { logger } = await import("../../config/logger");
    expect(logger.error).toHaveBeenCalled();

    // the failed event must be released so it is retried next poll
    const rows = await ctx.client.query<{ id: string; enqueued_at: string | null }>(
      `SELECT id, enqueued_at FROM domain_events WHERE enqueued_at IS NULL`,
    );
    expect(rows.rows.length).toBe(1); // exactly the failed one is back to NULL
  });
});

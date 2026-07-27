import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { EVENT_TYPES, TASK_PRIORITIES } from "@dragons/shared";

// --- Mock setup ---
//
// drizzle-orm is NOT mocked here. `enqueueDomainEvent` stamps `enqueued_at`
// through `eq(domainEvents.id, event.id)`; with an identity `eq` stub and a
// chainable db mock, `expect(mockUpdate).toHaveBeenCalled()` passes even if the
// predicate targets the wrong column and every event of that type gets stamped.
// So the whole module runs against a real (PGlite, in-process) Postgres and the
// assertions read the rows back.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockQueueAdd = vi.fn().mockResolvedValue({ id: "queue-job-1" });
vi.mock("../../workers/queues", () => ({
  domainEventsQueue: {
    add: (...args: unknown[]) => mockQueueAdd(...args),
  },
}));

// Mock ulid to return predictable values
let ulidCounter = 0;
vi.mock("ulid", () => ({
  ulid: () => `01TEST${String(ulidCounter++).padStart(20, "0")}`,
}));

// --- Imports (after mocks) ---

import {
  buildDomainEvent,
  insertDomainEvent,
  enqueueDomainEvent,
  publishDomainEvent,
  publishSystemEvent,
  type DomainEvent,
  type TransactionClient,
} from "./event-publisher";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mockQueueAdd.mockResolvedValue({ id: "queue-job-1" });
  ulidCounter = 0;
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

interface EventRow {
  id: string;
  type: string;
  source: string;
  urgency: string;
  actor: string | null;
  sync_run_id: number | null;
  entity_type: string;
  entity_id: number;
  entity_name: string;
  deep_link_path: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
  enqueued_at: Date | null;
  processed_at: Date | null;
}

async function eventRows(): Promise<EventRow[]> {
  const r = await ctx.client.query<EventRow>(
    `SELECT id, type, source, urgency, actor, sync_run_id, entity_type, entity_id,
            entity_name, deep_link_path, payload, occurred_at, enqueued_at, processed_at
     FROM domain_events ORDER BY id`,
  );
  return r.rows;
}

function matchCreated(overrides: Partial<Parameters<typeof buildDomainEvent>[0]> = {}) {
  return buildDomainEvent({
    type: EVENT_TYPES.MATCH_CREATED,
    source: "sync",
    entityType: "match",
    entityId: 1,
    entityName: "Game",
    deepLinkPath: "/matches/1",
    payload: {},
    ...overrides,
  });
}

/** Insert an event row directly, bypassing the module under test. */
async function seedEvent(event: DomainEvent): Promise<void> {
  await ctx.client.query(
    `INSERT INTO domain_events
       (id, type, source, urgency, occurred_at, actor, sync_run_id, entity_type,
        entity_id, entity_name, deep_link_path, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
    [
      event.id,
      event.type,
      event.source,
      event.urgency,
      event.occurredAt,
      event.actor,
      event.syncRunId,
      event.entityType,
      event.entityId,
      event.entityName,
      event.deepLinkPath,
      JSON.stringify(event.payload),
    ],
  );
}

describe("buildDomainEvent", () => {
  // Structural guard: every TASK_PRIORITIES value must survive task.assigned
  // payload validation, so an urgent task assignment is published clean rather
  // than with a "failed schema validation" warning.
  it.each(TASK_PRIORITIES)(
    "builds a task.assigned event with priority %s without a validation warning",
    async (priority) => {
      const { logger } = await import("../../config/logger");

      buildDomainEvent({
        type: EVENT_TYPES.TASK_ASSIGNED,
        source: "manual",
        entityType: "task",
        entityId: 7,
        entityName: "Book the hall",
        deepLinkPath: "/admin/boards/1?task=7",
        payload: {
          taskId: 7,
          boardId: 1,
          boardName: "Ops",
          title: "Book the hall",
          assigneeUserIds: ["u1"],
          assignedBy: "Alice",
          dueDate: null,
          priority,
        },
      });

      expect(logger.warn).not.toHaveBeenCalled();
    },
  );

  it("produces an event with ULID id", () => {
    const event = matchCreated({ entityName: "Team A vs Team B", payload: { matchNo: 100 } });
    expect(event.id).toMatch(/^01TEST/);
  });

  it("classifies urgency based on event type", () => {
    expect(matchCreated().urgency).toBe("routine");
    expect(matchCreated({ type: EVENT_TYPES.MATCH_CANCELLED }).urgency).toBe("immediate");
  });

  it("uses provided occurredAt or defaults to now", () => {
    const customDate = new Date("2026-01-01T00:00:00Z");
    expect(matchCreated({ occurredAt: customDate }).occurredAt).toBe(customDate);
    expect(matchCreated().occurredAt).toBeInstanceOf(Date);
  });

  it("defaults actor and syncRunId to null", () => {
    const event = matchCreated();
    expect(event.actor).toBeNull();
    expect(event.syncRunId).toBeNull();
  });

  it("carries through provided actor and syncRunId", () => {
    const event = matchCreated({ actor: "user-123", syncRunId: 42, payload: { matchNo: 100 } });
    expect(event.actor).toBe("user-123");
    expect(event.syncRunId).toBe(42);
  });

  it("preserves all fields in payload", () => {
    const payload = { matchNo: 100, homeTeam: "Dragons", guestTeam: "Bears" };
    expect(matchCreated({ payload }).payload).toEqual(payload);
  });
});

describe("insertDomainEvent", () => {
  it("writes every column of the event to domain_events", async () => {
    const occurredAt = new Date("2026-03-04T18:30:00Z");
    const event = matchCreated({
      type: EVENT_TYPES.MATCH_CANCELLED,
      source: "manual",
      occurredAt,
      actor: "user-123",
      entityId: 4711,
      entityName: "Dragons vs Bears",
      deepLinkPath: "/matches/4711",
      payload: { matchNo: 100, reason: "weather" },
    });

    await insertDomainEvent(event);

    const rows = await eventRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: event.id,
      type: EVENT_TYPES.MATCH_CANCELLED,
      source: "manual",
      urgency: "immediate",
      actor: "user-123",
      sync_run_id: null,
      entity_type: "match",
      entity_id: 4711,
      entity_name: "Dragons vs Bears",
      deep_link_path: "/matches/4711",
      // Not enqueued and not processed yet — the outbox invariant.
      enqueued_at: null,
      processed_at: null,
    });
    expect(rows[0]!.payload).toEqual({ matchNo: 100, reason: "weather" });
    expect(new Date(rows[0]!.occurred_at).toISOString()).toBe(occurredAt.toISOString());
  });

  it("participates in the caller's transaction and is rolled back with it", async () => {
    const event = matchCreated();

    await expect(
      ctx.db.transaction(async (tx) => {
        await insertDomainEvent(event, tx as TransactionClient);
        // Row is visible inside the transaction...
        const inside = await tx.execute<{ n: number }>(
          "SELECT count(*)::int AS n FROM domain_events",
        );
        expect(Number((inside.rows[0] as { n: number }).n)).toBe(1);
        throw new Error("caller rolled back");
      }),
    ).rejects.toThrow("caller rolled back");

    // ...and gone once the caller's transaction aborts.
    expect(await eventRows()).toHaveLength(0);
  });
});

describe("enqueueDomainEvent", () => {
  it("enqueues to BullMQ and stamps enqueued_at on that event only", async () => {
    const target = matchCreated({ type: EVENT_TYPES.MATCH_CANCELLED, entityId: 1 });
    // A sibling event of the SAME type on a different entity. If the update
    // predicate keys on anything but the id, this row is stamped too.
    const sibling = matchCreated({ type: EVENT_TYPES.MATCH_CANCELLED, entityId: 2 });
    await seedEvent(target);
    await seedEvent(sibling);

    await enqueueDomainEvent(target);

    expect(mockQueueAdd).toHaveBeenCalledWith(
      EVENT_TYPES.MATCH_CANCELLED,
      expect.objectContaining({
        eventId: target.id,
        type: EVENT_TYPES.MATCH_CANCELLED,
        urgency: "immediate",
        entityType: "match",
        entityId: 1,
      }),
    );

    const rows = await eventRows();
    const stamped = rows.filter((r) => r.enqueued_at !== null).map((r) => r.id);
    expect(stamped).toEqual([target.id]);
  });

  it("logs a warning and leaves enqueued_at unset when the queue rejects", async () => {
    mockQueueAdd.mockRejectedValueOnce(new Error("Redis down"));
    const event = matchCreated();
    await seedEvent(event);

    await expect(enqueueDomainEvent(event)).resolves.toBeUndefined();

    const { logger } = await import("../../config/logger");
    expect(logger.warn).toHaveBeenCalled();
    // The outbox poller has to be able to find it again.
    expect((await eventRows())[0]!.enqueued_at).toBeNull();
  });
});

describe("publishDomainEvent", () => {
  it("inserts, enqueues and stamps enqueued_at when no tx is provided", async () => {
    const event = await publishDomainEvent({
      type: EVENT_TYPES.MATCH_CREATED,
      source: "sync",
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload: {},
    });

    expect(event.type).toBe(EVENT_TYPES.MATCH_CREATED);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);

    // The enqueue is fire-and-forget; let its continuation run.
    await vi.waitFor(async () => {
      const rows = await eventRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(event.id);
      expect(rows[0]!.enqueued_at).not.toBeNull();
    });
  });

  it("inserts inside the tx but does NOT enqueue, leaving the row for the outbox poller", async () => {
    let event: DomainEvent | undefined;
    await ctx.db.transaction(async (tx) => {
      event = await publishDomainEvent(
        {
          type: EVENT_TYPES.MATCH_CREATED,
          source: "sync",
          entityType: "match",
          entityId: 1,
          entityName: "Game",
          deepLinkPath: "/matches/1",
          payload: {},
        },
        tx as TransactionClient,
      );
    });

    expect(mockQueueAdd).not.toHaveBeenCalled();
    const rows = await eventRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(event!.id);
    // Un-enqueued and unprocessed: exactly what the outbox poller looks for.
    expect(rows[0]!.enqueued_at).toBeNull();
    expect(rows[0]!.processed_at).toBeNull();
  });
});

describe("publishSystemEvent", () => {
  const testPush = {
    id: "admin_test:u_admin:01ABC",
    type: "admin.test_push" as const,
    occurredAt: new Date("2026-07-27T09:00:00Z"),
    actor: "u_admin",
    entityName: "admin test",
    deepLinkPath: "/",
    payload: { isTest: true },
  };

  it("writes the anchor row with the caller's id and does not enqueue", async () => {
    await publishSystemEvent(testPush);

    const rows = await eventRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      // The id is the caller's, not a ULID: the admin route scopes its /recent
      // lookup by an `admin_test:<caller>:` prefix.
      id: "admin_test:u_admin:01ABC",
      type: "admin.test_push",
      source: "manual",
      urgency: "immediate",
      actor: "u_admin",
      entity_type: "user",
      entity_id: 0,
      entity_name: "admin test",
    });
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("joins the caller's transaction, so a later failure takes the event with it", async () => {
    await expect(
      ctx.db.transaction(async (tx) => {
        await publishSystemEvent(testPush, tx as TransactionClient);
        throw new Error("log insert failed");
      }),
    ).rejects.toThrow("log insert failed");

    expect(await eventRows()).toEqual([]);
  });
});

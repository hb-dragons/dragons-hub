import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../test/setup-test-db";

// --- Mocks (hoisted before imports) ---
//
// Deliberately NOT mocking drizzle-orm or @dragons/db/schema. Both probes are
// pure predicate work: outbox lag is `WHERE processed_at IS NULL ORDER BY
// created_at LIMIT 1`, and sync freshness is `WHERE sync_type = 'full' AND
// status = 'completed' ORDER BY completed_at DESC`. Under the old mocked ORM the
// route never actually filtered anything — the chain just handed back whatever
// the test had queued — so flipping `status = 'completed'` to `'failed'` and
// dropping the `processed_at IS NULL` filter both left the suite green.
//
// Redis and the BullMQ queues stay stubbed: they are not database state, and
// the route only cares whether their calls resolve or reject.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  redisPing: vi.fn(),
  syncQueueCounts: vi.fn(),
  eventsQueueCounts: vi.fn(),
  outboxPollQueueCounts: vi.fn(),
  getSession: vi.fn(),
}));

// Real rbac middleware over a stubbed session store, so the admin gate on
// /health/deep is exercised rather than mocked away.
vi.mock("../config/auth", () => ({
  auth: { api: { getSession: (...a: unknown[]) => mocks.getSession(...a) } },
}));

vi.mock("../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../config/redis", () => ({
  getRedis: () => ({ ping: () => mocks.redisPing() }),
}));

vi.mock("../workers/queues", () => ({
  syncQueue: { getJobCounts: (...a: unknown[]) => mocks.syncQueueCounts(...a) },
  domainEventsQueue: {
    getJobCounts: (...a: unknown[]) => mocks.eventsQueueCounts(...a),
  },
  outboxPollQueue: {
    getJobCounts: (...a: unknown[]) => mocks.outboxPollQueueCounts(...a),
  },
}));

// --- Imports (after mocks) ---

import { healthRoutes } from "./health.routes";
import { domainEvents, syncRuns } from "@dragons/db/schema";

const app = new Hono().route("/", healthRoutes);

const ADMIN_SESSION = {
  user: { id: "u-admin", role: "admin" },
  session: { id: "s1" },
};

interface DeepBody {
  status: string;
  checks: Record<string, unknown>;
}

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  dbHolder.ref = ctx.db;
  mocks.redisPing.mockResolvedValue("PONG");
  mocks.syncQueueCounts.mockResolvedValue({ waiting: 0 });
  mocks.eventsQueueCounts.mockResolvedValue({ waiting: 0 });
  mocks.outboxPollQueueCounts.mockResolvedValue({ waiting: 0 });
  mocks.getSession.mockResolvedValue(ADMIN_SESSION);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

/** Point the route at a database whose every call rejects. */
function breakDb(): void {
  const fail = () => {
    throw new Error("db unreachable");
  };
  dbHolder.ref = { execute: () => Promise.reject(new Error("db unreachable")), select: fail };
}

function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60_000);
}

async function seedEvent(
  id: string,
  createdAt: Date,
  opts: { processedAt?: Date | null; enqueuedAt?: Date | null } = {},
): Promise<void> {
  await ctx.db.insert(domainEvents).values({
    id,
    type: "match.updated",
    source: "sync",
    urgency: "routine",
    occurredAt: createdAt,
    entityType: "match",
    entityId: 1,
    entityName: "Match",
    deepLinkPath: "/",
    payload: {},
    createdAt,
    processedAt: opts.processedAt ?? null,
    enqueuedAt: opts.enqueuedAt ?? null,
  });
}

async function seedSyncRun(
  syncType: string,
  status: string,
  completedAt: Date | null,
): Promise<void> {
  await ctx.db.insert(syncRuns).values({
    syncType,
    status: status as never,
    triggeredBy: "test",
    startedAt: completedAt ?? new Date(),
    completedAt,
  });
}

async function deep(): Promise<{ res: Response; body: DeepBody }> {
  const res = await app.request("/health/deep");
  return { res, body: (await res.json()) as DeepBody };
}

describe("GET /health", () => {
  it("returns 200 when db and redis are reachable", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok", redis: "ok" });
  });

  it("returns 503 when db is unreachable", async () => {
    breakDb();
    const res = await app.request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", db: "error", redis: "ok" });
  });

  it("returns 503 when redis is unreachable", async () => {
    mocks.redisPing.mockRejectedValue(new Error("nope"));
    const res = await app.request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", db: "ok", redis: "error" });
  });
});

describe("GET /health/deep — admin gate", () => {
  it("returns 401 to an anonymous caller", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await app.request("/health/deep");

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns 403 to a signed-in non-admin", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u-member", role: "user" },
      session: { id: "s2" },
    });

    const res = await app.request("/health/deep");

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("leaks no queue depths or sync freshness in the rejection body", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.syncQueueCounts.mockResolvedValue({ waiting: 42 });
    await seedSyncRun("full", "completed", minutesAgo(5));

    const res = await app.request("/health/deep");
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).not.toHaveProperty("checks");
    expect(JSON.stringify(body)).not.toContain("42");
    // The probes must not even run for an unauthenticated caller.
    expect(mocks.syncQueueCounts).not.toHaveBeenCalled();
  });

  it("still serves the shallow /health without a session", async () => {
    mocks.getSession.mockResolvedValue(null);

    // Uptime probes poll this one; gating it would page on every deploy.
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("serves the full payload to an admin", async () => {
    const { res, body } = await deep();

    expect(res.status).toBe(200);
    expect(body.checks).toBeDefined();
  });
});

describe("GET /health/deep — outbox lag", () => {
  it("reports zero lag on an empty outbox", async () => {
    const { res, body } = await deep();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.db).toBe("ok");
    expect(body.checks.redis).toBe("ok");
    expect(body.checks.outboxLagSeconds).toBe(0);
  });

  it("reports lag for an old unprocessed event and trips degraded", async () => {
    await seedEvent("evt-old", minutesAgo(10));

    const { res, body } = await deep();

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.outboxLagSeconds).toBeGreaterThanOrEqual(599);
  });

  it("counts an enqueued-but-undelivered event as lag", async () => {
    // Stranded: the poller leased it but the worker never marked it processed.
    await seedEvent("evt-stranded", minutesAgo(10), { enqueuedAt: minutesAgo(9) });

    const { body } = await deep();

    expect(body.checks.outboxLagSeconds).toBeGreaterThanOrEqual(599);
  });

  it("ignores processed events however old they are", async () => {
    await seedEvent("evt-done", minutesAgo(600), { processedAt: minutesAgo(599) });

    const { res, body } = await deep();

    // Dropping `processed_at IS NULL` would resurrect this 10-hour-old row as lag.
    expect(res.status).toBe(200);
    expect(body.checks.outboxLagSeconds).toBe(0);
  });

  it("measures the oldest unprocessed event, not an arbitrary one", async () => {
    await seedEvent("evt-recent", minutesAgo(1));
    await seedEvent("evt-oldest", minutesAgo(20));
    await seedEvent("evt-middle", minutesAgo(5));

    const { body } = await deep();

    expect(body.checks.outboxLagSeconds).toBeGreaterThanOrEqual(1199);
    expect(body.checks.outboxLagSeconds).toBeLessThan(1300);
  });

  it("stays healthy while lag is inside the 300s budget", async () => {
    await seedEvent("evt-fresh", new Date(Date.now() - 60_000));

    const { res, body } = await deep();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
  });

  it("reports an error rather than a number when the db is down", async () => {
    breakDb();

    const { res, body } = await deep();

    expect(res.status).toBe(503);
    expect(body.checks.db).toBe("error");
    expect(body.checks.outboxLagSeconds).toBe("error");
  });
});

describe("GET /health/deep — sync freshness", () => {
  it("reports null when no full sync has ever completed", async () => {
    const { body } = await deep();
    expect(body.checks.lastSuccessfulSyncAgeSeconds).toBeNull();
  });

  it("reports the age of the last completed full sync", async () => {
    await seedSyncRun("full", "completed", minutesAgo(1));

    const { body } = await deep();

    expect(body.checks.lastSuccessfulSyncAgeSeconds).toBeGreaterThanOrEqual(59);
  });

  it("ignores a failed full sync", async () => {
    await seedSyncRun("full", "failed", minutesAgo(1));

    const { body } = await deep();

    // A predicate on `status` that matched 'failed' would report an age here.
    expect(body.checks.lastSuccessfulSyncAgeSeconds).toBeNull();
  });

  it("ignores a completed incremental sync", async () => {
    await seedSyncRun("incremental", "completed", minutesAgo(1));

    const { body } = await deep();

    expect(body.checks.lastSuccessfulSyncAgeSeconds).toBeNull();
  });

  it("picks the most recent completed full sync", async () => {
    await seedSyncRun("full", "completed", minutesAgo(600));
    await seedSyncRun("full", "completed", minutesAgo(2));
    await seedSyncRun("full", "completed", minutesAgo(300));

    const { body } = await deep();

    expect(body.checks.lastSuccessfulSyncAgeSeconds).toBeGreaterThanOrEqual(119);
    expect(body.checks.lastSuccessfulSyncAgeSeconds).toBeLessThan(200);
  });
});

describe("GET /health/deep — dependencies", () => {
  it("flags degraded when redis is down", async () => {
    mocks.redisPing.mockRejectedValue(new Error("nope"));

    const { res, body } = await deep();

    expect(res.status).toBe(503);
    expect(body.checks.redis).toBe("error");
  });

  it("reports each queue's job counts", async () => {
    mocks.syncQueueCounts.mockResolvedValue({ waiting: 1 });
    mocks.eventsQueueCounts.mockResolvedValue({ waiting: 2 });
    mocks.outboxPollQueueCounts.mockResolvedValue({ waiting: 3 });

    const { body } = await deep();

    expect(body.checks.syncQueue).toEqual({ waiting: 1 });
    expect(body.checks.eventsQueue).toEqual({ waiting: 2 });
    // The old suite never stubbed outboxPollQueue at all, so this check was
    // permanently "error" and nobody noticed.
    expect(body.checks.outboxPollQueue).toEqual({ waiting: 3 });
  });

  it.each([
    ["syncQueue", "syncQueueCounts"],
    ["eventsQueue", "eventsQueueCounts"],
    ["outboxPollQueue", "outboxPollQueueCounts"],
  ] as const)("handles %s errors gracefully", async (checkKey, mockKey) => {
    mocks[mockKey].mockRejectedValue(new Error("redis"));

    const { res, body } = await deep();

    // A queue-count failure is reported but does not by itself mark the API down.
    expect(res.status).toBe(200);
    expect(body.checks[checkKey]).toBe("error");
  });
});

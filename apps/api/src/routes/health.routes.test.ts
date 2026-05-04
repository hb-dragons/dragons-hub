import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  redisPing: vi.fn(),
  selectChain: vi.fn(),
  syncQueueCounts: vi.fn(),
  eventsQueueCounts: vi.fn(),
}));

vi.mock("../config/database", () => ({
  db: {
    execute: (...a: unknown[]) => mocks.dbExecute(...a),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => mocks.selectChain(),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("../config/redis", () => ({
  redis: {
    ping: () => mocks.redisPing(),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  domainEvents: { createdAt: "createdAt", enqueuedAt: "enqueuedAt" },
  syncRuns: { syncType: "syncType", status: "status", completedAt: "completedAt" },
}));

vi.mock("drizzle-orm", () => ({
  sql: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

vi.mock("../workers/queues", () => ({
  syncQueue: { getJobCounts: (...a: unknown[]) => mocks.syncQueueCounts(...a) },
  domainEventsQueue: { getJobCounts: (...a: unknown[]) => mocks.eventsQueueCounts(...a) },
}));

import { healthRoutes } from "./health.routes";

const app = new Hono().route("/", healthRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbExecute.mockResolvedValue(undefined);
  mocks.redisPing.mockResolvedValue("PONG");
  mocks.selectChain.mockResolvedValue([]);
  mocks.syncQueueCounts.mockResolvedValue({ waiting: 0 });
  mocks.eventsQueueCounts.mockResolvedValue({ waiting: 0 });
});

describe("GET /health", () => {
  it("returns 200 when db and redis are reachable", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("returns 503 when db is unreachable", async () => {
    mocks.dbExecute.mockRejectedValue(new Error("nope"));
    const res = await app.request("/health");
    expect(res.status).toBe(503);
  });

  it("returns 503 when redis is unreachable", async () => {
    mocks.redisPing.mockRejectedValue(new Error("nope"));
    const res = await app.request("/health");
    expect(res.status).toBe(503);
  });
});

describe("GET /health/deep", () => {
  it("returns 200 with checks payload when healthy", async () => {
    const res = await app.request("/health/deep");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; checks: Record<string, unknown> };
    expect(body.status).toBe("ok");
    expect(body.checks.db).toBe("ok");
    expect(body.checks.redis).toBe("ok");
    expect(body.checks.outboxLagSeconds).toBe(0);
  });

  it("reports outbox lag when oldest unenqueued event is old", async () => {
    const oldDate = new Date(Date.now() - 600 * 1000);
    mocks.selectChain.mockResolvedValueOnce([{ createdAt: oldDate }]);
    mocks.selectChain.mockResolvedValueOnce([]);
    const res = await app.request("/health/deep");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { checks: Record<string, unknown> };
    expect(body.checks.outboxLagSeconds).toBeGreaterThanOrEqual(599);
  });

  it("flags degraded when db is down", async () => {
    mocks.dbExecute.mockRejectedValue(new Error("nope"));
    const res = await app.request("/health/deep");
    expect(res.status).toBe(503);
  });

  it("flags degraded when redis is down", async () => {
    mocks.redisPing.mockRejectedValue(new Error("nope"));
    const res = await app.request("/health/deep");
    expect(res.status).toBe(503);
  });

  it("reports last successful sync age when present", async () => {
    const completedAt = new Date(Date.now() - 60 * 1000);
    mocks.selectChain.mockResolvedValueOnce([]);
    mocks.selectChain.mockResolvedValueOnce([{ completedAt, status: "completed" }]);
    const res = await app.request("/health/deep");
    const body = (await res.json()) as { checks: Record<string, unknown> };
    expect(body.checks.lastSuccessfulSyncAgeSeconds).toBeGreaterThanOrEqual(59);
  });

  it("handles queue counts errors gracefully", async () => {
    mocks.syncQueueCounts.mockRejectedValue(new Error("redis"));
    const res = await app.request("/health/deep");
    const body = (await res.json()) as { checks: Record<string, unknown> };
    expect(body.checks.syncQueue).toBe("error");
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  listDomainEvents: vi.fn(),
}));

vi.mock("../../services/admin/event-admin.service", () => ({
  listDomainEvents: mocks.listDomainEvents,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { eventRoutes } from "./event.routes";
import { errorHandler } from "../../middleware/error";

// Test app with fake user context
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("user", { id: "test-user-123" } as never);
  await next();
});
app.onError(errorHandler);
app.route("/", eventRoutes);

function json(response: Response) {
  return response.json();
}

const sampleEvent = {
  id: 1,
  type: "match.schedule.changed",
  entityType: "match",
  entityId: "42",
  source: "sync",
  payload: { matchId: 42, changes: ["date"] },
  createdAt: "2026-03-17T00:00:00.000Z",
};

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /events", () => {
  it("returns 200 with event list", async () => {
    const payload = { events: [sampleEvent], total: 1 };
    mocks.listDomainEvents.mockResolvedValue(payload);

    const res = await app.request("/events");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(payload);
    expect(mocks.listDomainEvents).toHaveBeenCalledWith({});
  });

  it("passes page and limit to service", async () => {
    mocks.listDomainEvents.mockResolvedValue({ events: [], total: 0 });

    await app.request("/events?page=2&limit=10");

    expect(mocks.listDomainEvents).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
    });
  });

  it("passes type filter to service", async () => {
    mocks.listDomainEvents.mockResolvedValue({ events: [], total: 0 });

    await app.request("/events?type=match.schedule.changed");

    expect(mocks.listDomainEvents).toHaveBeenCalledWith({
      type: "match.schedule.changed",
    });
  });

  it("passes entityType filter to service", async () => {
    mocks.listDomainEvents.mockResolvedValue({ events: [], total: 0 });

    await app.request("/events?entityType=match");

    expect(mocks.listDomainEvents).toHaveBeenCalledWith({
      entityType: "match",
    });
  });

  it("passes source filter to service", async () => {
    mocks.listDomainEvents.mockResolvedValue({ events: [], total: 0 });

    await app.request("/events?source=sync");

    expect(mocks.listDomainEvents).toHaveBeenCalledWith({
      source: "sync",
    });
  });

  it("passes from and to date filters to service", async () => {
    mocks.listDomainEvents.mockResolvedValue({ events: [], total: 0 });

    await app.request("/events?from=2026-03-01&to=2026-03-17");

    expect(mocks.listDomainEvents).toHaveBeenCalledWith({
      from: "2026-03-01",
      to: "2026-03-17",
    });
  });

  it("passes search param to service", async () => {
    mocks.listDomainEvents.mockResolvedValue({ events: [], total: 0 });

    await app.request("/events?search=Dragons");

    expect(mocks.listDomainEvents).toHaveBeenCalledWith({
      search: "Dragons",
    });
  });

  it("passes all query params together", async () => {
    mocks.listDomainEvents.mockResolvedValue({ events: [], total: 0 });

    await app.request(
      "/events?page=1&limit=25&type=match.created&entityType=match&source=sync&search=test",
    );

    expect(mocks.listDomainEvents).toHaveBeenCalledWith({
      page: 1,
      limit: 25,
      type: "match.created",
      entityType: "match",
      source: "sync",
      search: "test",
    });
  });

  it("returns 400 for invalid page (zero)", async () => {
    const res = await app.request("/events?page=0");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative page", async () => {
    const res = await app.request("/events?page=-1");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for limit exceeding max", async () => {
    const res = await app.request("/events?limit=101");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for search exceeding 200 chars", async () => {
    const longSearch = "a".repeat(201);
    const res = await app.request(`/events?search=${longSearch}`);

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("accepts search at exactly 200 chars", async () => {
    mocks.listDomainEvents.mockResolvedValue({ events: [], total: 0 });
    const maxSearch = "a".repeat(200);

    const res = await app.request(`/events?search=${maxSearch}`);

    expect(res.status).toBe(200);
    expect(mocks.listDomainEvents).toHaveBeenCalledWith({
      search: maxSearch,
    });
  });
});

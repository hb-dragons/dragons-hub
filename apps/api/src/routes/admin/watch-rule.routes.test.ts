import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  listWatchRules: vi.fn(),
  getWatchRule: vi.fn(),
  createWatchRule: vi.fn(),
  updateWatchRule: vi.fn(),
  deleteWatchRule: vi.fn(),
}));

vi.mock("../../services/admin/watch-rule-admin.service", () => ({
  listWatchRules: mocks.listWatchRules,
  getWatchRule: mocks.getWatchRule,
  createWatchRule: mocks.createWatchRule,
  updateWatchRule: mocks.updateWatchRule,
  deleteWatchRule: mocks.deleteWatchRule,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { watchRuleRoutes } from "./watch-rule.routes";
import { errorHandler } from "../../middleware/error";

// Test app with fake user context
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("user", { id: "test-user-123" } as never);
  await next();
});
app.onError(errorHandler);
app.route("/", watchRuleRoutes);

function json(response: Response) {
  return response.json();
}

const sampleRule = {
  id: 1,
  name: "Match changes",
  enabled: true,
  createdBy: "test-user-123",
  eventTypes: ["match.schedule.changed"],
  filters: [{ field: "teamId", operator: "eq", value: "42" }],
  channels: [{ channel: "in_app", targetId: "1" }],
  urgencyOverride: null,
  templateOverride: null,
  createdAt: "2026-03-17T00:00:00.000Z",
  updatedAt: "2026-03-17T00:00:00.000Z",
};

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /watch-rules", () => {
  it("returns paginated watch rules", async () => {
    const payload = { rules: [sampleRule], total: 1 };
    mocks.listWatchRules.mockResolvedValue(payload);

    const res = await app.request("/watch-rules");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(payload);
    expect(mocks.listWatchRules).toHaveBeenCalledWith({});
  });

  it("passes page and limit to service", async () => {
    mocks.listWatchRules.mockResolvedValue({ rules: [], total: 0 });

    await app.request("/watch-rules?page=2&limit=10");

    expect(mocks.listWatchRules).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
    });
  });

  it("returns 400 for invalid page", async () => {
    const res = await app.request("/watch-rules?page=0");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for limit exceeding max", async () => {
    const res = await app.request("/watch-rules?limit=101");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("GET /watch-rules/:id", () => {
  it("returns a single watch rule", async () => {
    mocks.getWatchRule.mockResolvedValue(sampleRule);

    const res = await app.request("/watch-rules/1");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(sampleRule);
    expect(mocks.getWatchRule).toHaveBeenCalledWith(1);
  });

  it("returns 404 when rule not found", async () => {
    mocks.getWatchRule.mockResolvedValue(null);

    const res = await app.request("/watch-rules/999");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/watch-rules/0");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/watch-rules/abc");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("POST /watch-rules", () => {
  const validBody = {
    name: "Match changes",
    eventTypes: ["match.schedule.changed"],
    channels: [{ channel: "in_app", targetId: "1" }],
  };

  it("creates a watch rule", async () => {
    mocks.createWatchRule.mockResolvedValue(sampleRule);

    const res = await app.request("/watch-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toEqual(sampleRule);
    expect(mocks.createWatchRule).toHaveBeenCalledWith(
      validBody,
      "test-user-123",
    );
  });

  it("uses 'system' as createdBy when user is not set", async () => {
    mocks.createWatchRule.mockResolvedValue(sampleRule);
    const bareApp = new Hono<AppEnv>();
    bareApp.onError(errorHandler);
    bareApp.route("/", watchRuleRoutes);

    await bareApp.request("/watch-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(mocks.createWatchRule).toHaveBeenCalledWith(validBody, "system");
  });

  it("passes optional fields", async () => {
    mocks.createWatchRule.mockResolvedValue(sampleRule);

    const body = {
      ...validBody,
      enabled: false,
      filters: [{ field: "teamId", operator: "eq", value: "42" }],
      urgencyOverride: "immediate",
    };

    await app.request("/watch-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(mocks.createWatchRule).toHaveBeenCalledWith(body, "test-user-123");
  });

  it("returns 400 when name is missing", async () => {
    const res = await app.request("/watch-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventTypes: ["match.created"], channels: [{ channel: "in_app", targetId: "1" }] }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when eventTypes is empty", async () => {
    const res = await app.request("/watch-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", eventTypes: [], channels: [{ channel: "in_app", targetId: "1" }] }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when channels is empty", async () => {
    const res = await app.request("/watch-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", eventTypes: ["match.created"], channels: [] }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /watch-rules/:id", () => {
  it("updates a watch rule", async () => {
    const updated = { ...sampleRule, name: "Updated" };
    mocks.updateWatchRule.mockResolvedValue(updated);

    const res = await app.request("/watch-rules/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.updateWatchRule).toHaveBeenCalledWith(1, { name: "Updated" });
  });

  it("returns 404 when rule not found", async () => {
    mocks.updateWatchRule.mockResolvedValue(null);

    const res = await app.request("/watch-rules/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/watch-rules/0", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("DELETE /watch-rules/:id", () => {
  it("deletes a watch rule", async () => {
    mocks.deleteWatchRule.mockResolvedValue(true);

    const res = await app.request("/watch-rules/1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.deleteWatchRule).toHaveBeenCalledWith(1);
  });

  it("returns 404 when rule not found", async () => {
    mocks.deleteWatchRule.mockResolvedValue(false);

    const res = await app.request("/watch-rules/999", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/watch-rules/0", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

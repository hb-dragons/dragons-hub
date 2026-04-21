import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./config/database", () => ({
  db: {
    execute: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./config/redis", () => ({
  redis: {
    ping: vi.fn().mockResolvedValue("PONG"),
  },
}));

vi.mock("./workers/queues", () => ({
  syncQueue: {
    name: "sync",
    getJobs: vi.fn().mockResolvedValue([]),
  },
}));

const mockGetSession = vi.fn().mockResolvedValue(null);
const mockUserHasPermission = vi.fn().mockResolvedValue({ success: false });
vi.mock("./config/auth", () => ({
  auth: {
    handler: vi.fn().mockResolvedValue(new Response("ok")),
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      userHasPermission: (...args: unknown[]) => mockUserHasPermission(...args),
    },
  },
}));

vi.mock("./config/logger", () => ({
  logger: {
    child: vi.fn(() => ({
      level: "info",
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    })),
    error: vi.fn(),
  },
}));

vi.mock("@bull-board/api", () => ({
  createBullBoard: vi.fn(),
}));

vi.mock("@bull-board/api/bullMQAdapter", () => ({
  BullMQAdapter: class {},
}));

vi.mock("@bull-board/hono", async () => {
  const { Hono } = await import("hono");
  return {
    HonoAdapter: class {
      setBasePath() {}
      registerPlugin() {
        return new Hono();
      }
    },
  };
});

import { app } from "./app";

beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue(null);
  mockUserHasPermission.mockReset().mockResolvedValue({ success: false });
});

describe("api routes", () => {
  it("returns health status", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      db: "ok",
      redis: "ok",
    });
  });

  it("returns service metadata on root", async () => {
    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: "api",
      message: "Hello from Hono",
    });
  });

  it("serves OpenAPI spec at /openapi.json", async () => {
    const response = await app.request("/openapi.json");

    expect(response.status).toBe(200);
    const spec = await response.json();
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Dragons API");
    expect(spec.paths).toBeDefined();
  });

  it("serves Scalar docs at /docs", async () => {
    const response = await app.request("/docs");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});

describe("Bull Board admin gate", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await app.request("/admin/queues");
    expect(response.status).toBe(401);
  });

  it("returns 403 when authenticated user lacks settings:update", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: null },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: false });
    const response = await app.request("/admin/queues");
    expect(response.status).toBe(403);
  });

  it("passes middleware when user has settings:update (admin)", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: true });
    const response = await app.request("/admin/queues");
    // The mocked Bull Board plugin returns an empty Hono app, which yields 404
    // for unmatched paths. What matters is that we got past the 401/403 gate.
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    expect(mockUserHasPermission).toHaveBeenCalledWith({
      body: {
        userId: "u1",
        permissions: { settings: ["update"] },
      },
    });
  });
});

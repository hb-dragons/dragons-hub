import { describe, expect, it, vi } from "vitest";

vi.mock("./config/env", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    SDK_USERNAME: "test",
    SDK_PASSWORD: "test",
    BETTER_AUTH_SECRET: "testsecrettestsecrettestsecrettest",
    BETTER_AUTH_URL: "http://localhost:3001",
    PORT: 3001,
    NODE_ENV: "test",
    TRUSTED_ORIGINS: "http://localhost:3000",
  },
}));

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

vi.mock("./config/auth", () => ({
  auth: {
    handler: vi.fn().mockResolvedValue(new Response("ok")),
    api: { getSession: vi.fn().mockResolvedValue(null) },
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

describe("api routes", () => {
  it("returns health status", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", db: "ok", redis: "ok" });
  });

  it("returns service metadata on root", async () => {
    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: "api",
      message: "Hello from Hono",
    });
  });
});

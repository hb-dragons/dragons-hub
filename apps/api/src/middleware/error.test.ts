import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { z } from "zod";
import type { Logger } from "pino";
import type { AppEnv } from "../types";

// --- Mock setup (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  rootLogger: {
    error: vi.fn(),
  },
  childLogger: {
    level: "info",
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  },
}));

vi.mock("../config/logger", () => ({
  logger: mocks.rootLogger,
}));

// --- Imports (after mocks) ---

import { errorHandler } from "./error";

// App WITHOUT request logger middleware — error handler falls back to root logger
function createBareApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);

  app.get("/throw-error", () => {
    throw new Error("Something broke");
  });

  app.get("/throw-zod", () => {
    const schema = z.object({ name: z.string() });
    const result = schema.safeParse({ name: 42 });
    if (!result.success) throw result.error;
    return new Response("ok");
  });

  app.get("/throw-non-error", () => {
    throw new Error("Unknown error occurred");
  });

  return app;
}

// App WITH a manually-set context logger — simulates the request logger middleware
function createAppWithContextLogger() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);

  // Simulate what requestLogger does: set a child logger on context
  app.use("*", async (c, next) => {
    c.set("logger", mocks.childLogger as unknown as Logger);
    await next();
  });

  app.get("/throw-error", () => {
    throw new Error("Something broke");
  });

  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("errorHandler", () => {
  it("returns 400 for ZodError", async () => {
    const app = createBareApp();
    const res = await app.request("/throw-zod");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request data");
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details).toHaveLength(1);
    expect(body.details[0].path).toBe("name");
  });

  it("does not call logger for ZodError", async () => {
    const app = createBareApp();
    await app.request("/throw-zod");

    expect(mocks.rootLogger.error).not.toHaveBeenCalled();
  });

  it("returns 500 with message in non-production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";

    const app = createBareApp();
    const res = await app.request("/throw-error");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Something broke");
    expect(body.code).toBe("INTERNAL_ERROR");

    process.env.NODE_ENV = originalEnv;
  });

  it("returns generic message in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const app = createBareApp();
    const res = await app.request("/throw-error");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");

    process.env.NODE_ENV = originalEnv;
  });

  it("handles Error instances with stack trace", async () => {
    const app = createBareApp();
    const res = await app.request("/throw-non-error");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("handles non-Error values passed directly to handler", async () => {
    const mockContext = {
      get: vi.fn().mockReturnValue(undefined),
      json: vi.fn().mockReturnValue(new Response("{}", { status: 500 })),
    };

    errorHandler("string error" as never, mockContext as never);

    expect(mockContext.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Unknown error" }),
      500,
    );
    expect(mocks.rootLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: "string error", stack: undefined }),
      "Unknown error",
    );
  });

  it("logs error using root logger when no context logger is set", async () => {
    const app = createBareApp();
    await app.request("/throw-error");

    expect(mocks.rootLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        stack: expect.any(String),
      }),
      "Something broke",
    );
  });

  it("logs error using context logger when available", async () => {
    const app = createAppWithContextLogger();
    await app.request("/throw-error");

    expect(mocks.childLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        stack: expect.any(String),
      }),
      "Something broke",
    );
    // Root logger should NOT be called when context logger is available
    expect(mocks.rootLogger.error).not.toHaveBeenCalled();
  });
});

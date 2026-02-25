import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../types";

// --- Mock setup ---

const mockChildLogger = {
  level: "info",
  info: vi.fn(),
  debug: vi.fn(),
};

const mockLogger = {
  child: vi.fn(() => mockChildLogger),
};

vi.mock("../config/logger", () => ({
  logger: {
    child: (...args: Parameters<typeof mockLogger.child>) => mockLogger.child(...args),
  },
}));

import { requestLogger } from "./request-logger";

function createApp() {
  const app = new Hono<AppEnv>();
  app.use("*", requestLogger);
  app.get("/test", (c) => c.json({ ok: true }));
  app.post("/items", (c) => c.json({ created: true }, 201));
  app.get("/context", (c) => {
    const logger = c.get("logger");
    const requestId = c.get("requestId");
    return c.json({ hasLogger: !!logger, requestId });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockChildLogger.level = "info";
});

describe("requestLogger", () => {
  it("logs request info at info level", async () => {
    const app = createApp();

    await app.request("/test");

    expect(mockLogger.child).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: expect.any(String) }),
    );
    expect(mockChildLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/test",
        status: 200,
        duration: expect.any(Number),
      }),
      expect.stringContaining("GET /test → 200"),
    );
  });

  it("sets x-request-id response header", async () => {
    const app = createApp();

    const res = await app.request("/test");
    const requestId = res.headers.get("x-request-id");

    expect(requestId).toBeTruthy();
    // UUID v4 format
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("sets logger and requestId on context", async () => {
    const app = createApp();

    const res = await app.request("/context");
    const body = await res.json();

    expect(body.hasLogger).toBe(true);
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("logs POST requests", async () => {
    const app = createApp();

    await app.request("/items", { method: "POST" });

    expect(mockChildLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/items",
        status: 201,
      }),
      expect.stringContaining("POST /items → 201"),
    );
  });

  it("logs debug details when level is debug", async () => {
    mockChildLogger.level = "debug";
    const app = createApp();

    await app.request("/test");

    // Incoming request logged at debug
    expect(mockChildLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/test",
        url: expect.stringContaining("/test"),
        headers: expect.any(Object),
      }),
      "→ incoming request",
    );

    // Response logged at debug
    const responseCall = mockChildLogger.debug.mock.calls.find(
      (call: unknown[]) => call[1] === "← response sent",
    );
    expect(responseCall).toBeDefined();
    expect(responseCall![0]).toMatchObject({
      status: 200,
      duration: expect.any(Number),
    });
    expect(responseCall![0]).toHaveProperty("contentLength");
  });

  it("logs debug details when level is trace", async () => {
    mockChildLogger.level = "trace";
    const app = createApp();

    await app.request("/test");

    expect(mockChildLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/test",
      }),
      "→ incoming request",
    );

    expect(mockChildLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
      }),
      "← response sent",
    );
  });

  it("redacts sensitive headers", async () => {
    mockChildLogger.level = "debug";
    const app = createApp();

    await app.request("/test", {
      headers: {
        authorization: "Bearer secret-token",
        cookie: "session=abc123",
        "x-custom": "visible",
      },
    });

    const debugCall = mockChildLogger.debug.mock.calls.find(
      (call: unknown[]) => call[1] === "→ incoming request",
    );
    expect(debugCall).toBeDefined();

    const { headers } = debugCall![0] as { headers: Record<string, string> };
    expect(headers["authorization"]).toBe("[REDACTED]");
    expect(headers["cookie"]).toBe("[REDACTED]");
    expect(headers["x-custom"]).toBe("visible");
  });

  it("does not log debug details when level is info", async () => {
    mockChildLogger.level = "info";
    const app = createApp();

    await app.request("/test");

    expect(mockChildLogger.debug).not.toHaveBeenCalled();
  });
});

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
    child: (...args: Parameters<typeof mockLogger.child>) =>
      mockLogger.child(...args),
  },
}));

const runWithLogContext = vi.fn(
  async (_ctx: unknown, fn: () => unknown) => fn(),
);

vi.mock("../config/log-context", () => ({
  runWithLogContext: (ctx: unknown, fn: () => unknown) =>
    runWithLogContext(ctx, fn),
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
  it("logs request info with httpRequest field", async () => {
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
        httpRequest: expect.objectContaining({
          requestMethod: "GET",
          requestUrl: expect.stringContaining("/test"),
          status: 200,
          latency: expect.stringMatching(/^\d+\.\d{3}s$/),
        }),
      }),
      expect.stringContaining("GET /test → 200"),
    );
  });

  it("sets x-request-id response header", async () => {
    const app = createApp();
    const res = await app.request("/test");
    const requestId = res.headers.get("x-request-id");

    expect(requestId).toBeTruthy();
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

  it("logs POST requests with their method and status", async () => {
    const app = createApp();
    await app.request("/items", { method: "POST" });

    expect(mockChildLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/items",
        status: 201,
        httpRequest: expect.objectContaining({
          requestMethod: "POST",
          status: 201,
        }),
      }),
      expect.stringContaining("POST /items → 201"),
    );
  });

  it("emits debug-level incoming + response when level=debug", async () => {
    mockChildLogger.level = "debug";
    const app = createApp();
    await app.request("/test");

    expect(mockChildLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/test",
        url: expect.stringContaining("/test"),
        headers: expect.any(Object),
      }),
      "→ incoming request",
    );

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

  it("emits debug-level details when level=trace", async () => {
    mockChildLogger.level = "trace";
    const app = createApp();
    await app.request("/test");

    expect(mockChildLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ method: "GET", path: "/test" }),
      "→ incoming request",
    );
    expect(mockChildLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200 }),
      "← response sent",
    );
  });

  it("redacts sensitive headers at debug level", async () => {
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

  it("skips debug logs when level=info", async () => {
    mockChildLogger.level = "info";
    const app = createApp();
    await app.request("/test");

    expect(mockChildLogger.debug).not.toHaveBeenCalled();
  });

  it("parses X-Cloud-Trace-Context and passes it through ALS context", async () => {
    const app = createApp();
    await app.request("/test", {
      headers: {
        "x-cloud-trace-context": "abc123def456/9876543210;o=1",
      },
    });

    expect(runWithLogContext).toHaveBeenCalledTimes(1);
    const ctx = runWithLogContext.mock.calls[0]![0] as Record<string, unknown>;
    expect(ctx).toMatchObject({
      requestId: expect.any(String),
      traceId: "abc123def456",
      spanId: "9876543210",
      traceSampled: true,
    });
  });

  it("parses X-Cloud-Trace-Context without sampled flag", async () => {
    const app = createApp();
    await app.request("/test", {
      headers: { "x-cloud-trace-context": "abc/111" },
    });

    const ctx = runWithLogContext.mock.calls[0]![0] as Record<string, unknown>;
    expect(ctx).toMatchObject({
      traceId: "abc",
      spanId: "111",
      traceSampled: false,
    });
  });

  it("falls back to W3C traceparent header when x-cloud-trace is absent", async () => {
    const app = createApp();
    await app.request("/test", {
      headers: {
        traceparent:
          "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      },
    });

    const ctx = runWithLogContext.mock.calls[0]![0] as Record<string, unknown>;
    expect(ctx).toMatchObject({
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceSampled: true,
    });
  });

  it("marks W3C traceparent as unsampled when flag bit is 0", async () => {
    const app = createApp();
    await app.request("/test", {
      headers: {
        traceparent:
          "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00",
      },
    });

    const ctx = runWithLogContext.mock.calls[0]![0] as Record<string, unknown>;
    expect(ctx.traceSampled).toBe(false);
  });

  it("ignores malformed x-cloud-trace-context header", async () => {
    const app = createApp();
    await app.request("/test", {
      headers: { "x-cloud-trace-context": "garbage" },
    });

    const ctx = runWithLogContext.mock.calls[0]![0] as Record<string, unknown>;
    expect(ctx.traceId).toBeUndefined();
    expect(ctx.spanId).toBeUndefined();
  });

  it("ignores malformed traceparent header", async () => {
    const app = createApp();
    await app.request("/test", {
      headers: { traceparent: "not-a-traceparent" },
    });

    const ctx = runWithLogContext.mock.calls[0]![0] as Record<string, unknown>;
    expect(ctx.traceId).toBeUndefined();
  });

  it("prefers X-Cloud-Trace-Context over traceparent", async () => {
    const app = createApp();
    await app.request("/test", {
      headers: {
        "x-cloud-trace-context": "deadbeef/123;o=1",
        traceparent:
          "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      },
    });

    const ctx = runWithLogContext.mock.calls[0]![0] as Record<string, unknown>;
    expect(ctx.traceId).toBe("deadbeef");
  });

  it("leaves trace fields undefined when no trace headers are present", async () => {
    const app = createApp();
    await app.request("/test");

    const ctx = runWithLogContext.mock.calls[0]![0] as Record<string, unknown>;
    expect(ctx.traceId).toBeUndefined();
    expect(ctx.spanId).toBeUndefined();
    expect(ctx.traceSampled).toBeUndefined();
  });

  it("anonymizes remoteIp (IPv4) sourced from x-forwarded-for", async () => {
    const app = createApp();
    await app.request("/test", {
      headers: {
        "x-forwarded-for": "203.0.113.5, 10.0.0.1",
        "user-agent": "curl/8.0",
      },
    });

    const infoCall = mockChildLogger.info.mock.calls[0]!;
    expect(infoCall[0].httpRequest).toMatchObject({
      remoteIp: "203.0.113.0",
      userAgent: "curl/8.0",
    });
  });

  it("falls back to x-real-ip and anonymizes it", async () => {
    const app = createApp();
    await app.request("/test", {
      headers: { "x-real-ip": "198.51.100.9" },
    });

    const infoCall = mockChildLogger.info.mock.calls[0]!;
    expect(infoCall[0].httpRequest.remoteIp).toBe("198.51.100.0");
  });

  it("redacts query-string values in requestUrl", async () => {
    const app = createApp();
    await app.request("/test?email=alice@example.com&token=xyz");

    const infoCall = mockChildLogger.info.mock.calls[0]!;
    const url = infoCall[0].httpRequest.requestUrl as string;
    expect(url).toContain("/test");
    expect(url).toContain("email=%5BREDACTED%5D");
    expect(url).toContain("token=%5BREDACTED%5D");
    expect(url).not.toContain("alice@example.com");
    expect(url).not.toContain("xyz");
  });
});

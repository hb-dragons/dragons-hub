import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
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

const envMock = vi.hoisted(() => ({ verbose: false }));
vi.mock("../config/env", () => ({
  env: {
    get VERBOSE_ERRORS() {
      return envMock.verbose;
    },
  },
}));

// --- Imports (after mocks) ---

import { errorHandler } from "./error";
import { AppError } from "../app-error";
import { SyncAlreadyQueuedError } from "../services/sync-jobs.errors";
import { RefereeSdkNotConfiguredError } from "../services/sync/sdk-client.errors";
import { TeamReorderError } from "../services/admin/team-admin.errors";

// A stand-in for any service's AppError subclass. The handler must map it from
// the instance's own `status`, with no knowledge of the subclass.
class TestAppError extends AppError {}

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

  app.get("/throw-sync-already-queued", () => {
    throw new SyncAlreadyQueuedError();
  });

  app.get("/throw-referee-sdk-not-configured", () => {
    throw new RefereeSdkNotConfiguredError();
  });

  app.get("/throw-team-reorder", () => {
    throw TeamReorderError.invalidTeamSet();
  });

  app.get("/throw-app-error-422", () => {
    throw new TestAppError("Referee is not qualified", "NOT_QUALIFIED", 422);
  });

  app.get("/throw-app-error-502", () => {
    throw new TestAppError("Federation rejected the write", "FEDERATION_ERROR", 502);
  });

  app.get("/throw-http-401", () => {
    throw new HTTPException(401, { message: "Unauthorized" });
  });

  app.get("/throw-http-403", () => {
    throw new HTTPException(403, { message: "Forbidden" });
  });

  app.get("/throw-http-404", () => {
    throw new HTTPException(404, { message: "Not found" });
  });

  app.get("/throw-http-418", () => {
    throw new HTTPException(418, { message: "I'm a teapot" });
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

  it("returns 409 with the SYNC_ALREADY_QUEUED code for SyncAlreadyQueuedError", async () => {
    const app = createBareApp();
    const res = await app.request("/throw-sync-already-queued");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Sync already in progress or queued",
      code: "SYNC_ALREADY_QUEUED",
    });
  });

  it("does not report SyncAlreadyQueuedError to the error logger", async () => {
    const app = createBareApp();
    await app.request("/throw-sync-already-queued");

    expect(mocks.rootLogger.error).not.toHaveBeenCalled();
  });

  it("returns 503 with the REFEREE_SDK_NOT_CONFIGURED code for RefereeSdkNotConfiguredError", async () => {
    const app = createBareApp();
    const res = await app.request("/throw-referee-sdk-not-configured");

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("REFEREE_SDK_NOT_CONFIGURED");
    expect(body.error).toMatch(/REFEREE_SDK_USERNAME/);
  });

  it("returns 400 with the INVALID_TEAM_SET code for TeamReorderError", async () => {
    const app = createBareApp();
    const res = await app.request("/throw-team-reorder");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "The team order must list every own-club team exactly once.",
      code: "INVALID_TEAM_SET",
    });
  });

  it("maps an AppError to the status carried on the instance", async () => {
    const app = createBareApp();
    const res = await app.request("/throw-app-error-422");

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Referee is not qualified",
      code: "NOT_QUALIFIED",
    });
  });

  it("does not report a 4xx AppError to the error logger", async () => {
    const app = createBareApp();
    await app.request("/throw-app-error-422");

    expect(mocks.rootLogger.error).not.toHaveBeenCalled();
  });

  it("reports a 5xx AppError to Cloud Error Reporting", async () => {
    const app = createBareApp();
    const res = await app.request("/throw-app-error-502");

    expect(res.status).toBe(502);
    expect(mocks.rootLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(TestAppError),
        stack_trace: expect.any(String),
        "@type":
          "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
      }),
      "Federation rejected the write",
    );
  });

  it("names an AppError subclass after its own class", () => {
    const error = new TestAppError("boom", "BOOM", 400);

    expect(error.name).toBe("TestAppError");
  });

  it("does not call logger for ZodError", async () => {
    const app = createBareApp();
    await app.request("/throw-zod");

    expect(mocks.rootLogger.error).not.toHaveBeenCalled();
  });

  it("returns the error message when VERBOSE_ERRORS is enabled", async () => {
    envMock.verbose = true;
    const app = createBareApp();
    const res = await app.request("/throw-error");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Something broke");
    expect(body.code).toBe("INTERNAL_ERROR");
    envMock.verbose = false;
  });

  it("returns generic message when VERBOSE_ERRORS is disabled", async () => {
    envMock.verbose = false;
    const app = createBareApp();
    const res = await app.request("/throw-error");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
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

    envMock.verbose = true;
    void errorHandler("string error" as never, mockContext as never);
    envMock.verbose = false;

    expect(mockContext.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Unknown error" }),
      500,
    );
    expect(mocks.rootLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: "string error",
        stack_trace: undefined,
        "@type":
          "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
      }),
      "Unknown error",
    );
  });

  it("logs error using root logger when no context logger is set", async () => {
    const app = createBareApp();
    await app.request("/throw-error");

    expect(mocks.rootLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        stack_trace: expect.any(String),
        "@type":
          "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
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
        stack_trace: expect.any(String),
        "@type":
          "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
      }),
      "Something broke",
    );
    expect(mocks.rootLogger.error).not.toHaveBeenCalled();
  });

  it("returns 401 with UNAUTHORIZED code for HTTPException(401)", async () => {
    const app = createBareApp();
    const res = await app.request("/throw-http-401");

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 403 with FORBIDDEN code for HTTPException(403)", async () => {
    const app = createBareApp();
    const res = await app.request("/throw-http-403");

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden", code: "FORBIDDEN" });
  });

  it("returns 404 with NOT_FOUND code for HTTPException(404)", async () => {
    const app = createBareApp();
    const res = await app.request("/throw-http-404");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Not found", code: "NOT_FOUND" });
  });

  it("returns the HTTPException status with generic HTTP_ERROR code for other statuses", async () => {
    const app = createBareApp();
    const res = await app.request("/throw-http-418");

    expect(res.status).toBe(418);
    const body = await res.json();
    expect(body).toEqual({ error: "I'm a teapot", code: "HTTP_ERROR" });
  });
});

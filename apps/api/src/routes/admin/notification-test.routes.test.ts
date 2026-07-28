import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---
//
// The business logic (device scoping, aggregation, masking, dedup) now lives
// in test-push.service.ts and is covered there against a real database. This
// route test mocks the service wholesale and only proves the wiring: auth,
// validation, rate limiting, and that a thrown TestPushError reaches the
// caller through errorHandler with the right status/code — using the real
// TestPushError class, not a stand-in, so a class that silently fails
// `instanceof AppError` cannot slip past a green suite.

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  userHasPermission: vi.fn(),
  sendAdminTestPush: vi.fn(),
  listRecentTestPushes: vi.fn(),
  incrementSlidingWindow: vi.fn(),
}));

vi.mock("../../config/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
      userHasPermission: (...args: unknown[]) => mocks.userHasPermission(...args),
    },
  },
}));

vi.mock("../../config/redis", () => ({
  incrementSlidingWindow: (...args: unknown[]) => mocks.incrementSlidingWindow(...args),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.mock("../../services/notifications/test-push.service", () => ({
  sendAdminTestPush: (...args: unknown[]) => mocks.sendAdminTestPush(...args),
  listRecentTestPushes: (...args: unknown[]) => mocks.listRecentTestPushes(...args),
}));

// --- Imports (after mocks) ---

import { notificationTestRoutes } from "./notification-test.routes";
import { errorHandler } from "../../middleware/error";
import { logger } from "../../config/logger";
import { TestPushError } from "../../services/notifications/test-push.errors";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", notificationTestRoutes);

const ADMIN = "u_admin";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    user: { id: ADMIN, role: "admin" },
    session: { id: "sess-admin" },
  });
  mocks.userHasPermission.mockResolvedValue({ success: true });
  // Under the limit by default: current=1, previous=0 against limit=1.
  mocks.incrementSlidingWindow.mockResolvedValue([1, 0]);
  mocks.sendAdminTestPush.mockResolvedValue({
    deviceCount: 1,
    tickets: [{ platform: "ios", status: "sent_ticket", ticketId: "tkt_1", error: null }],
  });
  mocks.listRecentTestPushes.mockResolvedValue([]);
});

function post(body: unknown = {}) {
  return app.request("/notifications/test-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /notifications/test-push — authorization", () => {
  it("returns 401 when there is no session", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect(mocks.sendAdminTestPush).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller lacks settings:update", async () => {
    mocks.userHasPermission.mockResolvedValue({ success: false });
    expect((await post()).status).toBe(403);
    expect(mocks.sendAdminTestPush).not.toHaveBeenCalled();
  });
});

describe("POST /notifications/test-push — validation", () => {
  it("rejects a body that fails the contract schema", async () => {
    const res = await post({ message: 42 });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.sendAdminTestPush).not.toHaveBeenCalled();
  });

  it("passes an empty body through as no message", async () => {
    await post();

    expect(mocks.sendAdminTestPush).toHaveBeenCalledWith({
      callerId: ADMIN,
      message: undefined,
    });
  });

  // Regression: validator() must run before rateLimit(). The route's window is
  // `limit: 1, windowSeconds: 10` — if the limiter ran first, a malformed body
  // would still increment the counter and burn the caller's only slot, so a
  // genuinely valid send right after would 429 instead of sending. Asserting
  // incrementSlidingWindow was never called for the rejected request proves the
  // limiter did not run at all, not just that the second request happened to
  // succeed.
  it("does not consume the rate-limit budget on a malformed body", async () => {
    const rejected = await post({ message: 42 });
    expect(rejected.status).toBe(400);
    expect(mocks.incrementSlidingWindow).not.toHaveBeenCalled();

    mocks.incrementSlidingWindow.mockResolvedValueOnce([1, 0]);
    const accepted = await post({ message: "hello" });
    expect(accepted.status).toBe(200);
  });
});

describe("POST /notifications/test-push — success delegation", () => {
  it("passes the caller id and message to the service and returns its result verbatim", async () => {
    mocks.sendAdminTestPush.mockResolvedValue({
      deviceCount: 2,
      tickets: [
        { platform: "ios", status: "sent_ticket", ticketId: "tkt_1", error: null },
        { platform: "android", status: "failed", ticketId: null, error: "boom" },
      ],
    });

    const res = await post({ message: "hello" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deviceCount: 2,
      tickets: [
        { platform: "ios", status: "sent_ticket", ticketId: "tkt_1", error: null },
        { platform: "android", status: "failed", ticketId: null, error: "boom" },
      ],
    });
    expect(mocks.sendAdminTestPush).toHaveBeenCalledWith({
      callerId: ADMIN,
      message: "hello",
    });
  });
});

describe("POST /notifications/test-push — typed service errors", () => {
  it("maps a NO_DEVICES rejection to 400 with the error's own code", async () => {
    mocks.sendAdminTestPush.mockRejectedValue(
      new TestPushError("Open the native app on a signed-in device first.", "NO_DEVICES"),
    );

    const res = await post();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Open the native app on a signed-in device first.",
      code: "NO_DEVICES",
    });
  });

  it("maps a PUSH_CHANNEL_MISSING rejection to 500 and reports it", async () => {
    mocks.sendAdminTestPush.mockRejectedValue(
      new TestPushError("No push channel is configured", "PUSH_CHANNEL_MISSING"),
    );

    const res = await post();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "No push channel is configured",
      code: "PUSH_CHANNEL_MISSING",
    });
    // The AppError 5xx branch in errorHandler is what reports a 500 to Cloud
    // Error Reporting — this is the assertion that it actually ran, not just
    // that the status happened to come out right.
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("POST /notifications/test-push — rate limiting", () => {
  it("rate-limits a second test push inside the cooldown window", async () => {
    mocks.incrementSlidingWindow.mockResolvedValueOnce([1, 0]);
    expect((await post()).status).toBe(200);

    mocks.incrementSlidingWindow.mockResolvedValueOnce([2, 0]);
    const second = await post();

    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ error: "Too many requests", code: "RATE_LIMITED" });
    expect(second.headers.get("Retry-After")).toBe("10");
    expect(mocks.sendAdminTestPush).toHaveBeenCalledTimes(1);
  });
});

describe("GET /notifications/test-push/recent", () => {
  it("returns 401 without a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await app.request("/notifications/test-push/recent")).status).toBe(401);
    expect(mocks.listRecentTestPushes).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller lacks settings:update", async () => {
    mocks.userHasPermission.mockResolvedValue({ success: false });
    expect((await app.request("/notifications/test-push/recent")).status).toBe(403);
  });

  it("wraps the service result in a results envelope", async () => {
    mocks.listRecentTestPushes.mockResolvedValue([
      {
        id: 1,
        sentAt: new Date("2026-01-01T00:00:00.000Z"),
        recipientToken: "...abcdef",
        status: "sent_ticket",
        providerTicketId: "tkt_1",
        errorMessage: null,
      },
    ]);

    const res = await app.request("/notifications/test-push/recent");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        {
          id: 1,
          sentAt: "2026-01-01T00:00:00.000Z",
          recipientToken: "...abcdef",
          status: "sent_ticket",
          providerTicketId: "tkt_1",
          errorMessage: null,
        },
      ],
    });
    expect(mocks.listRecentTestPushes).toHaveBeenCalledWith(ADMIN);
  });
});

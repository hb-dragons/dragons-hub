import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  retryFailedNotification: vi.fn(),
  getUserNotificationPreferences: vi.fn(),
  updateUserNotificationPreferences: vi.fn(),
}));

vi.mock("../../services/admin/notification-admin.service", () => ({
  listNotifications: mocks.listNotifications,
  markRead: mocks.markRead,
  markAllRead: mocks.markAllRead,
  retryFailedNotification: mocks.retryFailedNotification,
}));

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() =>
    async (_c: unknown, next: () => Promise<void>) => next(),
  ),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("../../services/notifications/user-preferences.service", () => ({
  getUserNotificationPreferences: mocks.getUserNotificationPreferences,
  updateUserNotificationPreferences: mocks.updateUserNotificationPreferences,
}));

// --- Imports (after mocks) ---

import { notificationRoutes } from "./notification.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.use("*", async (c, next) => {
  c.set("user", { id: "test-user-1", name: "Test" } as unknown as AppEnv["Variables"]["user"]);
  c.set("session", {} as unknown as AppEnv["Variables"]["session"]);
  await next();
});
app.route("/", notificationRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /notifications", () => {
  it("returns the caller's notifications", async () => {
    const payload = {
      notifications: [{ id: 1, title: "Test" }],
      total: 1,
    };
    mocks.listNotifications.mockResolvedValue(payload);

    const res = await app.request("/notifications");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(payload);
    expect(mocks.listNotifications).toHaveBeenCalledWith({
      userId: "test-user-1",
      limit: undefined,
      offset: undefined,
    });
  });

  it("passes limit and offset to service", async () => {
    mocks.listNotifications.mockResolvedValue({
      notifications: [],
      total: 0,
    });

    await app.request("/notifications?limit=10&offset=20");

    expect(mocks.listNotifications).toHaveBeenCalledWith({
      userId: "test-user-1",
      limit: 10,
      offset: 20,
    });
  });

  it("returns 400 for invalid limit", async () => {
    const res = await app.request("/notifications?limit=0");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for limit exceeding maximum", async () => {
    const res = await app.request("/notifications?limit=101");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative offset", async () => {
    const res = await app.request("/notifications?offset=-1");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

// Issue #123: cross-user reads of the notification log are not intended. The
// caller here holds settings:update (rbac is mocked to a pass-through, which is
// the permissive case), so these assert the scoping the route does on its own.
describe("GET /notifications cross-user reads (#123)", () => {
  it("ignores ?userId= and lists as the session user", async () => {
    mocks.listNotifications.mockResolvedValue({ notifications: [], total: 0 });

    const res = await app.request("/notifications?userId=victim-user-2");

    expect(res.status).toBe(200);
    expect(mocks.listNotifications).toHaveBeenCalledWith({
      userId: "test-user-1",
      limit: undefined,
      offset: undefined,
    });
    expect(mocks.listNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: "victim-user-2" }),
    );
  });

  it("returns user A's rows, not the requested user B's", async () => {
    // The service is scoped by the id it is handed, so mirror that: it only
    // ever yields rows for whoever the route passed.
    mocks.listNotifications.mockImplementation(
      ({ userId }: { userId: string }) => ({
        notifications: [{ id: 1, title: `inbox of ${userId}` }],
        total: 1,
      }),
    );

    const res = await app.request("/notifications?userId=victim-user-2");

    expect(await json(res)).toEqual({
      notifications: [{ id: 1, title: "inbox of test-user-1" }],
      total: 1,
    });
  });

  it("keeps limit and offset while still ignoring userId", async () => {
    mocks.listNotifications.mockResolvedValue({ notifications: [], total: 0 });

    await app.request("/notifications?userId=victim-user-2&limit=5&offset=1");

    expect(mocks.listNotifications).toHaveBeenCalledWith({
      userId: "test-user-1",
      limit: 5,
      offset: 1,
    });
  });

  it("has no unread-count route to read another user's count from", async () => {
    const res = await app.request("/notifications/unread-count?userId=victim-user-2");

    expect(res.status).toBe(404);
  });
});

describe("PATCH /notifications/:id/read", () => {
  it("marks notification as read", async () => {
    mocks.markRead.mockResolvedValue(true);

    const res = await app.request("/notifications/1/read", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.markRead).toHaveBeenCalledWith(1, "test-user-1");
  });

  it("returns 404 when notification not found", async () => {
    mocks.markRead.mockResolvedValue(false);

    const res = await app.request("/notifications/999/read", {
      method: "PATCH",
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/notifications/0/read", {
      method: "PATCH",
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/notifications/abc/read", {
      method: "PATCH",
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /notifications/read-all", () => {
  it("marks all of the caller's notifications as read", async () => {
    mocks.markAllRead.mockResolvedValue(3);

    const res = await app.request("/notifications/read-all", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ updated: 3 });
    expect(mocks.markAllRead).toHaveBeenCalledWith("test-user-1");
  });

  it("returns 0 when nothing to update", async () => {
    mocks.markAllRead.mockResolvedValue(0);

    const res = await app.request("/notifications/read-all", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ updated: 0 });
  });

  it("ignores a query userId and always scopes to the caller", async () => {
    mocks.markAllRead.mockResolvedValue(3);

    const res = await app.request("/notifications/read-all?userId=someone-else", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    expect(mocks.markAllRead).toHaveBeenCalledWith("test-user-1");
  });
});

describe("GET /notifications/unread-count", () => {
  // Removed in #120: the route had no consumer, and its `userId` query param
  // was the only unscoped read of another user's notification state.
  it("is no longer routed", async () => {
    const res = await app.request("/notifications/unread-count?userId=user-1");

    expect(res.status).toBe(404);
  });
});

describe("POST /notifications/:id/retry", () => {
  it("returns 200 on successful retry", async () => {
    mocks.retryFailedNotification.mockResolvedValue({ success: true });

    const res = await app.request("/notifications/1/retry", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.retryFailedNotification).toHaveBeenCalledWith(1);
  });

  it("returns 404 when notification not found", async () => {
    mocks.retryFailedNotification.mockResolvedValue({
      success: false,
      error: "Notification not found",
    });

    const res = await app.request("/notifications/999/retry", {
      method: "POST",
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 when retry fails", async () => {
    mocks.retryFailedNotification.mockResolvedValue({
      success: false,
      error: "Notification is not in failed state",
    });

    const res = await app.request("/notifications/1/retry", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "RETRY_FAILED" });
  });

  it("returns 400 for invalid id (zero)", async () => {
    const res = await app.request("/notifications/0/retry", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/notifications/abc/retry", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("GET /notifications/preferences", () => {
  it("returns the caller's preferences", async () => {
    mocks.getUserNotificationPreferences.mockResolvedValue({
      mutedEventTypes: [],
      locale: "de",
    });
    const res = await app.request("/notifications/preferences");
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ mutedEventTypes: [], locale: "de" });
    expect(mocks.getUserNotificationPreferences).toHaveBeenCalledWith("test-user-1");
  });
});

describe("PATCH /notifications/preferences", () => {
  it("updates the caller's preferences", async () => {
    mocks.updateUserNotificationPreferences.mockResolvedValue({
      mutedEventTypes: ["task.assigned"],
      locale: "en",
    });
    const res = await app.request("/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mutedEventTypes: ["task.assigned"], locale: "en" }),
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ mutedEventTypes: ["task.assigned"], locale: "en" });
    expect(mocks.updateUserNotificationPreferences).toHaveBeenCalledWith("test-user-1", {
      mutedEventTypes: ["task.assigned"],
      locale: "en",
    });
  });

  // Previously this mocked the service into rejecting and relied on the route
  // matching the Error's message text. The contract enumerates the vocabulary
  // now (issue #156), so the 400 is real: the validator rejects the body and
  // the service is never reached.
  it("returns 400 for an event type that is not user-toggleable", async () => {
    const res = await app.request("/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mutedEventTypes: ["bogus.event"] }),
    });
    expect(res.status).toBe(400);
    expect(mocks.updateUserNotificationPreferences).not.toHaveBeenCalled();
  });

  it("returns 400 for a real event type the user cannot toggle", async () => {
    const res = await app.request("/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mutedEventTypes: ["match.created"] }),
    });
    expect(res.status).toBe(400);
    expect(mocks.updateUserNotificationPreferences).not.toHaveBeenCalled();
  });
});

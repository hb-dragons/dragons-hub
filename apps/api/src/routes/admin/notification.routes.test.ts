import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  getUnreadCount: vi.fn(),
}));

vi.mock("../../services/admin/notification-admin.service", () => ({
  listNotifications: mocks.listNotifications,
  markRead: mocks.markRead,
  markAllRead: mocks.markAllRead,
  getUnreadCount: mocks.getUnreadCount,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { notificationRoutes } from "./notification.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", notificationRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /notifications", () => {
  it("returns notifications for a user", async () => {
    const payload = {
      notifications: [{ id: 1, title: "Test" }],
      total: 1,
    };
    mocks.listNotifications.mockResolvedValue(payload);

    const res = await app.request("/notifications?userId=user-1");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(payload);
    expect(mocks.listNotifications).toHaveBeenCalledWith({
      userId: "user-1",
    });
  });

  it("passes limit and offset to service", async () => {
    mocks.listNotifications.mockResolvedValue({
      notifications: [],
      total: 0,
    });

    await app.request("/notifications?userId=user-1&limit=10&offset=20");

    expect(mocks.listNotifications).toHaveBeenCalledWith({
      userId: "user-1",
      limit: 10,
      offset: 20,
    });
  });

  it("returns 400 when userId is missing", async () => {
    const res = await app.request("/notifications");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid limit", async () => {
    const res = await app.request("/notifications?userId=user-1&limit=0");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for limit exceeding maximum", async () => {
    const res = await app.request("/notifications?userId=user-1&limit=101");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative offset", async () => {
    const res = await app.request("/notifications?userId=user-1&offset=-1");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
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
    expect(mocks.markRead).toHaveBeenCalledWith(1);
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
  it("marks all notifications as read", async () => {
    mocks.markAllRead.mockResolvedValue(3);

    const res = await app.request("/notifications/read-all?userId=user-1", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ updated: 3 });
    expect(mocks.markAllRead).toHaveBeenCalledWith("user-1");
  });

  it("returns 0 when nothing to update", async () => {
    mocks.markAllRead.mockResolvedValue(0);

    const res = await app.request("/notifications/read-all?userId=user-1", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ updated: 0 });
  });

  it("returns 400 when userId is missing", async () => {
    const res = await app.request("/notifications/read-all", {
      method: "PATCH",
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("GET /notifications/unread-count", () => {
  it("returns unread count for a user", async () => {
    mocks.getUnreadCount.mockResolvedValue(5);

    const res = await app.request(
      "/notifications/unread-count?userId=user-1",
    );

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ count: 5 });
    expect(mocks.getUnreadCount).toHaveBeenCalledWith("user-1");
  });

  it("returns 0 when no unread notifications", async () => {
    mocks.getUnreadCount.mockResolvedValue(0);

    const res = await app.request(
      "/notifications/unread-count?userId=user-1",
    );

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ count: 0 });
  });

  it("returns 400 when userId is missing", async () => {
    const res = await app.request("/notifications/unread-count");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

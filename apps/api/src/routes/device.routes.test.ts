import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbInsert: vi.fn(),
  dbDelete: vi.fn(),
}));

vi.mock("../config/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
    },
  },
}));

vi.mock("../config/database", () => ({
  db: {
    insert: (...args: unknown[]) => mocks.dbInsert(...args),
    delete: (...args: unknown[]) => mocks.dbDelete(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  pushDevices: {
    token: "token",
    userId: "user_id",
    platform: "platform",
    updatedAt: "updated_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}));

vi.mock("../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { deviceRoutes } from "./device.routes";
import { errorHandler } from "../middleware/error";

// Test app with error handler
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", deviceRoutes);

function json(response: Response) {
  return response.json();
}

// --- Helpers ---

const validSession = {
  user: { id: "user-123", role: "user" },
  session: { id: "sess-1" },
};

function mockInsertSuccess() {
  mocks.dbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

function mockDeleteSuccess() {
  mocks.dbDelete.mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /register", () => {
  it("registers a device token and returns success", async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mockInsertSuccess();

    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "fcm-token-abc", platform: "ios" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.dbInsert).toHaveBeenCalled();
  });

  it("registers an android device token", async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mockInsertSuccess();

    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "fcm-token-xyz", platform: "android" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "fcm-token-abc", platform: "ios" }),
    });

    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 400 for invalid platform", async () => {
    mocks.getSession.mockResolvedValue(validSession);

    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "fcm-token-abc", platform: "windows" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when token is missing", async () => {
    mocks.getSession.mockResolvedValue(validSession);

    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "ios" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when token is empty string", async () => {
    mocks.getSession.mockResolvedValue(validSession);

    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "", platform: "ios" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when platform is missing", async () => {
    mocks.getSession.mockResolvedValue(validSession);

    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "fcm-token-abc" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when body is empty", async () => {
    mocks.getSession.mockResolvedValue(validSession);

    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("DELETE /:token", () => {
  it("unregisters a device token and returns success", async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mockDeleteSuccess();

    const res = await app.request("/my-device-token", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.dbDelete).toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await app.request("/my-device-token", {
      method: "DELETE",
    });

    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns success even when token does not exist", async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mockDeleteSuccess();

    const res = await app.request("/nonexistent-token", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  setUserRefereeLink: vi.fn(),
}));

vi.mock("../../services/admin/user-admin.service", () => ({
  setUserRefereeLink: mocks.setUserRefereeLink,
}));

vi.mock("../../middleware/rbac", () => ({
  requireAnyRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { userRoutes } from "./user.routes";
import { errorHandler } from "../../middleware/error";
// The real class, deliberately not mocked: errorHandler maps it by
// `instanceof AppError`, so a stand-in `extends Error` double would fall
// through to a 500 and these status assertions would test nothing. The errors
// module is a leaf with no database imports, so using it here is free.
import { UserAdminError } from "../../services/admin/user-admin.errors";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", userRoutes);

function patch(userId: string, body: unknown) {
  return app.request(`/users/${userId}/referee-link`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /users/:id/referee-link", () => {
  it("links a referee to a user", async () => {
    mocks.setUserRefereeLink.mockResolvedValue({ id: "user-1", refereeId: 42 });

    const res = await patch("user-1", { refereeId: 42 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "user-1", refereeId: 42 });
    expect(mocks.setUserRefereeLink).toHaveBeenCalledWith("user-1", 42);
  });

  it("unlinks a referee from a user", async () => {
    mocks.setUserRefereeLink.mockResolvedValue({ id: "user-1", refereeId: null });

    const res = await patch("user-1", { refereeId: null });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "user-1", refereeId: null });
    expect(mocks.setUserRefereeLink).toHaveBeenCalledWith("user-1", null);
  });

  it("returns 404 with the REFEREE_NOT_FOUND code when the referee does not exist", async () => {
    mocks.setUserRefereeLink.mockRejectedValue(
      new UserAdminError("Referee not found", "REFEREE_NOT_FOUND"),
    );

    const res = await patch("user-1", { refereeId: 4242 });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "REFEREE_NOT_FOUND" });
  });

  it("returns 404 with the USER_NOT_FOUND code when the user does not exist", async () => {
    mocks.setUserRefereeLink.mockRejectedValue(
      new UserAdminError("User not found", "USER_NOT_FOUND"),
    );

    const res = await patch("nonexistent", { refereeId: 42 });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "USER_NOT_FOUND" });
  });

  it("rejects a non-integer refereeId with 400 without calling the service", async () => {
    const res = await patch("user-1", { refereeId: "42" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.setUserRefereeLink).not.toHaveBeenCalled();
  });
});

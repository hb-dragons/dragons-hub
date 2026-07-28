import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import type * as ConfigEnv from "../../config/env";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listSnapshots: vi.fn(),
  getDeviceHealth: vi.fn(),
}));

vi.mock("../../config/auth", () => ({
  auth: {
    api: {
      getSession: (...a: unknown[]) => mocks.getSession(...a),
    },
  },
}));

// "d1" stands in for the single configured scoreboard panel.
vi.mock("../../config/env", async () => {
  const actual = await vi.importActual<typeof ConfigEnv>("../../config/env");
  return {
    env: new Proxy(actual.env, {
      get(target, prop) {
        if (prop === "SCOREBOARD_DEVICE_ID") return "d1";
        return Reflect.get(target, prop);
      },
    }),
  };
});

vi.mock("../../services/scoreboard/live-snapshot", () => ({
  listSnapshots: (...a: unknown[]) => mocks.listSnapshots(...a),
  getDeviceHealth: (...a: unknown[]) => mocks.getDeviceHealth(...a),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

import { adminScoreboardRoutes } from "./scoreboard.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/admin/scoreboard", adminScoreboardRoutes);

const adminSession = {
  user: { id: "u1", role: "admin" },
  session: { id: "s1" },
};

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.listSnapshots.mockReset();
  mocks.getDeviceHealth.mockReset();
});

describe("admin scoreboard routes", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const r = await app.request("/admin/scoreboard/snapshots?deviceId=d1");
    expect(r.status).toBe(401);
  });

  it("rejects non-admin", async () => {
    mocks.getSession.mockResolvedValue({
      ...adminSession,
      user: { id: "u1", role: "user" },
    });
    const r = await app.request("/admin/scoreboard/snapshots?deviceId=d1");
    expect(r.status).toBe(403);
  });

  it("returns paginated snapshots for admin", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.listSnapshots.mockResolvedValue([
      { id: 2, scoreHome: 5, scoreGuest: 4 },
      { id: 1, scoreHome: 4, scoreGuest: 4 },
    ]);
    const r = await app.request(
      "/admin/scoreboard/snapshots?deviceId=d1&limit=2",
    );
    expect(r.status).toBe(200);
    expect(((await r.json()) as Array<unknown>).length).toBe(2);
    expect(mocks.listSnapshots).toHaveBeenCalledWith({
      deviceId: "d1",
      limit: 2,
    });
  });

  it("rejects a missing deviceId on /snapshots with the shared envelope", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const r = await app.request("/admin/scoreboard/snapshots");
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      details: expect.any(Array),
    });
    expect(mocks.listSnapshots).not.toHaveBeenCalled();
  });

  it("returns health for admin", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.getDeviceHealth.mockResolvedValue({
      deviceId: "d1",
      lastFrameAt: new Date().toISOString(),
      secondsSinceLastFrame: 1,
      online: true,
    });
    const r = await app.request("/admin/scoreboard/health?deviceId=d1");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { online: boolean };
    expect(body.online).toBe(true);
  });

  it.each(["snapshots", "health"])(
    "404s /%s for a deviceId that is not the configured panel",
    async (path) => {
      mocks.getSession.mockResolvedValue(adminSession);

      const r = await app.request(`/admin/scoreboard/${path}?deviceId=other`);

      expect(r.status).toBe(404);
      expect(await r.json()).toMatchObject({ code: "UNKNOWN_DEVICE" });
      expect(mocks.listSnapshots).not.toHaveBeenCalled();
      expect(mocks.getDeviceHealth).not.toHaveBeenCalled();
    },
  );

  it("400s /health without a deviceId with the shared envelope", async () => {
    mocks.getSession.mockResolvedValue(adminSession);

    const r = await app.request("/admin/scoreboard/health");

    // Before this task, /health hand-rolled `{ error: "deviceId required",
    // code: "BAD_REQUEST" }` with no `details`. Routing it through
    // scoreboardDeviceQuerySchema now produces the same
    // { error, code, details } envelope every validated route emits.
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      details: expect.any(Array),
    });
    expect(mocks.getDeviceHealth).not.toHaveBeenCalled();
  });

  it("returns 500 through the shared error handler when a service throws", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.getDeviceHealth.mockRejectedValue(new Error("db exploded"));

    const r = await app.request("/admin/scoreboard/health?deviceId=d1");

    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});

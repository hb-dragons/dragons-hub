import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  selectSnapshots: vi.fn(),
  selectLive: vi.fn(),
}));

vi.mock("../../config/auth", () => ({
  auth: {
    api: {
      getSession: (...a: unknown[]) => mocks.getSession(...a),
    },
  },
}));

vi.mock("../../config/database", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => mocks.selectSnapshots(),
          }),
          limit: async () => mocks.selectLive(),
        }),
      }),
    }),
  },
}));

import { adminScoreboardRoutes } from "./scoreboard.routes";

const app = new Hono<AppEnv>();
app.route("/admin/scoreboard", adminScoreboardRoutes);

const adminSession = {
  user: { id: "u1", role: "admin" },
  session: { id: "s1" },
};

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.selectSnapshots.mockReset();
  mocks.selectLive.mockReset();
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
    mocks.selectSnapshots.mockResolvedValue([
      { id: 2, scoreHome: 5, scoreGuest: 4 },
      { id: 1, scoreHome: 4, scoreGuest: 4 },
    ]);
    const r = await app.request(
      "/admin/scoreboard/snapshots?deviceId=d1&limit=2",
    );
    expect(r.status).toBe(200);
    expect(((await r.json()) as Array<unknown>).length).toBe(2);
  });

  it("returns health for admin", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.selectLive.mockResolvedValue([
      { deviceId: "d1", lastFrameAt: new Date() },
    ]);
    const r = await app.request("/admin/scoreboard/health?deviceId=d1");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { online: boolean };
    expect(body.online).toBe(true);
  });
});

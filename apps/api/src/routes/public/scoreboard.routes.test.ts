import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({
  selectLive: vi.fn(),
  createStream: vi.fn(),
}));

vi.mock("../../config/env", () => ({
  env: { SCOREBOARD_DEVICE_ID: "d1" },
}));

vi.mock("../../config/database", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mocks.selectLive(),
        }),
      }),
    }),
  },
}));

vi.mock("../../services/scoreboard/sse", () => ({
  createScoreboardStream: (...a: unknown[]) => mocks.createStream(...a),
}));

import { publicScoreboardRoutes } from "./scoreboard.routes";

const app = new Hono();
app.route("/public/scoreboard", publicScoreboardRoutes);

beforeEach(() => {
  mocks.selectLive.mockReset();
  mocks.createStream.mockReset();
});

describe("GET /public/scoreboard/latest", () => {
  it("returns 404 when no row exists", async () => {
    mocks.selectLive.mockResolvedValue([]);
    const r = await app.request("/public/scoreboard/latest?deviceId=d1");
    expect(r.status).toBe(404);
  });

  it("returns the row plus secondsSinceLastFrame", async () => {
    mocks.selectLive.mockResolvedValue([
      {
        deviceId: "d1",
        scoreHome: 5,
        scoreGuest: 4,
        lastFrameAt: new Date(Date.now() - 3000),
      },
    ]);
    const r = await app.request("/public/scoreboard/latest?deviceId=d1");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { secondsSinceLastFrame: number };
    expect(body.secondsSinceLastFrame).toBeGreaterThanOrEqual(2);
  });

  it("requires deviceId", async () => {
    const r = await app.request("/public/scoreboard/latest");
    expect(r.status).toBe(400);
  });
});

describe("GET /public/scoreboard/stream", () => {
  it("delegates to createScoreboardStream", async () => {
    mocks.createStream.mockReturnValue(
      new Response("ok", { headers: { "Content-Type": "text/event-stream" } }),
    );
    const r = await app.request(
      "/public/scoreboard/stream?deviceId=d1",
      {
        headers: { "Last-Event-ID": "42" },
      },
    );
    expect(r.headers.get("Content-Type")).toBe("text/event-stream");
    expect(mocks.createStream).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: "d1",
        lastEventId: 42,
      }),
    );
  });

  it("rejects unknown deviceId with 404", async () => {
    const r = await app.request("/public/scoreboard/stream?deviceId=other");
    expect(r.status).toBe(404);
  });
});

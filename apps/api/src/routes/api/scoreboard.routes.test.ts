import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({
  processIngest: vi.fn(),
}));

vi.mock("../../services/scoreboard/ingest", () => ({
  processIngest: (...a: unknown[]) => mocks.processIngest(...a),
}));

vi.mock("../../config/env", () => ({
  env: {
    SCOREBOARD_INGEST_KEY: "k".repeat(48),
    SCOREBOARD_DEVICE_ID: "dragons-1",
  },
}));

const counters = new Map<string, number>();
vi.mock("../../config/redis", () => ({
  redis: {
    async incr(key: string) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async expire() {},
  },
}));

import { apiScoreboardRoutes } from "./scoreboard.routes";

const app = new Hono();
app.route("/api/scoreboard", apiScoreboardRoutes);

const headers = {
  Authorization: `Bearer ${"k".repeat(48)}`,
  Device_ID: "dragons-1",
  "Content-Type": "text/plain",
};

beforeEach(() => {
  mocks.processIngest.mockReset();
  counters.clear();
});

describe("POST /api/scoreboard/ingest", () => {
  it("returns 200 and the result from processIngest", async () => {
    mocks.processIngest.mockResolvedValue({
      ok: true,
      changed: true,
      snapshotId: 5,
    });
    const r = await app.request("/api/scoreboard/ingest", {
      method: "POST",
      headers,
      body: "deadbeef",
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, changed: true, snapshotId: 5 });
    expect(mocks.processIngest).toHaveBeenCalledWith({
      deviceId: "dragons-1",
      hex: "deadbeef",
    });
  });

  it("rejects bodies bigger than 8 KB", async () => {
    const r = await app.request("/api/scoreboard/ingest", {
      method: "POST",
      headers,
      body: "a".repeat(8 * 1024 + 1),
    });
    expect(r.status).toBe(413);
  });

  it("returns 401 without bearer", async () => {
    const r = await app.request("/api/scoreboard/ingest", {
      method: "POST",
      headers: { ...headers, Authorization: "" },
      body: "ab",
    });
    expect(r.status).toBe(401);
  });
});

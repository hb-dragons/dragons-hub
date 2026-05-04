import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../config/env", () => ({
  env: {
    SCOREBOARD_INGEST_KEY: "k".repeat(48),
    SCOREBOARD_DEVICE_ID: "dragons-1",
  },
}));

const counters = new Map<string, number>();
vi.mock("../config/redis", () => ({
  redis: {
    async incr(key: string) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async expire() {},
  },
}));

import { requireIngestKey } from "./ingest-key";

function makeApp() {
  const app = new Hono();
  app.use("*", requireIngestKey);
  app.get("/x", (c) => c.json({ ok: true }));
  return app;
}

beforeEach(() => counters.clear());

describe("requireIngestKey", () => {
  it("rejects missing Authorization", async () => {
    const res = await makeApp().request("/x", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("rejects wrong bearer", async () => {
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: { Authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects missing Device_ID", async () => {
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: { Authorization: `Bearer ${"k".repeat(48)}` },
    });
    expect(res.status).toBe(400);
  });

  it("rejects unknown Device_ID", async () => {
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${"k".repeat(48)}`,
        Device_ID: "other",
      },
    });
    expect(res.status).toBe(400);
  });

  it("allows valid headers", async () => {
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${"k".repeat(48)}`,
        Device_ID: "dragons-1",
      },
    });
    expect(res.status).toBe(200);
  });

  it("rate-limits over 30 requests per second per device", async () => {
    const app = makeApp();
    let last = 200;
    for (let i = 0; i < 31; i++) {
      const r = await app.request("/x", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${"k".repeat(48)}`,
          Device_ID: "dragons-1",
        },
      });
      last = r.status;
    }
    expect(last).toBe(429);
  });
});

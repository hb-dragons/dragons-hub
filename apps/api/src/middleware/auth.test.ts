import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// --- Mock setup ---

const mockGetSession = vi.fn();
vi.mock("../config/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

import { requireAdmin, requireReferee } from "./auth";

const app = new Hono();
app.use("/admin/*", requireAdmin);
app.get("/admin/test", (c) => c.json({ ok: true }));

const refereeApp = new Hono();
refereeApp.use("/ref/*", requireReferee);
refereeApp.get("/ref/test", (c) => c.json({ ok: true }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAdmin", () => {
  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await app.request("/admin/test");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 403 when user is not admin", async () => {
    mockGetSession.mockResolvedValue({
      user: { role: "user" },
      session: {},
    });

    const res = await app.request("/admin/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden", code: "FORBIDDEN" });
  });

  it("allows admin users through", async () => {
    mockGetSession.mockResolvedValue({
      user: { role: "admin", id: "1", name: "Admin" },
      session: { id: "sess-1" },
    });

    const res = await app.request("/admin/test");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("requireReferee", () => {
  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await refereeApp.request("/ref/test");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 403 for non-referee/non-admin user", async () => {
    mockGetSession.mockResolvedValue({
      user: { role: "user" },
      session: {},
    });

    const res = await refereeApp.request("/ref/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden", code: "FORBIDDEN" });
  });

  it("allows referee users through", async () => {
    mockGetSession.mockResolvedValue({
      user: { role: "referee", id: "2", name: "Referee" },
      session: { id: "sess-2" },
    });

    const res = await refereeApp.request("/ref/test");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("allows admin users through", async () => {
    mockGetSession.mockResolvedValue({
      user: { role: "admin", id: "1", name: "Admin" },
      session: { id: "sess-1" },
    });

    const res = await refereeApp.request("/ref/test");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

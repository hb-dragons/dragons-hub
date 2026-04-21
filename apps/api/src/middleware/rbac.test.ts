import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../types";

// --- Mock setup ---
const mockGetSession = vi.fn();
const mockUserHasPermission = vi.fn();
vi.mock("../config/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      userHasPermission: (...args: unknown[]) => mockUserHasPermission(...args),
    },
  },
}));

import {
  requireAuth,
  requirePermission,
  assertPermission,
  requireRefereeSelf,
  requireRefereeSelfOrPermission,
} from "./rbac";
import { errorHandler } from "./error";

beforeEach(() => {
  vi.clearAllMocks();
});

// --- requireAuth ---
describe("requireAuth", () => {
  const app = new Hono();
  app.use("/protected/*", requireAuth);
  app.get("/protected/ping", (c) => c.json({ ok: true }));

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await app.request("/protected/ping");
    expect(res.status).toBe(401);
  });

  it("passes through authenticated requests", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: null },
      session: { id: "s1" },
    });
    const res = await app.request("/protected/ping");
    expect(res.status).toBe(200);
  });
});

// --- requirePermission ---
describe("requirePermission", () => {
  const app = new Hono();
  app.use("/refs/*", requirePermission("referee", "update"));
  app.get("/refs/edit", (c) => c.json({ ok: true }));

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await app.request("/refs/edit");
    expect(res.status).toBe(401);
  });

  it("returns 403 when userHasPermission rejects", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "venueManager" },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: false });
    const res = await app.request("/refs/edit");
    expect(res.status).toBe(403);
  });

  it("allows requests when userHasPermission approves", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "refereeAdmin" },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: true });
    const res = await app.request("/refs/edit");
    expect(res.status).toBe(200);
  });

  it("calls userHasPermission with the resource/action specified at mount", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: true });
    await app.request("/refs/edit");
    expect(mockUserHasPermission).toHaveBeenCalledWith({
      body: {
        userId: "u1",
        permissions: { referee: ["update"] },
      },
    });
  });
});

// --- assertPermission ---
describe("assertPermission", () => {
  const app = new Hono();
  app.use("/x/*", requireAuth);
  app.get("/x/row/:id", async (c) => {
    await assertPermission(c, "assignment", "update");
    return c.json({ ok: true });
  });

  it("throws 403 when permission denied", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "venueManager" },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: false });
    const res = await app.request("/x/row/42");
    expect(res.status).toBe(403);
  });

  it("returns 200 when permission granted", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "refereeAdmin" },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: true });
    const res = await app.request("/x/row/42");
    expect(res.status).toBe(200);
  });
});

// --- assertPermission with errorHandler registered ---
// Regression guard: without errorHandler branching on HTTPException, these
// throws would reach the default 500 fallthrough and mask the real status.
describe("assertPermission with errorHandler registered", () => {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use("/y/*", requireAuth);
  app.get("/y/row/:id", async (c) => {
    await assertPermission(c, "assignment", "update");
    return c.json({ ok: true });
  });

  it("returns 403 with FORBIDDEN when permission denied (not 500)", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "venueManager" },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: false });
    const res = await app.request("/y/row/42");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden", code: "FORBIDDEN" });
  });

  it("returns 401 with UNAUTHORIZED when user is missing from context", async () => {
    // Build a separate app that skips requireAuth so assertPermission sees no user
    const appNoAuth = new Hono<AppEnv>();
    appNoAuth.onError(errorHandler);
    appNoAuth.get("/y/row/:id", async (c) => {
      await assertPermission(c, "assignment", "update");
      return c.json({ ok: true });
    });

    const res = await appNoAuth.request("/y/row/42");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });
});

// --- requireRefereeSelf ---
describe("requireRefereeSelf", () => {
  const app = new Hono<AppEnv>();
  app.use("/self/*", requireRefereeSelf);
  app.get("/self/games", (c) => c.json({ refereeId: c.get("refereeId") }));

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await app.request("/self/games");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no refereeId", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: null, refereeId: null },
      session: { id: "s1" },
    });
    const res = await app.request("/self/games");
    expect(res.status).toBe(403);
  });

  it("allows and populates refereeId when user is a referee", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: null, refereeId: 99 },
      session: { id: "s1" },
    });
    const res = await app.request("/self/games");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refereeId: 99 });
  });
});

describe("requireRefereeSelfOrPermission", () => {
  const app = new Hono<AppEnv>();
  app.use("/either/*", requireRefereeSelfOrPermission("assignment", "view"));
  app.get("/either/games", (c) =>
    c.json({ refereeId: c.get("refereeId") ?? null }),
  );

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await app.request("/either/games");
    expect(res.status).toBe(401);
  });

  it("passes a linked referee and populates refereeId", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: null, refereeId: 77 },
      session: { id: "s1" },
    });
    const res = await app.request("/either/games");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refereeId: 77 });
  });

  it("passes an admin (no refereeId) and leaves refereeId unset", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin", refereeId: null },
      session: { id: "s1" },
    });
    const res = await app.request("/either/games");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refereeId: null });
  });

  it("passes a refereeAdmin with no referee link (permission-only path)", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "refereeAdmin", refereeId: null },
      session: { id: "s1" },
    });
    const res = await app.request("/either/games");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refereeId: null });
  });

  it("returns 403 when user has neither referee link nor the permission", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "teamManager", refereeId: null },
      session: { id: "s1" },
    });
    const res = await app.request("/either/games");
    expect(res.status).toBe(403);
  });
});

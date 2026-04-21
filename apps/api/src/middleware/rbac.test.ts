import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

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
} from "./rbac";

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

// --- requireRefereeSelf ---
describe("requireRefereeSelf", () => {
  const app = new Hono();
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

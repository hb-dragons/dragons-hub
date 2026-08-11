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
  requireAnyRole,
  requirePermission,
  requireRefereeSelf,
  requireRefereeSelfOrAdminRole,
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

// --- requireAnyRole ---
describe("requireAnyRole", () => {
  const app = new Hono();
  app.use("/adm/*", requireAnyRole("admin"));
  app.get("/adm/panel", (c) => c.json({ ok: true }));

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await app.request("/adm/panel");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no role", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: null },
      session: { id: "s1" },
    });
    const res = await app.request("/adm/panel");
    expect(res.status).toBe(403);
  });

  it("returns 403 when user holds only non-matching roles", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "refereeAdmin,teamManager" },
      session: { id: "s1" },
    });
    const res = await app.request("/adm/panel");
    expect(res.status).toBe(403);
  });

  it("passes when user holds the required role", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    });
    const res = await app.request("/adm/panel");
    expect(res.status).toBe(200);
  });

  it("passes when user holds one of several accepted roles", async () => {
    const multi = new Hono();
    multi.use("/m/*", requireAnyRole("admin", "refereeAdmin"));
    multi.get("/m/x", (c) => c.json({ ok: true }));

    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "refereeAdmin" },
      session: { id: "s1" },
    });
    const res = await multi.request("/m/x");
    expect(res.status).toBe(200);
  });

  it("does not call userHasPermission", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    });
    await app.request("/adm/panel");
    expect(mockUserHasPermission).not.toHaveBeenCalled();
  });

  it("passes a superadmin on an admin-named gate", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "superadmin" },
      session: { id: "s1" },
    });
    const res = await app.request("/adm/panel");
    expect(res.status).toBe(200);
  });

  it("denies a plain admin on a superadmin-named gate", async () => {
    const sa = new Hono();
    sa.use("/sa/*", requireAnyRole("superadmin"));
    sa.get("/sa/x", (c) => c.json({ ok: true }));
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    });
    const res = await sa.request("/sa/x");
    expect(res.status).toBe(403);
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

// --- session reuse ---
//
// Production mounts these guards behind `app.use("/admin/*", requireAuth)`, so
// every admin request used to resolve the session twice: once in requireAuth and
// again in the granular guard. The guards now read what requireAuth left on the
// context, and still fetch when nothing is there.
describe("session lookups per request", () => {
  const withAuth = new Hono();
  withAuth.use("/admin/*", requireAuth);
  withAuth.use("/admin/perm/*", requirePermission("referee", "update"));
  withAuth.use("/admin/role/*", requireAnyRole("admin"));
  withAuth.get("/admin/perm/x", (c) => c.json({ ok: true }));
  withAuth.get("/admin/role/x", (c) => c.json({ ok: true }));

  const adminSession = { user: { id: "u1", role: "admin" }, session: { id: "s1" } };

  it("resolves the session once when requireAuth precedes requirePermission", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockUserHasPermission.mockResolvedValue({ success: true });

    const res = await withAuth.request("/admin/perm/x");

    expect(res.status).toBe(200);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("resolves the session once when requireAuth precedes requireAnyRole", async () => {
    mockGetSession.mockResolvedValue(adminSession);

    const res = await withAuth.request("/admin/role/x");

    expect(res.status).toBe(200);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("still passes the cached user id to userHasPermission", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockUserHasPermission.mockResolvedValue({ success: true });

    await withAuth.request("/admin/perm/x");

    expect(mockUserHasPermission).toHaveBeenCalledWith({
      body: { userId: "u1", permissions: { referee: ["update"] } },
    });
  });

  // The guards must not assume requireAuth ran: mounted alone they fetch the
  // session themselves and populate the context for downstream handlers.
  it("fetches and populates the context when requirePermission is mounted alone", async () => {
    const solo = new Hono<AppEnv>();
    solo.use("/solo/*", requirePermission("referee", "update"));
    solo.get("/solo/x", (c) => c.json({ userId: c.get("user").id, sessionId: c.get("session").id }));

    mockGetSession.mockResolvedValue(adminSession);
    mockUserHasPermission.mockResolvedValue({ success: true });

    const res = await solo.request("/solo/x");

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ userId: "u1", sessionId: "s1" });
  });

  it("fetches and populates the context when requireAnyRole is mounted alone", async () => {
    const solo = new Hono<AppEnv>();
    solo.use("/solo/*", requireAnyRole("admin"));
    solo.get("/solo/x", (c) => c.json({ userId: c.get("user").id, sessionId: c.get("session").id }));

    mockGetSession.mockResolvedValue(adminSession);

    const res = await solo.request("/solo/x");

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ userId: "u1", sessionId: "s1" });
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

describe("requireRefereeSelfOrAdminRole", () => {
  const app = new Hono<AppEnv>();
  app.use("/either/*", requireRefereeSelfOrAdminRole(["admin", "refereeAdmin"]));
  app.get("/either/games", (c) =>
    c.json({ refereeId: c.get("refereeId") ?? null }),
  );

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await app.request("/either/games");
    expect(res.status).toBe(401);
  });

  it("passes a linked referee (no admin role) and scopes to self", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: null, refereeId: 77 },
      session: { id: "s1" },
    });
    const res = await app.request("/either/games");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refereeId: 77 });
  });

  it("passes an admin and leaves refereeId unset (wide view)", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin", refereeId: null },
      session: { id: "s1" },
    });
    const res = await app.request("/either/games");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refereeId: null });
  });

  it("passes a refereeAdmin and leaves refereeId unset (wide view)", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "refereeAdmin", refereeId: null },
      session: { id: "s1" },
    });
    const res = await app.request("/either/games");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refereeId: null });
  });

  it("passes a superadmin and leaves refereeId unset (wide view)", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "superadmin", refereeId: null },
      session: { id: "s1" },
    });
    const res = await app.request("/either/games");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refereeId: null });
  });

  it("returns 403 when user has neither an admin-listed role nor a referee link", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "teamManager", refereeId: null },
      session: { id: "s1" },
    });
    const res = await app.request("/either/games");
    expect(res.status).toBe(403);
  });

  // Role wins over identity: an admin who is also linked as a referee gets the
  // full wide-view scope (refereeId unset) so downstream services don't silently
  // narrow their query to only that referee.
  it("does not set refereeId when user has both an admin role and a refereeId", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin", refereeId: 42 },
      session: { id: "s1" },
    });
    const res = await app.request("/either/games");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refereeId: null });
  });
});

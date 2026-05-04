import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const store = new Map<string, string>();
const ttls = new Map<string, number>();
const expiries = new Map<string, number>();

vi.mock("../config/redis", () => ({
  redis: {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, _ex?: string, ttl?: number) {
      store.set(key, value);
      if (ttl) expiries.set(key, Date.now() + ttl * 1000);
      return "OK";
    },
    async incr(key: string) {
      const next = (Number(store.get(key)) || 0) + 1;
      store.set(key, String(next));
      return next;
    },
    async expire(key: string, seconds: number) {
      ttls.set(key, seconds);
      return 1;
    },
    async del(...keys: string[]) {
      for (const k of keys) store.delete(k);
      return 0;
    },
  },
}));

import {
  trustForwardedFor,
  signInLockout,
  recordAuthFailure,
  clearAuthFailures,
  isLockedOut,
} from "./auth-protect";

beforeEach(() => {
  store.clear();
  ttls.clear();
  expiries.clear();
});

describe("trustForwardedFor", () => {
  it("rewrites x-forwarded-for to the last segment", async () => {
    const app = new Hono();
    app.use("*", trustForwardedFor);
    let captured: string | undefined;
    app.get("/x", (c) => {
      captured = c.req.header("x-forwarded-for");
      return c.text("ok");
    });
    await app.request("/x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" },
    });
    expect(captured).toBe("9.10.11.12");
  });

  it("is a no-op when x-forwarded-for is absent", async () => {
    const app = new Hono();
    app.use("*", trustForwardedFor);
    let captured: string | undefined;
    app.get("/x", (c) => {
      captured = c.req.header("x-forwarded-for");
      return c.text("ok");
    });
    await app.request("/x");
    expect(captured).toBeUndefined();
  });

  it("is a no-op when x-forwarded-for is whitespace-only commas", async () => {
    const app = new Hono();
    app.use("*", trustForwardedFor);
    let captured: string | undefined;
    app.get("/x", (c) => {
      captured = c.req.header("x-forwarded-for");
      return c.text("ok");
    });
    await app.request("/x", { headers: { "x-forwarded-for": " , , " } });
    expect(captured).toBeDefined();
  });
});

describe("auth-protect lockout helpers", () => {
  it("locks out after threshold failures and clears on success", async () => {
    for (let i = 0; i < 9; i++) await recordAuthFailure("a@b.com");
    expect(await isLockedOut("a@b.com")).toBe(false);
    await recordAuthFailure("a@b.com");
    expect(await isLockedOut("a@b.com")).toBe(true);
    await clearAuthFailures("a@b.com");
    expect(await isLockedOut("a@b.com")).toBe(false);
  });

  it("treats email case-insensitively", async () => {
    for (let i = 0; i < 10; i++) await recordAuthFailure("A@B.COM");
    expect(await isLockedOut("a@b.com")).toBe(true);
  });
});

describe("signInLockout middleware", () => {
  function makeApp(handler: (c: { json: (b: unknown, s?: number) => Response }) => Response) {
    const app = new Hono();
    app.use("/api/auth/sign-in/email", signInLockout);
    app.post("/api/auth/sign-in/email", handler);
    return app;
  }

  it("clears failures on 200 response", async () => {
    await recordAuthFailure("user@x.com");
    expect(Number(store.get("auth:fail:user@x.com"))).toBe(1);
    const app = makeApp((c) => c.json({ ok: true }));
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@x.com", password: "p" }),
    });
    expect(res.status).toBe(200);
    expect(store.get("auth:fail:user@x.com")).toBeUndefined();
  });

  it("records failure on 401", async () => {
    const app = makeApp((c) => c.json({ error: "bad" }, 401));
    await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@x.com" }),
    });
    expect(store.get("auth:fail:user@x.com")).toBe("1");
  });

  it("returns 429 when locked out without invoking handler", async () => {
    for (let i = 0; i < 10; i++) await recordAuthFailure("user@x.com");
    const handler = vi.fn(() => new Response("ok"));
    const app = new Hono();
    app.use("/api/auth/sign-in/email", signInLockout);
    app.post("/api/auth/sign-in/email", handler);
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@x.com", password: "p" }),
    });
    expect(res.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes through when body has no email", async () => {
    const app = makeApp((c) => c.json({ ok: true }));
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "p" }),
    });
    expect(res.status).toBe(200);
  });

  it("ignores GET requests", async () => {
    const app = new Hono();
    app.use("/api/auth/sign-in/email", signInLockout);
    app.get("/api/auth/sign-in/email", (c) => c.json({ ok: true }));
    const res = await app.request("/api/auth/sign-in/email");
    expect(res.status).toBe(200);
  });

  it("ignores non-sign-in paths", async () => {
    const app = new Hono();
    app.use("*", signInLockout);
    app.post("/api/auth/other", (c) => c.json({ ok: true }));
    const res = await app.request("/api/auth/other", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("passes through when body is unparseable JSON", async () => {
    const app = new Hono();
    app.use("/api/auth/sign-in/email", signInLockout);
    app.post("/api/auth/sign-in/email", (c) => c.json({ ok: true }));
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(200);
  });

  it("does not record on 500 server errors", async () => {
    const app = new Hono();
    app.use("/api/auth/sign-in/email", signInLockout);
    app.post("/api/auth/sign-in/email", (c) => c.json({ error: "boom" }, 500));
    await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@x.com" }),
    });
    expect(store.get("auth:fail:user@x.com")).toBeUndefined();
  });
});
